// Dinamik hedef-üretim motoru.
// Her tur: bir kategori + zorluk seçilir, küratörlü tohum havuzundan bir konsept
// çekilir, Gemini onu canlı bir görsel prompt'a açar. Bu prompt = "gerçek prompt"
// (tur sonunda ifşa edilir). LLM patlarsa tohum doğrudan prompt olur (fallback).

const { expandSeedToPrompt } = require('../gemini/prompt.js');

// Zorluk seviyeleri (TR etiketleri sahnede rozet için).
const DIFFICULTIES = [
  { code: 'easy', labelTr: 'KOLAY' },
  { code: 'medium', labelTr: 'ORTA' },
  { code: 'hard', labelTr: 'ZOR' },
  { code: 'legendary', labelTr: 'EFSANE' }
];

// Kategoriler + küratörlü tohum havuzları (kısa konseptler).
// Zorluk ayrı bir eksen olarak LLM'e verilir; kompleksliği o belirler.
const CATEGORIES = [
  {
    code: 'cinema', labelTr: 'SİNEMA',
    seeds: ['a lone gunslinger at high noon', 'a noir detective in the rain', 'an epic space opera bridge', 'a heist crew frozen mid-action', 'a kaiju towering over a city']
  },
  {
    code: 'animals', labelTr: 'HAYVANLAR',
    seeds: ['an animal doing a human job', 'a fox wearing tiny glasses', 'a majestic lion at sunrise', 'a penguin colony commute', 'an octopus playing chess']
  },
  {
    code: 'fantasy', labelTr: 'FANTEZİ',
    seeds: ['a dragon guarding a library', 'a floating wizard market', 'an enchanted forest gate', 'a knight facing a giant', 'a mermaid city under glass']
  },
  {
    code: 'scifi', labelTr: 'BİLİM-KURGU',
    seeds: ['a derelict spaceship interior', 'a robot tending a garden', 'a neon megacity skyline', 'a terraformed red planet', 'a cybernetic street vendor']
  },
  {
    code: 'food', labelTr: 'YEMEK',
    seeds: ['an impossible towering dessert', 'a ramen bowl as a hot spring', 'a fruit that is also a planet', 'a chef plating on a tiny stage', 'a sushi train through a city']
  },
  {
    code: 'history', labelTr: 'TARİH',
    seeds: ['a medieval marketplace at dawn', 'an ancient library on fire', 'a Roman feast scene', 'an explorer charting a coast', 'a Victorian inventor workshop']
  },
  {
    code: 'nature', labelTr: 'DOĞA',
    seeds: ['a waterfall into glowing mist', 'a desert under aurora', 'a single tree in four seasons', 'a storm rolling over plains', 'a coral reef at golden hour']
  },
  {
    code: 'sports', labelTr: 'SPOR',
    seeds: ['a surfer inside a giant wave', 'a basketball dunk in slow motion', 'a cyclist on a mountain ridge', 'a fencing duel in shadow', 'a skateboarder over a city gap']
  },
  {
    code: 'music', labelTr: 'MÜZİK',
    seeds: ['a violinist made of light', 'a rooftop jazz trio at night', 'a stadium of glowing phones', 'an instrument grown from a tree', 'a DJ in a desert rave']
  },
  {
    code: 'architecture', labelTr: 'MİMARİ',
    seeds: ['an impossible Escher staircase', 'a house on a single rock spire', 'a glass cathedral of plants', 'a bridge between two storms', 'a city carved into a cliff']
  },
  {
    code: 'space', labelTr: 'UZAY',
    seeds: ['an astronaut watching two suns', 'a ringed planet over a desert', 'a nebula shaped like an animal', 'a tiny home on an asteroid', 'a galaxy in a bottle']
  },
  {
    code: 'underwater', labelTr: 'SUALTI',
    seeds: ['a sunken city lit by jellyfish', 'a diver meeting a whale', 'an underwater tea ceremony', 'a coral throne room', 'a submarine garden']
  },
  {
    code: 'mythology', labelTr: 'MİTOLOJİ',
    seeds: ['a phoenix rising from a city', 'a titan asleep as an island', 'a god of storms over the sea', 'a labyrinth and its minotaur', 'a trickster spirit at a crossroads']
  },
  {
    code: 'retro80s', labelTr: 'RETRO 80LER',
    seeds: ['a synthwave car on a neon grid', 'an arcade glowing at midnight', 'a chrome robot mascot', 'a sunset over a vaporwave beach', 'a cassette-tape spaceship']
  },
  {
    code: 'videogames', labelTr: 'OYUN',
    seeds: ['a pixel hero in a real forest', 'a boss arena before the fight', 'a cozy farming village', 'a racing track in the clouds', 'a dungeon treasure room']
  },
  {
    code: 'superhero', labelTr: 'SÜPER-KAHRAMAN',
    seeds: ['a hero landing cracks the street', 'a villain lair reveal', 'a caped figure on a gargoyle', 'a team assembling at dawn', 'a power surge over a city']
  },
  {
    code: 'absurd', labelTr: 'ABSÜRT',
    seeds: ['two unrelated objects merged', 'a teapot leading a parade', 'a banana running a meeting', 'gravity working sideways', 'a cloud wearing sneakers']
  },
  {
    code: 'backrooms', labelTr: 'BACKROOMS',
    seeds: ['an endless yellow office hallway', 'buzzing fluorescent lights over damp carpet', 'a flooded backrooms level', 'an infinite stairwell of identical doors', 'a lone figure in a liminal empty mall at night']
  },
  {
    code: 'horror', labelTr: 'KORKU',
    seeds: ['a tall faceless figure in a black suit watching from the treeline', 'a pale grinning face pressed against the bedroom window at 3am', 'a dark hallway with a figure standing just past the light', 'an empty playground where one swing moves on its own', 'a found photograph with a smile that is far too wide']
  },
  {
    code: 'anime', labelTr: 'ANİME',
    seeds: ['a rooftop sunset confession scene', 'a sword duel under falling sakura', 'a giant mecha in its hangar', 'a cozy witch supply shop', 'a neon street in the rain']
  },
  {
    code: 'memes', labelTr: 'İNTERNET',
    seeds: ['two unrelated objects absurdly merged', 'an exaggerated reaction moment', 'a calm figure in a burning room', 'a badly drawn heroic pose', 'an ironic corporate stock photo']
  },
  {
    code: 'cosmic', labelTr: 'KOZMİK KORKU',
    seeds: ['a colossal eye filling the sky above a fishing village', 'a drowned cyclopean city of impossible angles rising from the sea', 'vast tentacles uncoiling from a torn rift in the clouds', 'a hooded cult gathered before an indescribable idol', 'a lighthouse keeper facing a thing from the black deep']
  },
  {
    code: 'urbanlegend', labelTr: 'ŞEHİR EFSANELERİ',
    seeds: ['a shadowy creature watching from deep in the forest', 'a long serpentine neck rising from a misty lake at dusk', 'a giant footprint in the snow on a mountainside', 'an abandoned train station wrapped in old legend', 'a dark figure standing at the end of a foggy road']
  },
  {
    code: 'cozy', labelTr: 'SEVİMLİ',
    seeds: ['a cozy cat café full of sleeping cats', 'a warm wooden cabin glowing in the snow', 'a rainy window with tea and a curled-up cat', 'a tiny mushroom house in a sunlit forest', 'a soft reading nook piled with blankets and books']
  },
  {
    code: 'fairytale', labelTr: 'MASAL',
    seeds: ['a giant glowing mushroom forest at twilight', 'a flying bed drifting over sleeping rooftops', 'a toy city sparkling under moonlight', 'a dreamlike train station floating in the clouds', 'a paper-boat river through a candy landscape']
  },
  {
    code: 'nostalgia', labelTr: 'NOSTALJİ',
    seeds: ['a childhood bedroom in warm late-afternoon sun', 'an old arcade glowing on a rainy evening', 'a 90s living room with a softly humming TV', 'a summer porch at grandma\'s house', 'a faded polaroid of a backyard in summer']
  },
  {
    code: 'analoghorror', labelTr: 'ANALOG KORKU',
    seeds: ['a distorted VHS test card with a figure hidden in the static', 'a corrupted emergency broadcast warning screen at night', 'a found-tape still of a long empty hallway', 'a glitching old television alone in a dark room', 'a tracking-error frame where something stands too still']
  }
];

function _rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function _findCategory(code) {
  return CATEGORIES.find((c) => c.code === code) || null;
}

// Kategori/zorluk verilmişse onu kullanır; pool/customThemes verilmişse o havuzdan
// çeker; hiçbiri yoksa tüm kategorilerden rastgele seçer. Bir tohum çeker.
function pickRound({ category, difficulty, pool, customThemes } = {}) {
  const diff =
    (difficulty && DIFFICULTIES.find((d) => d.code === difficulty)) || _rand(DIFFICULTIES);

  // 1) Tek kilit kategori (admin override) — geçerliyse her şeyi geçersiz kılar.
  if (category) {
    const locked = _findCategory(category);
    if (locked) {
      return { category: locked.code, difficulty: diff.code, seed: _rand(locked.seeds) };
    }
    // bilinmeyen kod → yok say, aşağı düş.
  }

  // 2) Host-küratörlü havuz: hazır kategoriler + serbest-metin custom temalar.
  const builtins = Array.isArray(pool) ? pool.map(_findCategory).filter(Boolean) : [];
  const customs = Array.isArray(customThemes)
    ? customThemes.map((t) => (typeof t === 'string' ? t.trim() : '')).filter(Boolean)
    : [];

  if (builtins.length || customs.length) {
    const candidates = [
      ...builtins.map((c) => ({ kind: 'builtin', cat: c })),
      ...customs.map((text) => ({ kind: 'custom', text }))
    ];
    const pick = _rand(candidates);
    if (pick.kind === 'builtin') {
      return { category: pick.cat.code, difficulty: diff.code, seed: _rand(pick.cat.seeds) };
    }
    return { category: 'custom', difficulty: diff.code, seed: pick.text };
  }

  // 3) Varsayılan: tüm kategoriler üzerinden tam rastgele.
  const cat = _rand(CATEGORIES);
  return { category: cat.code, difficulty: diff.code, seed: _rand(cat.seeds) };
}

// Bir room'un kategori ayarlarından pickRound argümanlarını kurar.
// HOST_SELECTED modunda havuz/custom temaları geçer; diğer modlarda geçmez
// (tam rastgele). lockedCategory her zaman override olarak taşınır.
function roundArgsForRoom(room) {
  const hostSelected = room && room.categoryMode === 'HOST_SELECTED';
  return {
    category: (room && room.lockedCategory) || undefined,
    difficulty: (room && room.lockedDifficulty) || undefined,
    pool: hostSelected ? room.categoryPool : undefined,
    customThemes: hostSelected ? room.customThemes : undefined
  };
}

// Bir tur için gerçek prompt üretir (TR + EN). LLM patlarsa tohumu doğrudan
// her iki dile fallback olarak koyar — küçük UX bozulması, nadir bir durum.
async function generateTargetPrompt(round) {
  const r = round || pickRound();
  try {
    const { promptEn, promptTr } = await expandSeedToPrompt(r);
    return { ...r, promptEn, promptTr };
  } catch (err) {
    console.warn('[target] LLM expansion failed, using seed as prompt:', err.message);
    return { ...r, promptEn: r.seed, promptTr: r.seed };
  }
}

function difficultyLabel(code) {
  return DIFFICULTIES.find((d) => d.code === code)?.labelTr || '';
}

function categoryLabel(code) {
  if (code === 'custom') return 'ÖZEL';
  return _findCategory(code)?.labelTr || '';
}

module.exports = {
  CATEGORIES,
  DIFFICULTIES,
  pickRound,
  roundArgsForRoom,
  generateTargetPrompt,
  difficultyLabel,
  categoryLabel
};
