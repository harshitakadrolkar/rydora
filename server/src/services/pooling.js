// MULTI-PASSENGER RIDE POOLING - compatibility, grouping and stop-sequence optimisation.
import { roadKm, haversine, bearing, bearingDiff, etaMinutes, round, randomPointNear, ZONES, zoneOf, seededRandom } from '../utils/geo.js';
import { estimateFare } from './pricing.js';

export const POOL_RULES = {
  maxRiders: 3,
  maxPickupGapKm: 3.0,      // pickups must be close to each other
  maxBearingDiff: 45,       // travelling in a similar direction
  maxDetourRatio: 1.45,     // pooled in-vehicle distance <= 1.45 x solo distance
  maxExtraMinutes: 12,
};

/**
 * Enumerate all stop orders (pickup before drop for every rider) and return the
 * shortest feasible one.
 * riders: [{ id, pickup, drop, picked (already in car), soloKm }]
 */
export function bestSequence(start, riders, rules = POOL_RULES) {
  const stops = [];
  for (const r of riders) {
    if (!r.picked) stops.push({ type: 'pickup', riderId: r.id, point: r.pickup });
    stops.push({ type: 'drop', riderId: r.id, point: r.drop });
  }
  let best = null;
  const used = new Array(stops.length).fill(false);
  const order = [];
  const picked = new Set(riders.filter((r) => r.picked).map((r) => r.id));

  const evaluate = () => {
    let pos = start; let total = 0;
    const onboardAt = {}; const ride = {};
    for (const r of riders) if (r.picked) onboardAt[r.id] = 0;
    for (const s of order) {
      total += roadKm(pos, s.point); pos = s.point;
      if (s.type === 'pickup') onboardAt[s.riderId] = total;
      else ride[s.riderId] = total - onboardAt[s.riderId];
    }
    for (const r of riders) {
      const solo = r.soloKm ?? roadKm(r.pickup, r.drop);
      const allowed = r.picked ? (r.remainingKm ?? solo) * rules.maxDetourRatio : solo * rules.maxDetourRatio;
      if (ride[r.id] > Math.max(allowed, solo + 1.5)) return;
    }
    if (!best || total < best.totalKm) best = { totalKm: total, sequence: order.slice(), riderKm: { ...ride } };
  };
  const dfs = () => {
    if (order.length === stops.length) return evaluate();
    for (let i = 0; i < stops.length; i++) {
      if (used[i]) continue;
      const s = stops[i];
      if (s.type === 'drop' && !picked.has(s.riderId)) continue;
      used[i] = true; order.push(s);
      const added = s.type === 'pickup' && !picked.has(s.riderId);
      if (added) picked.add(s.riderId);
      dfs();
      if (added) picked.delete(s.riderId);
      order.pop(); used[i] = false;
    }
  };
  dfs();
  if (best) best.totalKm = round(best.totalKm);
  return best;
}

/** Pairwise compatibility between two requests. */
export function compatibility(a, b, rules = POOL_RULES) {
  const pickupGap = haversine(a.pickup, b.pickup) * 1.3;
  const dirDiff = bearingDiff(bearing(a.pickup, a.drop), bearing(b.pickup, b.drop));
  const ok = pickupGap <= rules.maxPickupGapKm && dirDiff <= rules.maxBearingDiff;
  return { ok, pickupGapKm: round(pickupGap), directionDiffDeg: Math.round(dirDiff), score: ok ? (1 - pickupGap / rules.maxPickupGapKm) * 0.5 + (1 - dirDiff / rules.maxBearingDiff) * 0.5 : 0 };
}

function groupSummary(group, hour, idx) {
  const riders = group.map((r) => ({ id: r.id, pickup: r.pickup, drop: r.drop, soloKm: roadKm(r.pickup, r.drop) }));
  const seq = group.length > 1 ? bestSequence(group[0].pickup, riders) : { totalKm: riders[0].soloKm, sequence: [{ type: 'pickup', riderId: riders[0].id, point: riders[0].pickup }, { type: 'drop', riderId: riders[0].id, point: riders[0].drop }], riderKm: { [riders[0].id]: riders[0].soloKm } };
  const pooled = group.length > 1;
  const members = group.map((r) => {
    const soloKm = roadKm(r.pickup, r.drop);
    const soloMin = etaMinutes(soloKm, hour);
    const inCarKm = seq.riderKm[r.id] ?? soloKm;
    const pooledMin = etaMinutes(inCarKm, hour);
    const soloFare = estimateFare({ distanceKm: soloKm, durationMin: soloMin, category: 'sedan' }).total;
    const pooledFare = pooled ? estimateFare({ distanceKm: soloKm, durationMin: soloMin, category: 'sedan', pool: true, matched: true }).total : soloFare;
    return {
      id: r.id, name: r.name, pickup: r.pickup, drop: r.drop,
      soloKm: round(soloKm), soloMin: round(soloMin, 1), pooledKm: round(inCarKm), pooledMin: round(pooledMin, 1),
      extraMin: round(pooledMin - soloMin, 1), soloFare, pooledFare, savings: soloFare - pooledFare,
      savingsPct: round(((soloFare - pooledFare) / soloFare) * 100, 1),
    };
  });
  const individualKm = members.reduce((s, m) => s + m.soloKm, 0);
  return {
    groupId: `G${idx + 1}`, pooled, size: group.length, members,
    sequence: seq.sequence.map((s) => ({ type: s.type, riderId: s.riderId, name: group.find((g) => g.id === s.riderId)?.name, point: s.point })),
    pooledKm: seq.totalKm, individualKm: round(individualKm),
    kmSaved: round(individualKm - seq.totalKm), pooledEtaMin: round(etaMinutes(seq.totalKm, hour), 1),
  };
}

/** Greedy clustering of requests into pool groups (max 3 riders). */
export function groupRequests(requests, hour = new Date().getHours()) {
  const remaining = [...requests];
  const groups = [];
  while (remaining.length) {
    const seed = remaining.shift();
    const group = [seed];
    let improved = true;
    while (improved && group.length < POOL_RULES.maxRiders) {
      improved = false;
      const cands = remaining
        .map((r) => ({ r, c: group.every((g) => compatibility(g, r).ok) ? compatibility(seed, r) : { ok: false } }))
        .filter((x) => x.c.ok).sort((a, b) => b.c.score - a.c.score);
      for (const { r } of cands) {
        const trial = [...group, r];
        const riders = trial.map((t) => ({ id: t.id, pickup: t.pickup, drop: t.drop }));
        const seq = bestSequence(trial[0].pickup, riders);
        const soloSum = trial.reduce((a, t) => a + roadKm(t.pickup, t.drop), 0);
        if (seq && seq.totalKm < soloSum * 0.92) {
          const extraOk = trial.every((t) => etaMinutes(seq.riderKm[t.id], hour) - etaMinutes(roadKm(t.pickup, t.drop), hour) <= POOL_RULES.maxExtraMinutes);
          if (extraOk) { group.push(r); remaining.splice(remaining.indexOf(r), 1); improved = true; break; }
        }
      }
    }
    groups.push(group);
  }
  const summaries = groups.map((g, i) => groupSummary(g, hour, i));
  const pooledGroups = summaries.filter((g) => g.pooled);
  const totals = {
    requests: requests.length, groups: summaries.length, pooledGroups: pooledGroups.length,
    pooledRiders: pooledGroups.reduce((s, g) => s + g.size, 0),
    vehiclesSaved: requests.length - summaries.length,
    individualKm: round(summaries.reduce((s, g) => s + g.individualKm, 0)),
    pooledKm: round(summaries.reduce((s, g) => s + g.pooledKm, 0)),
    passengerSavings: summaries.reduce((s, g) => s + g.members.reduce((a, m) => a + m.savings, 0), 0),
  };
  totals.kmSaved = round(totals.individualKm - totals.pooledKm);
  totals.co2SavedKg = round(totals.kmSaved * 0.12, 1);
  totals.poolRate = round((totals.pooledRiders / Math.max(1, totals.requests)) * 100, 1);
  return { rules: POOL_RULES, groups: summaries, totals };
}

/** Generate N simulated pool requests clustered around a few corridors. */
export function simulatedPoolRequests(n = 12, seed = Date.now()) {
  const rand = seededRandom(seed);
  const corridors = [['Z2', 'Z1'], ['Z6', 'Z4'], ['Z3', 'Z10'], ['Z8', 'Z1'], ['Z7', 'Z2'], ['Z5', 'Z6']];
  const names = ['Aarav', 'Diya', 'Kabir', 'Ananya', 'Vihaan', 'Isha', 'Rohan', 'Meera', 'Arjun', 'Saanvi', 'Ishaan', 'Kiara', 'Reyansh', 'Tara', 'Dev', 'Nisha'];
  const reqs = [];
  for (let i = 0; i < n; i++) {
    const [a, b] = corridors[Math.floor(rand() * 3.2 + (i % 2) * 2) % corridors.length];
    const za = ZONES.find((z) => z.id === a); const zb = ZONES.find((z) => z.id === b);
    const pickup = randomPointNear(za, 1.6, rand); const drop = randomPointNear(zb, 2.0, rand);
    reqs.push({ id: `R${i + 1}`, name: `${names[i % names.length]} (sim)`, pickup: { ...pickup, zoneName: zoneOf(pickup).name }, drop: { ...drop, zoneName: zoneOf(drop).name } });
  }
  return reqs;
}
