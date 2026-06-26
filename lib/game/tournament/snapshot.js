// lib/game/tournament/snapshot.js
'use strict';
function tournamentSnapshot(room) {
  const t = room.tournament;
  if (!t) return null;
  const ents = Object.values(t.entrants);
  const byId = (id) => (id && t.entrants[id] ? { entrantId: id, nickname: t.entrants[id].nickname } : null);
  return {
    phase: t.phase,
    roundIndex: t.roundIndex,
    roundCount: (t.schedule || []).length,
    activeCount: t.activeIds.length,
    totalCount: ents.length,
    topic: t.topic ? { promptTr: t.topic.promptTr } : null,
    champion: byId(t.champion),
    finalists: t.finalIds ? t.finalIds.map(byId).filter(Boolean) : null,
    roster: ents.map((e) => ({ entrantId: e.entrantId, nickname: e.nickname, eliminated: e.eliminated, lastScore: e.lastScore })),
    mode: t.mode || 'A'
  };
}
module.exports = { tournamentSnapshot };
