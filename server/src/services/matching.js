// CORE MATCHING ENGINE - weighted multi-factor driver scoring with explanations.
import { roadKm, etaMinutes, round } from '../utils/geo.js';
import { fleet, acceptanceRate, idleMinutes } from './state.js';

export const WEIGHTS = {
  distance: 0.25,   // closer is better
  eta: 0.20,        // faster pickup (traffic-aware)
  workload: 0.15,   // fewer trips today -> fairer distribution
  acceptance: 0.20, // likely to accept -> fewer reassignments
  idle: 0.15,       // idle longer -> deserves the next ride
  rating: 0.05,     // quality
};
export const FACTOR_LABELS = {
  distance: 'Distance', eta: 'Pickup ETA', workload: 'Low workload',
  acceptance: 'Acceptance history', idle: 'Idle time', rating: 'Rating',
};
const MAX_RADIUS_KM = 9;
const MAX_ETA_MIN = 30;
const CATEGORY_ORDER = ['mini', 'sedan', 'suv'];

/** Feature vector + weighted score (0..100) for one driver. */
export function scoreDriver(d, pickup, ctx) {
  const distanceKm = roadKm(d.location, pickup);
  const eta = etaMinutes(distanceKm, ctx.hour);
  const acc = acceptanceRate(d);
  const idle = idleMinutes(d);
  const trips = d.stats?.todayTrips || 0;
  const f = {
    distance: Math.max(0, 1 - distanceKm / ctx.radius),
    eta: Math.max(0, 1 - eta / MAX_ETA_MIN),
    workload: 1 - Math.min(1, trips / Math.max(ctx.maxTrips, 1)),
    acceptance: acc,
    idle: Math.min(1, idle / 60),
    rating: Math.max(0, Math.min(1, ((d.rating || 4.5) - 3.5) / 1.5)),
  };
  const contributions = {};
  let score = 0;
  for (const k of Object.keys(WEIGHTS)) { contributions[k] = round(f[k] * WEIGHTS[k] * 100, 1); score += contributions[k]; }
  return {
    driverId: String(d._id), name: d.name, vehicle: d.vehicle, isSimulated: d.isSimulated, gender: d.gender, ev: d.vehicle?.fuel === 'ev', childSeat: !!d.vehicle?.childSeat,
    location: d.location, distanceKm: round(distanceKm), etaMin: round(eta, 1),
    acceptanceRate: round(acc, 3), idleMin: Math.round(idle), todayTrips: trips, rating: d.rating,
    factors: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, round(v, 3)])),
    contributions, score: round(score, 1),
  };
}

function eligible(d, { exclude, category, allowUpgrade, ev, women, seats, childSeat }) {
  if (d.status !== 'available' || d.pendingOffer || d.stalled || d.flagged) return false;
  if (ev && d.vehicle?.fuel !== 'ev') return false;
  if (women && d.gender !== 'female') return false;
  if (seats && (d.vehicle?.seats || 4) < seats) return false;
  if (childSeat && !d.vehicle?.childSeat) return false;
  if (exclude?.has(String(d._id))) return false;
  if (!category) return true;
  const want = CATEGORY_ORDER.indexOf(category);
  const has = CATEGORY_ORDER.indexOf(d.vehicle?.category);
  return allowUpgrade ? has >= want : has === want;
}

/**
 * Rank all eligible drivers for a pickup point.
 * Returns { ranked, nearest, radius, upgraded }.
 */
export function rankDrivers(pickup, { exclude = new Set(), category = null, hour = new Date().getHours(), ev = false, women = false, seats = 1, childSeat = false } = {}) {
  const all = [...fleet.values()];
  const maxTrips = Math.max(1, ...all.filter((d) => d.status !== 'offline').map((d) => d.stats?.todayTrips || 0));
  let upgraded = false;
  let pool = all.filter((d) => eligible(d, { exclude, category, allowUpgrade: false, ev, women, seats, childSeat }));
  if (category && pool.filter((d) => roadKm(d.location, pickup) <= MAX_RADIUS_KM).length === 0) {
    pool = all.filter((d) => eligible(d, { exclude, category, allowUpgrade: true, ev, women, seats, childSeat }));
    upgraded = true;
  }
  let radius = MAX_RADIUS_KM;
  let inRange = pool.filter((d) => roadKm(d.location, pickup) <= radius);
  if (!inRange.length) { radius = 20; inRange = pool.filter((d) => roadKm(d.location, pickup) <= radius); }
  const ctx = { hour, maxTrips, radius };
  const ranked = inRange.map((d) => scoreDriver(d, pickup, ctx)).sort((a, b) => b.score - a.score);
  const nearest = [...ranked].sort((a, b) => a.distanceKm - b.distanceKm)[0] || null;
  return { ranked, nearest, radius, upgraded };
}

/** Human-readable explanation of why `chosen` won. */
export function explainChoice(chosen, ranked, nearest) {
  if (!chosen) return 'No eligible driver found.';
  const top = Object.entries(chosen.contributions).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([k]) => FACTOR_LABELS[k].toLowerCase());
  const runner = ranked.find((r) => r.driverId !== chosen.driverId);
  let text = `${chosen.name} was selected with a score of ${chosen.score}/100: ${chosen.distanceKm} km away (pickup ETA ${Math.round(chosen.etaMin)} min), ` +
    `${Math.round(chosen.acceptanceRate * 100)}% acceptance rate, idle ${chosen.idleMin} min, ${chosen.todayTrips} trips today. ` +
    `Strongest factors: ${top.join(', ')}.`;
  if (runner) text += ` Runner-up ${runner.name} scored ${runner.score}.`;
  if (nearest && nearest.driverId !== chosen.driverId) {
    const why = [];
    if (nearest.acceptanceRate < chosen.acceptanceRate - 0.05) why.push(`lower acceptance (${Math.round(nearest.acceptanceRate * 100)}%)`);
    if (nearest.todayTrips > chosen.todayTrips) why.push(`higher workload (${nearest.todayTrips} trips today)`);
    if (nearest.idleMin < chosen.idleMin) why.push(`shorter idle time (${nearest.idleMin} min)`);
    text += ` The nearest driver ${nearest.name} (${nearest.distanceKm} km) was not chosen due to ${why.join(', ') || 'a lower overall score'}.`;
  } else if (nearest) {
    text += ' The chosen driver is also the nearest driver.';
  }
  return text;
}
