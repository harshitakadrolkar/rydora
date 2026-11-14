import fs from 'fs';
import path from 'path';
import { ROOT_DIR } from '../config/env.js';

export const ZONES = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'shared', 'zones.json'), 'utf8'));
export const ROAD_FACTOR = 1.3; // straight-line -> road distance approximation

const toRad = (d) => (d * Math.PI) / 180;

/** Great-circle distance in km (Haversine). */
export function haversine(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Approximate road distance in km. */
export const roadKm = (a, b) => haversine(a, b) * ROAD_FACTOR;

/** Initial bearing in degrees 0..360 */
export function bearing(a, b) {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function bearingDiff(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Average city speed by hour of day (simulated traffic model), km/h. */
export function speedKmh(hour = new Date().getHours()) {
  if ((hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 20)) return 18;
  if (hour >= 22 || hour <= 5) return 34;
  return 25;
}

export const etaMinutes = (km, hour) => (km / speedKmh(hour)) * 60;

/** Nearest zone centre (Voronoi partition of the city). */
export function zoneOf(p) {
  let best = ZONES[0];
  let bestD = Infinity;
  for (const z of ZONES) {
    const d = haversine(p, z);
    if (d < bestD) { bestD = d; best = z; }
  }
  return best;
}

export const zoneById = (id) => ZONES.find((z) => z.id === id);

/** Move `from` towards `to` by `km`. Returns { point, arrived }. */
export function stepTowards(from, to, km) {
  const d = haversine(from, to);
  if (d <= km || d < 0.01) return { point: { lat: to.lat, lng: to.lng }, arrived: true };
  const f = km / d;
  return { point: { lat: from.lat + (to.lat - from.lat) * f, lng: from.lng + (to.lng - from.lng) * f }, arrived: false };
}

/** Random point within radiusKm of centre. `rand` lets callers use a seeded RNG. */
export function randomPointNear(center, radiusKm, rand = Math.random) {
  const r = radiusKm * Math.sqrt(rand());
  const t = rand() * 2 * Math.PI;
  return {
    lat: center.lat + (r / 111) * Math.cos(t),
    lng: center.lng + (r / (111 * Math.cos(toRad(center.lat)))) * Math.sin(t),
  };
}

export const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/** Seeded PRNG (mulberry32) for reproducible simulations. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Shortest distance (km) from point p to the segment a-b (local flat approximation). */
export function crossTrackKm(p, a, b) {
  const k = 111 * Math.cos(toRad(a.lat));
  const P = { x: (p.lng - a.lng) * k, y: (p.lat - a.lat) * 111 };
  const B = { x: (b.lng - a.lng) * k, y: (b.lat - a.lat) * 111 };
  const len2 = B.x * B.x + B.y * B.y || 1e-9;
  const t = Math.max(0, Math.min(1, (P.x * B.x + P.y * B.y) / len2));
  return Math.hypot(P.x - t * B.x, P.y - t * B.y);
}

/** Point `km` away from p, perpendicular to the direction a->b (side = 1 left, -1 right). */
export function perpendicularPoint(p, a, b, km, side = 1) {
  const k = 111 * Math.cos(toRad(a.lat));
  const dx = (b.lng - a.lng) * k; const dy = (b.lat - a.lat) * 111;
  const len = Math.hypot(dx, dy) || 1;
  return { lat: p.lat + ((dx / len) * km * side) / 111, lng: p.lng + ((-dy / len) * km * side) / k };
}

export const isNightHour = (h = new Date().getHours()) => h >= 21 || h < 6;
