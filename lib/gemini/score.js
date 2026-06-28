// Gemini Vision skorlama: referans görseli + A + B görselleri verilir,
// strict JSON döndürür: {"a": 0-100, "b": 0-100, "reasoning": "..."}.

const { timeoutMs, withTimeout } = require('../async.js');
const { withKeyFailover } = require('./keyRotator.js');
const { fetchAsInline, parseFirstJson } = require('./_util.js');

const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash-lite';

// İki dilde (TR+EN) reasoning ister ve yarışmacılara A/B yerine ADLARIYLA atıfta
// bulunmasını söyler (UI'da "Image A/B" karışıklığını kökten önler).
function buildSystemPrompt(nameA, nameB) {
  const A = nameA || 'A';
  const B = nameB || 'B';
  return `You are an impartial judge for an AI image-generation duel.
You receive three images in order: REFERENCE, IMAGE_A, IMAGE_B.
IMAGE_A was made by the contestant named "${A}". IMAGE_B was made by the contestant named "${B}".
For each of A and B, score how closely it resembles REFERENCE on a 0-100 scale.
Consider composition, subject, colors, mood, and overall similarity.
You MUST pick a single winner ("a" or "b"). Ties are NOT allowed — even if the
images are very close, decide which one is closer and break any tie yourself.
In the reasoning, refer to the contestants by their NAMES (${A}, ${B}) — never as
"Image A"/"Image B". Provide the reasoning in BOTH Turkish and English, each a
single short sentence.
Return STRICT JSON only, no prose:
{"a": <0-100 integer>, "b": <0-100 integer>, "winner": "a" | "b", "reasoning_tr": "<bir kısa cümle, Türkçe>", "reasoning_en": "<one short sentence, English>"}`;
}

async function scoreVsReference(refUrl, aUrl, bUrl, opts = {}) {
  const { nameA, nameB } = opts;
  // Pozisyon yanlılığını kır: LLM jüriler ilk gösterilen görsele meyleder.
  // Fiziksel sırayı rastgele çevir; AI'nın "a"/"b" kararını mantıksal A/B'ye
  // geri eşle. (Math.random sadece burada lokal — epoch guard'ı etkilemez.)
  const flip = Math.random() < 0.5;
  // Fiziksel "first"=IMAGE_A, "second"=IMAGE_B. flip ise mantıksal B önce gider.
  const firstName = flip ? nameB : nameA;
  const secondName = flip ? nameA : nameB;
  const firstUrl = flip ? bUrl : aUrl;
  const secondUrl = flip ? aUrl : bUrl;
  const systemPrompt = buildSystemPrompt(firstName, secondName);

  // Görselleri bir kere indir; key failover sırasında tekrar indirme.
  const [ref, first, second] = await Promise.all([
    fetchAsInline(refUrl),
    fetchAsInline(firstUrl),
    fetchAsInline(secondUrl)
  ]);

  return withKeyFailover(async (client) => {
    const gen = client.getGenerativeModel({
      model: TEXT_MODEL,
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
    });

    const result = await withTimeout(gen.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            { text: systemPrompt },
            { text: 'REFERENCE:' },
            ref,
            { text: 'IMAGE_A:' },
            first,
            { text: 'IMAGE_B:' },
            second
          ]
        }
      ]
    }), timeoutMs('GEMINI_SCORE', 30000), 'Gemini scoring');

    const text = result?.response?.text?.() || '';
    let parsed;
    try {
      parsed = parseFirstJson(text);
    } catch (err) {
      throw new Error(`score parse failed: ${err.message}; raw=${text.slice(0, 200)}`);
    }

    // Fiziksel puanlar (first/second), ardından mantıksal A/B'ye geri eşlenir.
    const firstScore = clamp(parsed.a, 0, 100);
    const secondScore = clamp(parsed.b, 0, 100);
    // Fiziksel kazanan: AI tercihi; yoksa skora göre; eşitlikte rastgele kır.
    let pWinner = String(parsed.winner || '').toLowerCase();
    if (pWinner !== 'a' && pWinner !== 'b') {
      if (firstScore > secondScore) pWinner = 'a';
      else if (secondScore > firstScore) pWinner = 'b';
      else pWinner = Math.random() < 0.5 ? 'a' : 'b';
    }

    // Geri eşleme: flip ise fiziksel first = mantıksal B.
    const a0 = flip ? secondScore : firstScore;
    const b0 = flip ? firstScore : secondScore;
    let winner;
    if (flip) winner = pWinner === 'a' ? 'b' : 'a';
    else winner = pWinner;

    // İki dilli reasoning; biri boşsa diğerine (ya da legacy `reasoning`) düşer.
    const legacy = String(parsed.reasoning || '');
    const reasoningTr = String(parsed.reasoning_tr || '') || legacy;
    const reasoningEn = String(parsed.reasoning_en || '') || legacy;
    return { a: a0, b: b0, winner, reasoningTr, reasoningEn };
  });
}

function clamp(n, lo, hi) {
  n = Number(n);
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

module.exports = { scoreVsReference };
