// Paylaşılan prompt guard'ı (matchLifecycle 1v1 + tournament wave-gen kullanır).
// Hafif kısıt: yazı/filigran yok + etkinlik için SFW. Tema DAYATMAZ — oyuncunun
// girdisi aynen kullanılır ("a woman" → woman). Tema dışı kalan, referansa
// benzemediği için AI puanlamasında düşük alır (oyun böyle adil).
'use strict';

const SAFETY_SUFFIX = '. No text or watermark, safe for work.';

function buildGuardedPrompt(userText) {
  const desc = (userText && userText.trim()) || 'abstract art';
  return `${desc}${SAFETY_SUFFIX}`;
}

module.exports = { SAFETY_SUFFIX, buildGuardedPrompt };
