import { Router } from 'express';
import Ride from '../models/Ride.js';
import { auth, wrap } from '../middleware/auth.js';
import { getForecast, retrain } from '../services/forecast.js';
import { computeZoneStats, repositioningPlan, prepositionPlan } from '../services/zones.js';
import { compareAllocation } from '../services/allocationSim.js';
import { groupRequests, simulatedPoolRequests, POOL_RULES } from '../services/pooling.js';
import { fleet, activeRides, acceptanceRate, idleMinutes, logEvent } from '../services/state.js';
import { WEIGHTS, FACTOR_LABELS } from '../services/matching.js';
import { round } from '../utils/geo.js';

const r = Router();
r.use(auth());

r.get('/forecast', (req, res) => res.json(getForecast()));

r.post('/forecast/retrain', auth('admin'), wrap(async (req, res) => {
  logEvent('ml', 'Demand model retraining started (scikit-learn GradientBoosting)');
  const out = await retrain();
  logEvent('ml', out.ok ? `Model retrained in ${out.seconds}s` : `Retraining failed: ${out.error}`);
  res.status(out.ok ? 200 : 500).json({ ...out, forecast: out.ok ? getForecast() : undefined });
}));

r.get('/preposition', (req, res) => {
  const hour = req.query.hour !== undefined ? Number(req.query.hour) % 24 : undefined;
  res.json(prepositionPlan(hour));
});

r.get('/zones', (req, res) => res.json({ ...computeZoneStats(), repositioning: repositioningPlan() }));

r.get('/allocation/compare', (req, res) => {
  const seed = Number(req.query.seed) || 2026;
  const requests = Math.min(400, Math.max(50, Number(req.query.requests) || 200));
  const drivers = Math.min(40, Math.max(5, Number(req.query.drivers) || 20));
  res.json(compareAllocation({ seed, requests, drivers }));
});

const gini = (values) => {
  const v = [...values].sort((a, b) => a - b); const n = v.length; const s = v.reduce((a, b) => a + b, 0);
  if (!s) return 0; let c = 0; v.forEach((x, i) => { c += (i + 1) * x; });
  return (2 * c) / (n * s) - (n + 1) / n;
};

/** Live allocation analytics from the actual matching decisions recorded on rides. */
r.get('/allocation/live', wrap(async (req, res) => {
  const since = new Date(Date.now() - 24 * 3600000);
  const rides = await Ride.find({ requestedAt: { $gte: since }, 'match.chosen': { $exists: true } }).select('match reassignments waitTimeMin status offers code passengerName requestedAt type').sort({ requestedAt: -1 }).limit(400).lean();
  const decisions = rides.filter((x) => x.match && !x.match.pooled && x.match.nearest);
  const differs = decisions.filter((x) => !x.match.sameAsNearest);
  const reasons = {};
  for (const x of rides) for (const ra of x.reassignments || []) reasons[ra.reason] = (reasons[ra.reason] || 0) + 1;
  const drivers = [...fleet.values()];
  const trips = drivers.map((d) => d.stats.todayTrips || 0);
  const factorTotals = Object.fromEntries(Object.keys(WEIGHTS).map((k) => [k, 0]));
  for (const x of decisions) for (const k of Object.keys(WEIGHTS)) factorTotals[k] += x.match.chosen.contributions?.[k] || 0;
  const waits = rides.filter((x) => x.waitTimeMin != null).map((x) => x.waitTimeMin);
  res.json({
    weights: WEIGHTS, labels: FACTOR_LABELS,
    totals: {
      decisions: decisions.length, differsFromNearest: differs.length,
      differsPct: decisions.length ? round((differs.length / decisions.length) * 100, 1) : 0,
      avgWaitMin: waits.length ? round(waits.reduce((a, b) => a + b, 0) / waits.length, 1) : 0,
      reassignments: Object.values(reasons).reduce((a, b) => a + b, 0),
      tripsGini: round(gini(trips), 3),
      extraKmVsNearest: round(differs.reduce((s, x) => s + (x.match.chosen.distanceKm - x.match.nearest.distanceKm), 0) / Math.max(1, differs.length), 2),
    },
    reassignmentReasons: Object.entries(reasons).map(([reason, count]) => ({ reason, count })),
    avgFactorContribution: Object.entries(factorTotals).map(([k, v]) => ({ factor: FACTOR_LABELS[k], value: round(v / Math.max(1, decisions.length), 1) })),
    recentDecisions: rides.slice(0, 25).map((x) => ({
      code: x.code, passengerName: x.passengerName, at: x.requestedAt, status: x.status, type: x.type, pooled: !!x.match.pooled,
      chosen: x.match.chosen?.name, chosenScore: x.match.chosen?.score, chosenKm: x.match.chosen?.distanceKm,
      nearest: x.match.nearest?.name, nearestKm: x.match.nearest?.distanceKm, sameAsNearest: x.match.sameAsNearest,
      explanation: x.match.explanation, offers: x.offers?.length || 0, reassignments: x.reassignments?.length || 0,
    })),
    driverFairness: drivers.filter((d) => d.status !== 'offline' || d.stats.todayTrips > 0).map((d) => {
      const acc = acceptanceRate(d);
      return {
        driverId: String(d._id), name: d.name, status: d.status, isSimulated: d.isSimulated,
        todayTrips: d.stats.todayTrips, todayEarnings: d.stats.todayEarnings, acceptance: round(acc, 3),
        idleMin: Math.round(idleMinutes(d)), rating: d.rating,
        offered: d.stats.offered, rejected: d.stats.rejected, timeouts: d.stats.timeouts, delays: d.stats.delays || 0,
        reliability: round(Math.max(0, acc * 100 - (d.stats.delays || 0) * 3 - (d.stats.cancelled || 0) * 4), 1),
      };
    }).sort((a, b) => b.todayTrips - a.todayTrips),
  });
}));

r.post('/pooling/analyze', (req, res) => {
  const count = Math.min(24, Math.max(2, Number(req.body.count) || 12));
  let requests;
  let source = 'simulated';
  if (req.body.source === 'live') {
    requests = [...activeRides.values()].filter((x) => x.status === 'REQUESTED' || x.status === 'ACCEPTED')
      .map((x) => ({ id: x._id, name: x.passengerName, pickup: x.pickup, drop: x.drop }));
    source = 'live';
    if (requests.length < 2) { requests = simulatedPoolRequests(count, Number(req.body.seed) || Date.now()); source = 'simulated (not enough live requests)'; }
  } else {
    requests = simulatedPoolRequests(count, Number(req.body.seed) || Date.now());
  }
  res.json({ source, ...groupRequests(requests) });
});

r.get('/pooling/stats', wrap(async (req, res) => {
  const pools = await Ride.find({ type: 'pool' }).select('pool fare status code passengerName requestedAt distanceKm').sort({ requestedAt: -1 }).limit(300).lean();
  const matched = pools.filter((p) => p.pool?.matched);
  const savings = matched.reduce((s, p) => s + (p.pool?.savings || 0), 0);
  res.json({
    rules: POOL_RULES,
    totals: { poolRequests: pools.length, matched: matched.length, matchRatePct: pools.length ? round((matched.length / pools.length) * 100, 1) : 0, totalSavings: savings, avgSavings: matched.length ? Math.round(savings / matched.length) : 0 },
    recent: pools.slice(0, 20).map((p) => ({ code: p.code, passengerName: p.passengerName, status: p.status, matched: !!p.pool?.matched, groupId: p.pool?.groupId, coRiders: p.pool?.coRiders?.map((c) => c.name) || [], fare: p.fare?.total, solo: p.fare?.soloEquivalent, savings: p.pool?.savings || 0, at: p.requestedAt })),
    activeGroups: Object.values([...activeRides.values()].filter((x) => x.pool?.matched).reduce((acc, x) => {
      (acc[x.pool.groupId] = acc[x.pool.groupId] || { groupId: x.pool.groupId, driver: x.driverName, riders: [] }).riders.push({ name: x.passengerName, status: x.status, fare: x.fare.total, savings: x.pool.savings });
      return acc;
    }, {})),
  });
}));

export default r;
