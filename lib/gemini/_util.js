// Paylaşılan Gemini yardımcıları (score.js, prompt.js, scoreRoster.js kullanır).
//  - fetchAsInline: bir görsel URL'ini indirip Gemini inlineData part'ına çevirir.
//  - parseFirstJson: yanıttaki ilk dengeli JSON değerini ({...} veya [...]) çıkarır
//    (string içindeki süslü/köşeli parantezleri saymaz; markdown fence'leri temizler).

const { timeoutMs } = require('../async.js');

async function fetchAsInline(url) {
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

function parseFirstJson(text) {
  const cleaned = String(text || '').replace(/```json|```/g, '').trim();
  // İlk açılış parantezi: nesne mi dizi mi?
  let start = -1;
  let open = '{';
  let close = '}';
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (c === '{' || c === '[') {
      start = i;
      open = c;
      close = c === '{' ? '}' : ']';
      break;
    }
  }
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
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return JSON.parse(cleaned.slice(start, i + 1));
    }
  }
  throw new Error('no complete JSON value in response');
}

module.exports = { fetchAsInline, parseFirstJson };
