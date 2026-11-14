// DRIVER FAIRNESS - offline Monte-Carlo comparison of Nearest-Driver vs RYDORA intelligent matching.
// Uses the SAME scoring function as the live engine on a seeded, simulated 12-hour day.
import { ZONES, roadKm, etaMinutes, randomPointNear, seededRandom, round } from '../utils/geo.js';
import { WEIGHTS } from './matching.js';

function gini(values) {
  const v = [...values].sort((a, b) => a - b); const n = v.length; const sum = v.reduce((a, b) => a + b, 0);
  if (!sum) return 0;
  let cum = 0; for (let i = 0; i < n; i++) cum += (i + 1) * v[i];
  return (2 * cum) / (n * sum) - (n + 1) / n;
}
const jain = (v) => { const s = v.reduce((a, b) => a + b, 0); const q = v.reduce((a, b) => a + b * b, 0); return q ? (s * s) / (v.length * q) : 1; };
const mean = (v) => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
const pct = (v, p) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))] || 0; };

function runStrategy(strategy, seed, nDrivers, nRequests, hours) {
  const rand = seededRandom(seed);
  const drivers = Array.from({ length: nDrivers }, (_, i) => {
    const z = ZONES[i % ZONES.length];
    return { id: i, name: `SimDriver ${i + 1}`, loc: randomPointNear(z, 1.5, rand), freeAt: 0, trips: 0, earnings: 0, busyMin: 0, idleSince: 0, acc: 0.55 + rand() * 0.42, offered: 0, accepted: 0, rating: 4.1 + rand() * 0.8 };
  });
  const reqRand = seededRandom(seed * 7 + 1);
  const decisionRand = seededRandom(seed * 13 + 5);
  const horizon = hours * 60;
  const requests = Array.from({ length: nRequests }, () => {
    const pz = ZONES[Math.floor(reqRand() ** 1.6 * ZONES.length)]; // skewed demand towards first zones
    const dz = ZONES[Math.floor(reqRand() * ZONES.length)];
    return { t: reqRand() * horizon, pickup: randomPointNear(pz, 1.5, reqRand), drop: randomPointNear(dz, 2, reqRand) };
  }).sort((a, b) => a.t - b.t);

  const waits = []; let rejections = 0; let unserved = 0; let reassigned = 0;
  for (const req of requests) {
    let t = req.t; const tried = new Set(); let served = false; let attempts = 0;
    while (attempts < 6) {
      let avail = drivers.filter((d) => d.freeAt <= t && !tried.has(d.id));
      if (!avail.length) {
        // queue: wait for the next driver to become free (max 20 min)
        const next = Math.min(...drivers.filter((d) => !tried.has(d.id)).map((d) => d.freeAt));
        if (!Number.isFinite(next) || next - req.t > 20) break;
        t = next; avail = drivers.filter((d) => d.freeAt <= t && !tried.has(d.id));
      }
      const maxTrips = Math.max(1, ...drivers.map((d) => d.trips));
      const scored = avail.map((d) => {
        const km = roadKm(d.loc, req.pickup); const eta = etaMinutes(km, 12);
        const accRate = (d.accepted + d.acc * 10) / (d.offered + 10);
        const f = { distance: Math.max(0, 1 - km / 9), eta: Math.max(0, 1 - eta / 30), workload: 1 - Math.min(1, d.trips / maxTrips), acceptance: accRate, idle: Math.min(1, (t - d.idleSince) / 60), rating: (d.rating - 3.5) / 1.5 };
        const score = Object.keys(WEIGHTS).reduce((s, k) => s + f[k] * WEIGHTS[k], 0);
        return { d, km, eta, score };
      });
      let inRange = scored.filter((x) => x.km <= 9);
      if (!inRange.length) inRange = scored.filter((x) => x.km <= 15);
      if (!inRange.length) break;
      const pick = strategy === 'nearest' ? inRange.sort((a, b) => a.km - b.km)[0] : inRange.sort((a, b) => b.score - a.score)[0];
      attempts += 1; tried.add(pick.d.id); pick.d.offered += 1;
      if (decisionRand() > pick.d.acc) { rejections += 1; t += 0.75; continue; } // rejection / timeout costs response time
      pick.d.accepted += 1;
      const tripKm = roadKm(req.pickup, req.drop); const tripMin = etaMinutes(tripKm, 12);
      const wait = (t - req.t) + pick.eta;
      waits.push(wait);
      if (attempts > 1) reassigned += 1;
      pick.d.freeAt = t + pick.eta + tripMin; pick.d.idleSince = pick.d.freeAt;
      pick.d.busyMin += pick.eta + tripMin; pick.d.trips += 1;
      pick.d.earnings += Math.round((50 + tripKm * 14 + tripMin * 1.5) * 0.8);
      pick.d.loc = req.drop; served = true; break;
    }
    if (!served) unserved += 1;
  }
  const trips = drivers.map((d) => d.trips); const earn = drivers.map((d) => d.earnings);
  const util = drivers.map((d) => Math.min(1, d.busyMin / horizon));
  return {
    strategy,
    avgWaitMin: round(mean(waits), 2), p90WaitMin: round(pct(waits, 0.9), 2),
    served: waits.length, unserved, rejections, reassignedRequests: reassigned,
    avgUtilizationPct: round(mean(util) * 100, 1), minUtilizationPct: round(Math.min(...util) * 100, 1), maxUtilizationPct: round(Math.max(...util) * 100, 1),
    tripsGini: round(gini(trips), 3), earningsGini: round(gini(earn), 3), jainFairness: round(jain(trips), 3),
    tripsStdDev: round(Math.sqrt(mean(trips.map((x) => (x - mean(trips)) ** 2))), 2),
    perDriver: drivers.map((d) => ({ driver: d.name, trips: d.trips, earnings: d.earnings, utilizationPct: round(Math.min(1, d.busyMin / horizon) * 100, 1), acceptance: round(d.acc, 2) })),
  };
}

export function compareAllocation({ seed = 2026, drivers = 20, requests = 200, hours = 12 } = {}) {
  const nearest = runStrategy('nearest', seed, drivers, requests, hours);
  const intelligent = runStrategy('intelligent', seed, drivers, requests, hours);
  const delta = (k, lowerIsBetter = true) => round(((nearest[k] - intelligent[k]) / (nearest[k] || 1)) * 100 * (lowerIsBetter ? 1 : -1), 1);
  return {
    simulated: true, params: { seed, drivers, requests, hours }, weights: WEIGHTS, nearest, intelligent,
    improvements: {
      waitTimePct: delta('avgWaitMin'), rejectionsPct: delta('rejections'), tripsGiniPct: delta('tripsGini'),
      earningsGiniPct: delta('earningsGini'), utilizationPct: delta('avgUtilizationPct', false),
    },
  };
}
