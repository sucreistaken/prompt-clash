// Offline doğrulama: translateToEnglish'in yeni sözleşmesi.
// - İngilizce girdi: API'ye gitmeden aynen döner.
// - İngilizce-OLMAYAN girdi + çeviri erişilemez (key yok): FIRLATIR.
//   => çağıran ham Türkçe'yi görsel modeline yollamaz, forfeit eder.
// Ağ/Gemini key gerektirmez. Çalıştır: node scripts/translateFallbackCheck.js
'use strict';

// Key'siz ortam: _loadClients 'GEMINI_API_KEY is not set' fırlatır.
delete process.env.GEMINI_API_KEY;
for (let i = 2; i < 10; i++) delete process.env[`GEMINI_API_KEY_${i}`];
// Retry beklemelerini kısalt (test hızlı bitsin).
process.env.GEMINI_TRANSLATE_TIMEOUT_MS = process.env.GEMINI_TRANSLATE_TIMEOUT_MS || '2000';

const { translateToEnglish } = require('../lib/gemini/prompt.js');

let failures = 0;
const ok = (m) => console.log(`  PASS: ${m}`);
const bad = (m) => { failures++; console.error(`  FAIL: ${m}`); };

async function main() {
  // 1) İngilizce girdi → aynen döner, fırlatmaz, key gerekmez.
  const enIn = 'a black cat resting on an old apothecary table, candlelight';
  try {
    const out = await translateToEnglish(enIn);
    if (out === enIn) ok('English passes through unchanged (no API call)');
    else bad(`English changed unexpectedly: ${out}`);
  } catch (e) {
    bad(`English input threw: ${e.message}`);
  }

  // 2) Türkçe girdi + key yok → FIRLATMALI (çağıran forfeit edecek).
  const trIn = 'ortada kocaman parlak portakal var, 3 yeşil yaprağı ve siyah dolunay';
  try {
    const out = await translateToEnglish(trIn);
    bad(`Turkish input did NOT throw; returned raw → buggy fallback: ${out}`);
  } catch (e) {
    ok(`Turkish input throws when translate unavailable (${e.message.slice(0, 40)}...)`);
  }

  // 3) Boş girdi → boş döner (üretim tarafı zaten 'abstract art'a düşer).
  try {
    const out = await translateToEnglish('   ');
    if (out === '') ok('blank input returns empty without throwing');
    else bad(`blank input returned: ${JSON.stringify(out)}`);
  } catch (e) {
    bad(`blank input threw: ${e.message}`);
  }

  if (failures) {
    console.error(`\n${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log('\nAll checks passed.');
}

main();
