// Pure group-partition helpers for Tournament Mode B.
// No I/O, no side-effects — safe to require() from anywhere.
// CommonJS (.js) — no transpile step.
'use strict';

const GROUP_TARGET = 20; // ideal group size
const GROUP_MIN = 4; // smallest allowed group

/**
 * partitionGroups(ids, opts?) -> string[][]
 *
 * Splits `ids` into balanced groups of approximately `target` (default GROUP_TARGET).
 * Rules:
 *  - groupCount = Math.max(1, Math.round(n / target))
 *  - If groupCount < 2 and n >= 2 * GROUP_MIN, bump to 2 (splittable rosters form groups).
 *  - Cap groupCount so no group is smaller than GROUP_MIN.
 *  - Sizes differ by at most 1 (first `rem` groups get one extra).
 *  - Deterministic: chunks in input order.
 *
 * Examples:
 *   partitionGroups(100 ids) → 5 groups of 20
 *   partitionGroups(8 ids)   → 2 groups of 4
 *   partitionGroups(1 id)    → 1 group of 1
 */
function partitionGroups(ids, { target = GROUP_TARGET } = {}) {
  const n = ids.length;
  if (n <= 1) return [ids.slice()];

  let groupCount = Math.max(1, Math.round(n / target));

  // Ensure splittable rosters form >= 2 groups so the group phase is meaningful.
  if (groupCount < 2 && n >= 2 * GROUP_MIN) groupCount = 2;

  // Cap so no group is smaller than GROUP_MIN.
  groupCount = Math.min(groupCount, Math.max(1, Math.floor(n / GROUP_MIN)));

  const base = Math.floor(n / groupCount);
  const rem = n % groupCount; // first `rem` groups get one extra slot

  const out = [];
  let i = 0;
  for (let g = 0; g < groupCount; g++) {
    const size = base + (g < rem ? 1 : 0);
    out.push(ids.slice(i, i + size));
    i += size;
  }
  return out;
}

/**
 * topKForGroup(groupSize) -> number
 * How many entrants advance from a group (≈ ceil(groupSize / 4), min 1).
 */
function topKForGroup(groupSize) {
  return Math.max(1, Math.ceil(groupSize / 4));
}

/**
 * wildcardCount(totalGroups) -> number
 * How many eliminated entrants are rescued as wildcards (min(3, totalGroups)).
 */
function wildcardCount(totalGroups) {
  return Math.min(3, totalGroups);
}

module.exports = { partitionGroups, topKForGroup, wildcardCount, GROUP_TARGET, GROUP_MIN };
