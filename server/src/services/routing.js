// ROUTING + TRAFFIC ENGINE
// A simulated road network (grid of junctions every ~1 km over Bengaluru, 8-way links),
// A* fastest-path search using traffic-aware travel times, live traffic incidents,
// and automatic rerouting of vehicles when heavy traffic appears on their route.
import { haversine, round, speedKmh, crossTrackKm } from '../utils/geo.js';
import { PLACES } from '../data/places.js';

const BOX = { minLat: 12.80, maxLat: 13.10, minLng: 77.49, maxLng: 77.81 };
const STEP = 0.009; // ~1 km between junctions
const ROWS = Math.round((BOX.maxLat - BOX.minLat) / STEP) + 1;
const COLS = Math.round((BOX.maxLng - BOX.minLng) / STEP) + 1;
const node = (r, c) => ({ lat: BOX.minLat + r * STEP, lng: BOX.minLng + c * STEP });
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export const traffic = { version: 0, incidents: [] };

// Bengaluru's well-known traffic hotspots (for random simulated jams)
export const HOTSPOTS = [
  { name: 'Silk Board Junction', lat: 12.9177, lng: 77.6233 },
  { name: 'Hebbal Flyover', lat: 13.0358, lng: 77.5970 },
  { name: 'Marathahalli Bridge', lat: 12.9569, lng: 77.7011 },
  { name: 'KR Puram', lat: 13.0050, lng: 77.6950 },
  { name: 'Sony World Signal', lat: 12.9373, lng: 77.6268 },
  { name: 'Tin Factory', lat: 12.9960, lng: 77.6680 },
  { name: 'Majestic', lat: 12.9774, lng: 77.5713 },
  { name: 'Domlur Flyover', lat: 12.9610, lng: 77.6387 },
];

/** Speed multiplier at a point (1 = free flow, 0.15 = near standstill). */
export function trafficFactor(p, now = Date.now()) {
  let f = 1;
  for (const inc of traffic.incidents) {
    if (inc.until < now) continue;
    const d = haversine(p, inc.center);
    if (d <= inc.radiusKm) f = Math.min(f, inc.speedFactor + (1 - inc.speedFactor) * (d / inc.radiusKm) * 0.5);
  }
  return f;
}

// Travel time of a segment, sampling traffic every ~400 m so long straight roads still "see" a jam.
const segMinutes = (a, b, hour) => {
  const km = haversine(a, b);
  const n = Math.max(1, Math.ceil(km / 0.4));
  let t = 0;
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    const p = { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f };
    t += ((km / n) / (speedKmh(hour) * trafficFactor(p))) * 60;
  }
  return t;
};

/** Travel time (minutes) of a polyline under the CURRENT traffic. */
export function routeMinutes(points, hour = new Date().getHours()) {
  let t = 0;
  for (let i = 1; i < points.length; i++) t += segMinutes(points[i - 1], points[i], hour);
  return t;
}
export function routeKm(points) {
  let k = 0;
  for (let i = 1; i < points.length; i++) k += haversine(points[i - 1], points[i]);
  return k;
}

function snap(p) {
  const r = Math.max(0, Math.min(ROWS - 1, Math.round((p.lat - BOX.minLat) / STEP)));
  const c = Math.max(0, Math.min(COLS - 1, Math.round((p.lng - BOX.minLng) / STEP)));
  return [r, c];
}

class Heap {
  constructor() { this.a = []; }
  push(x) { const a = this.a; a.push(x); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a; const top = a[0]; const last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1; const r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
  get size() { return this.a.length; }
}

/** Drop junctions that continue in the same direction (cleaner polylines). */
function simplify(pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1]; const b = pts[i]; const c = pts[i + 1];
    const d1 = [Math.sign(round(b.lat - a.lat, 4)), Math.sign(round(b.lng - a.lng, 4))];
    const d2 = [Math.sign(round(c.lat - b.lat, 4)), Math.sign(round(c.lng - b.lng, 4))];
    if (d1[0] !== d2[0] || d1[1] !== d2[1]) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** A* fastest route from -> to on the road grid, using live traffic. */
export function findRoute(from, to, hour = new Date().getHours()) {
  if (haversine(from, to) < 0.6) {
    const pts = [from, to];
    return { points: pts, km: round(routeKm(pts), 2), minutes: round(routeMinutes(pts, hour), 1) };
  }
  const [sr, sc] = snap(from); const [gr, gc] = snap(to);
  const goal = node(gr, gc);
  const maxSpeed = speedKmh(hour);
  const key = (r, c) => r * COLS + c;
  const g = new Map([[key(sr, sc), 0]]);
  const prev = new Map();
  const open = new Heap();
  open.push([0, sr, sc]);
  const closed = new Set();
  while (open.size) {
    const [, r, c] = open.pop();
    const k = key(r, c);
    if (closed.has(k)) continue;
    closed.add(k);
    if (r === gr && c === gc) break;
    const here = node(r, c);
    for (const [dr, dc] of NEIGHBOURS) {
      const nr = r + dr; const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= ROWS || nc >= COLS) continue;
      const nk = key(nr, nc);
      if (closed.has(nk)) continue;
      const there = node(nr, nc);
      const cost = g.get(k) + segMinutes(here, there, hour);
      if (cost < (g.get(nk) ?? Infinity)) {
        g.set(nk, cost); prev.set(nk, k);
        open.push([cost + (haversine(there, goal) / maxSpeed) * 60, nr, nc]);
      }
    }
  }
  const path = [];
  let k = key(gr, gc);
  while (k !== undefined) { path.unshift(node(Math.floor(k / COLS), k % COLS)); k = prev.get(k); }
  const pts = simplify([from, ...path.slice(1, -1), to]);
  return { points: pts, km: round(routeKm(pts), 2), minutes: round(routeMinutes(pts, hour), 1) };
}

/** Incidents that touch a polyline. */
export function incidentsOnRoute(points) {
  const now = Date.now();
  return traffic.incidents.filter((inc) => inc.until > now && points.some((p, i) => {
    const q = points[i + 1];
    return q ? crossTrackKm(inc.center, p, q) <= inc.radiusKm : haversine(p, inc.center) <= inc.radiusKm;
  }));
}

export function addIncident({ center, name, radiusKm = 1.3, speedFactor = 0.12, minutes = 8, cause = 'Heavy traffic', source = 'admin' }) {
  const inc = {
    id: Math.random().toString(36).slice(2, 9), name, cause, center: { lat: center.lat, lng: center.lng },
    radiusKm, speedFactor, createdAt: Date.now(), until: Date.now() + minutes * 60000, source,
  };
  traffic.incidents.push(inc);
  traffic.version += 1;
  return inc;
}

export function removeIncident(id) {
  const n = traffic.incidents.length;
  traffic.incidents = traffic.incidents.filter((i) => i.id !== id);
  if (traffic.incidents.length !== n) traffic.version += 1;
}

export function expireIncidents() {
  const n = traffic.incidents.length;
  const now = Date.now();
  traffic.incidents = traffic.incidents.filter((i) => i.until > now);
  if (traffic.incidents.length !== n) { traffic.version += 1; return true; }
  return false;
}

export function nearestLandmark(p) {
  let best = PLACES[0]; let bd = Infinity;
  for (const pl of [...PLACES, ...HOTSPOTS]) { const d = haversine(p, pl); if (d < bd) { bd = d; best = pl; } }
  return best.name;
}

export const publicIncident = (i) => ({ id: i.id, name: i.name, cause: i.cause, center: i.center, radiusKm: i.radiusKm, speedPct: Math.round(i.speedFactor * 100), until: i.until, source: i.source });
