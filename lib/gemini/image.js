// Gemini görsel üretimi.
// Model: GEMINI_IMAGE_MODEL (default gemini-2.5-flash-image)
// 3x retry, exponential backoff.

const { timeoutMs, withTimeout } = require('../async.js');
const { withKeyFailover } = require('./keyRotator.js');

const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';

// Çoklu key rotasyonu + quota failover ile üret (scoring/prompt ile tutarlı):
// bir key 429/quota verirse otomatik sıradakine geçer.
async function _generateOnce(prompt) {
  return withKeyFailover(async (client) => {
    const gen = client.getGenerativeModel({ model: IMAGE_MODEL });
    const result = await gen.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });

    const candidates = result?.response?.candidates || [];
    for (const cand of candidates) {
      const parts = cand?.content?.parts || [];
      for (const p of parts) {
        if (p.inlineData?.data) {
          const buf = Buffer.from(p.inlineData.data, 'base64');
          return { buffer: buf, mimeType: p.inlineData.mimeType || 'image/png' };
        }
      }
    }
    throw new Error('Gemini response had no image');
  });
}

async function generateImage(prompt, { retries = 3 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const ms = timeoutMs('GEMINI_IMAGE', 45000);
      return await withTimeout(_generateOnce(prompt), ms, 'Gemini image generation');
    } catch (err) {
      lastErr = err;
      const backoff = Math.pow(2, attempt) * 1000;
      console.warn(`[gemini.image] attempt ${attempt + 1} failed:`, err.message);
      if (attempt < retries - 1) await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr || new Error('image generation failed');
}

module.exports = { generateImage };
