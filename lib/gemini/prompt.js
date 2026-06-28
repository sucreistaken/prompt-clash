// Gemini metin: bir tohum konsepti + kategori + zorluk alıp,
// görsel üretimine uygun canlı/somut tek sahnelik bir prompt yazar.
// Strict JSON döndürür: {"prompt": "..."}.

const { timeoutMs, withTimeout } = require('../async.js');
const { withKeyFailover } = require('./keyRotator.js');
const { parseFirstJson } = require('./_util.js');
const expansionCache = require('./expansionCache.js');

const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash-lite';

const DIFFICULTY_GUIDE = {
  easy: 'Easy: one iconic subject, simple clean composition, easy to guess in a few words.',
  medium: 'Medium: a subject plus a setting and a clear visual style.',
  hard: 'Hard: a compound concept combining multiple specific elements and a distinctive style.',
  legendary: 'Legendary: a rare, surprising, meme-worthy mashup that is hard to guess yet coherent.'
};

const SYSTEM_PROMPT = `You invent target images for a "guess the prompt" party game.
Given a CATEGORY, a DIFFICULTY and a short SEED concept, write ONE vivid, concrete
single-scene description in TWO languages: English (for the image generator) and
Turkish (for Turkish-speaking players who will read it on the result screen).
Rules:
- Each language: one or two sentences, concrete and visual (subject, setting, lighting, style).
- The Turkish version must describe the SAME scene as the English one — natural Turkish,
  not a literal word-for-word translation. Read like a human-written description.
- Match the requested difficulty complexity.
- Be fun and surprising but coherent; safe for work; no real public figures.
- Do NOT include any text, words, captions or watermarks in the described image.
Return STRICT JSON only, no prose: {"promptEn": "<english prompt>", "promptTr": "<turkish prompt>"}`;

// Tohumu canlı bir görsel prompt'a açar. Aynı (category,difficulty,seed) için
// disk cache'ten okur — quota tasarrufu. Başarısızlıkta üst katman fallback yapar.
async function expandSeedToPrompt({ category, difficulty, seed }) {
  const cached = expansionCache.get({ category, difficulty, seed });
  if (cached) {
    console.log(`[expansion] cache hit ${category}:${difficulty}:${seed}`);
    return cached;
  }

  const diffGuide = DIFFICULTY_GUIDE[difficulty] || DIFFICULTY_GUIDE.medium;
  const userText = `CATEGORY: ${category}\nDIFFICULTY: ${difficulty}\n${diffGuide}\nSEED: ${seed}`;

  const result = await withKeyFailover(async (client) => {
    const gen = client.getGenerativeModel({
      model: TEXT_MODEL,
      generationConfig: { responseMimeType: 'application/json', temperature: 1.0 }
    });

    const res = await withTimeout(
      gen.generateContent({
        contents: [{ role: 'user', parts: [{ text: SYSTEM_PROMPT }, { text: userText }] }]
      }),
      timeoutMs('GEMINI_PROMPT', 20000),
      'Gemini prompt expansion'
    );

    const text = res?.response?.text?.() || '';
    const parsed = parseFirstJson(text);
    const promptEn = String(parsed.promptEn || parsed.prompt || '').trim();
    const promptTr = String(parsed.promptTr || '').trim();
    if (!promptEn) throw new Error('empty promptEn in response');
    if (!promptTr) throw new Error('empty promptTr in response');
    return { promptEn, promptTr };
  });

  expansionCache.set({ category, difficulty, seed }, result);
  return result;
}

// Sık Türkçe işlev sözcükleri — özel Türkçe karakter içermeyen ("bir adam denizde
// at biniyor" gibi) cümleleri yakalamak için. Biri bile geçerse İngilizce sayma.
const TR_STOPWORDS = new Set([
  'bir', 've', 'ile', 'bu', 'şu', 'su', 'çok', 'cok', 'var', 'yok', 'için', 'icin',
  'gibi', 'daha', 'ama', 'veya', 'de', 'da', 'ki', 'ben', 'sen', 'biz', 'siz',
  'onlar', 'ne', 'kim', 'nasıl', 'nasil', 'neden', 'her', 'hep', 'çünkü', 'cunku',
  'kadar', 'sonra', 'önce', 'once', 'üzerinde', 'uzerinde', 'altında', 'altinda',
  'yanında', 'yaninda', 'içinde', 'icinde', 'olan', 'olarak', 'biniyor', 'duran'
]);

// Metin zaten İngilizce mi? Türkçe sayılırsa çeviriye düşeriz (ucuz; "already
// English ise değiştirme" talimatı yanlış pozitifi zaten yutar). Riskli durumda
// çeviriyi tercih ederiz — yanlış negatif (gereksiz çeviri) yanlış pozitiften
// (Türkçe'yi flux'a ham göndermek) daha az zararlı.
function _isLikelyEnglish(text) {
  if (!text) return false;
  if (/[ığüşöçİĞÜŞÖÇâîû]/i.test(text)) return false;
  // Özel karaktersiz Türkçe: işlev sözcüğü geçiyorsa İngilizce sayma.
  const words = text.toLowerCase().match(/[a-zçğıöşü]+/gi) || [];
  for (const w of words) {
    if (TR_STOPWORDS.has(w)) return false;
  }
  const asciiCount = (text.match(/[\x20-\x7E]/g) || []).length;
  return asciiCount / text.length >= 0.95;
}

// Oyuncu prompt'unu görsel üretimi için İngilizce'ye çevirir. Görsel modelleri
// (flux vb.) İngilizce'de çok daha iyi sonuç verir. Başarısızlıkta orijinal döner.
async function translateToEnglish(text) {
  const t = String(text || '').trim();
  if (!t) return t;
  if (_isLikelyEnglish(t)) {
    console.log('[translate] skip (already English):', t.slice(0, 60));
    return t;
  }
  return withKeyFailover(async (client) => {
    const gen = client.getGenerativeModel({
      model: TEXT_MODEL,
      generationConfig: { temperature: 0 }
    });
    const result = await withTimeout(
      gen.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Translate this image description to English for an image generator. Output ONLY the translation, no quotes or notes. If it is already English, return it unchanged.\n\n${t}`
              }
            ]
          }
        ]
      }),
      timeoutMs('GEMINI_TRANSLATE', 12000),
      'Gemini translate'
    );
    const out = String(result?.response?.text?.() || '').trim();
    return out || t;
  });
}

module.exports = { expandSeedToPrompt, translateToEnglish };
