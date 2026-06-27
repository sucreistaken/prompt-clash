// Gemini Vision skorlama: referans görseli + A + B görselleri verilir,
// strict JSON döndürür: {"a": 0-100, "b": 0-100, "reasoning": "..."}.

const { timeoutMs, withTimeout } = require('../async.js');
const { withKeyFailover } = require('./keyRotator.js');

const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash-lite';

async function _fetchAsInline(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs('IMAGE_FETCH', 10000));
  let res;
  try {
    res = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get('content-type') || 'image/png';
  return { inlineData: { data: buf.toString('base64'), mimeType } };
}

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

function _parseJson(text) {
  const cleaned = text.replace(/```json|```/g, '').trim();
  // İlk dengeli {...} nesnesini çıkar (string içindeki süslü parantezleri sayma).
  const start = cleaned.indexOf('{');
  if (start === -1) throw new Error('no JSON in response');
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return JSON.parse(cleaned.slice(start, i + 1));
    }
  }
  throw new Error('no complete JSON object in response');
}

async function scoreVsReference(refUrl, aUrl, bUrl, opts = {}) {
  const { nameA, nameB } = opts;
  const systemPrompt = buildSystemPrompt(nameA, nameB);
  // Görselleri bir kere indir; key failover sırasında tekrar indirme.
  const [ref, a, b] = await Promise.all([
    _fetchAsInline(refUrl),
    _fetchAsInline(aUrl),
    _fetchAsInline(bUrl)
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
            a,
            { text: 'IMAGE_B:' },
            b
          ]
        }
      ]
    }), timeoutMs('GEMINI_SCORE', 30000), 'Gemini scoring');

    const text = result?.response?.text?.() || '';
    let parsed;
    try {
      parsed = _parseJson(text);
    } catch (err) {
      throw new Error(`score parse failed: ${err.message}; raw=${text.slice(0, 200)}`);
    }

    const a0 = clamp(parsed.a, 0, 100);
    const b0 = clamp(parsed.b, 0, 100);
    // Kazanan: AI'nın açık tercihi; yoksa skora göre; eşitlikte A.
    let winner = String(parsed.winner || '').toLowerCase();
    if (winner !== 'a' && winner !== 'b') winner = b0 > a0 ? 'b' : 'a';
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
