'use strict';

// N-way roster scorer. DEMO_MODE returns deterministic, near-unique fakes so
// the elimination engine is fully testable headlessly. The real path scores
// each entrant on an ABSOLUTE 0-100 similarity scale vs the reference, in
// batched multi-image Gemini calls (cheaper than O(N^2) pairwise), then merges
// into one descending-ordered list. Returns [{ entrantId, score }].

const { timeoutMs, withTimeout } = require('../../async.js');
const { withKeyFailover } = require('../../gemini/keyRotator.js');
const { fetchAsInline, parseFirstJson } = require('../../gemini/_util.js');
const { shortRoomId } = require('../roomRegistry.js');

const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash-lite';

function _batchSystemPrompt(n) {
  return `You are an impartial judge for an AI image-generation contest.
You receive a REFERENCE image, then ${n} candidate image(s) labeled IMAGE_1..IMAGE_${n}.
For EACH candidate, score from 0 to 100 how closely it resembles the REFERENCE,
judging subject, composition, colors and lighting/mood.
Judge each candidate INDEPENDENTLY on an absolute scale — do not force a ranking
or an even spread; two candidates may legitimately get the same score.
Still, use the FULL 0-100 range and be decisive: a candidate that clearly misses
the reference's subject or mood should score low (10-40); a near-match should
score high (80+). Don't bunch every candidate in the 70s-80s.
Return STRICT JSON only, no prose:
{"scores": [{"i": <1-based index>, "score": <0-100 integer>}, ...]}
Include exactly one entry per candidate image.`;
}

function _clamp(n, lo, hi) {
  n = Number(n);
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function _hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Bir batch'i puanla: REFERENCE + IMAGE_1..K → her index için 0-100.
// Dönüş: Map<index(1-based), score>. Tüm batch başarısızsa boş Map.
async function _scoreBatch(roomId, refInline, batch) {
  const n = batch.length;
  const systemPrompt = _batchSystemPrompt(n);
  const parts = [{ text: systemPrompt }, { text: 'REFERENCE:' }, refInline];
  for (let j = 0; j < n; j++) {
    parts.push({ text: `IMAGE_${j + 1}:` });
    parts.push(batch[j].inline);
  }

  const out = new Map();
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const parsed = await withKeyFailover(async (client) => {
        const gen = client.getGenerativeModel({
          model: TEXT_MODEL,
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
        });
        const result = await withTimeout(
          gen.generateContent({ contents: [{ role: 'user', parts }] }),
          timeoutMs('GEMINI_SCORE', 30000),
          'Gemini roster scoring'
        );
        const text = result?.response?.text?.() || '';
        return parseFirstJson(text);
      });
      const scores = Array.isArray(parsed?.scores) ? parsed.scores : [];
      for (const s of scores) {
        const i = Number(s?.i);
        if (Number.isInteger(i) && i >= 1 && i <= n) out.set(i, _clamp(s.score, 0, 100));
      }
      return out;
    } catch (err) {
      lastErr = err;
      console.warn(
        `[tournament:${shortRoomId(roomId)}] roster batch attempt ${attempt + 1} failed:`,
        err.message
      );
    }
  }
  console.warn(
    `[tournament:${shortRoomId(roomId)}] roster batch failed permanently:`,
    lastErr?.message || 'unknown'
  );
  return out; // boş → çağıran tarafı eksikleri 0'a düşürür
}

async function scoreRoster(roomId, referenceImageUrl, entrants) {
  if (process.env.DEMO_MODE === '1') {
    return entrants
      .map((e, i) => ({
        entrantId: e.entrantId,
        // deterministic spread 40..98, decreasing by index, jittered by id hash
        score: 98 - i - (_hash(e.entrantId) % 5)
      }))
      .sort((x, y) => y.score - x.score);
  }

  // Forfeit (görseli olmayan / demo) entrant'lar → 0; gerçek puanlamaya sokma.
  const results = new Map(); // entrantId -> score
  const scorable = [];
  for (const e of entrants) {
    const url = e.lastImageUrl;
    if (!url || String(url).startsWith('demo://')) {
      results.set(e.entrantId, 0);
    } else {
      scorable.push(e);
    }
  }

  if (scorable.length > 0 && !referenceImageUrl) {
    // Reference image absent (gen failed/skipped) — forfeit every scorable entrant
    // to 0 instead of throwing, so a missing target can't reject the whole round.
    console.warn(
      `[tournament:${shortRoomId(roomId)}] no referenceImageUrl — ${scorable.length} entrant(s) forfeited to 0`
    );
    for (const e of scorable) results.set(e.entrantId, 0);
  } else if (scorable.length > 0) {
    // Reference present but maybe unfetchable (404 / network / IMAGE_FETCH timeout).
    // Guard it like the per-candidate fetches below: on failure forfeit all to 0
    // rather than letting the throw unwind and wedge the round in SCORING.
    let refInline = null;
    try {
      refInline = await fetchAsInline(referenceImageUrl);
    } catch (err) {
      console.warn(
        `[tournament:${shortRoomId(roomId)}] reference fetch failed (${err.message}) — ${scorable.length} entrant(s) forfeited to 0`
      );
      for (const e of scorable) results.set(e.entrantId, 0);
    }

    if (refInline) {
      // Görselleri inline indir; indirilemeyen entrant → 0 (batch'e sokma).
      const ready = [];
      for (const e of scorable) {
        try {
          const inline = await fetchAsInline(e.lastImageUrl);
          ready.push({ entrant: e, inline });
        } catch (err) {
          console.warn(
            `[tournament:${shortRoomId(roomId)}] fetch fail ${e.entrantId}: ${err.message}`
          );
          results.set(e.entrantId, 0);
        }
      }

      const batchSize = Number(process.env.TOURNAMENT_SCORE_BATCH) || 5;
      for (let i = 0; i < ready.length; i += batchSize) {
        const batch = ready.slice(i, i + batchSize);
        const scores = await _scoreBatch(roomId, refInline, batch);
        batch.forEach((item, j) => {
          // Index 1-based; batch sonucu yoksa düşük güvenli 0.
          const score = scores.has(j + 1) ? scores.get(j + 1) : 0;
          results.set(item.entrant.entrantId, score);
        });
      }
    }
  }

  // Azalan sırala; eşit skorları id-stabil hash ile kır (eleme deterministik).
  return entrants
    .map((e) => ({ entrantId: e.entrantId, score: results.get(e.entrantId) ?? 0 }))
    .sort((x, y) => y.score - x.score || _hash(x.entrantId) - _hash(y.entrantId));
}

module.exports = { scoreRoster };
