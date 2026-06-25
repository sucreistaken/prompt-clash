// lib/game/tournament/schedule.js
// Pure: survivor counts after each cut, applying ~1/4 survival down to 2.
// The final entry is always 2 (the duel handoff size). n<=2 → no rounds.
'use strict';

function buildSchedule(n) {
  const total = Math.floor(Number(n) || 0);
  if (total <= 2) return [];
  const out = [];
  let cur = total;
  while (cur > 2) {
    let next = Math.max(2, Math.round(cur / 4));
    if (next >= cur) next = cur - 1; // defensive: unreachable while next=max(2,round(cur/4)) and cur>2; guards future formula changes
    out.push(next);
    cur = next;
  }
  return out;
}

module.exports = { buildSchedule };
