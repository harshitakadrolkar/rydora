import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversine, zoneOf, stepTowards, bearing } from '../src/utils/geo.js';
import { fleet } from '../src/services/state.js';
import { rankDrivers, explainChoice, WEIGHTS } from '../src/services/matching.js';
import { bestSequence, groupRequests, simulatedPoolRequests } from '../src/services/pooling.js';
import { estimateFare } from '../src/services/pricing.js';
import { compareAllocation } from '../src/services/allocationSim.js';

test('haversine distance MG Road -> Koramangala is ~5 km', () => {
  const d = haversine({ lat: 12.9756, lng: 77.6050 }, { lat: 12.9352, lng: 77.6245 });
  assert.ok(d > 4.5 && d < 5.5, `got ${d}`);
});

test('zoneOf maps a point to the nearest zone centre', () => {
  assert.equal(zoneOf({ lat: 12.97, lng: 77.75 }).id, 'Z4');
});

test('stepTowards arrives when close', () => {
  const r = stepTowards({ lat: 12.97, lng: 77.6 }, { lat: 12.9701, lng: 77.6 }, 0.5);
  assert.equal(r.arrived, true);
  assert.ok(bearing({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }) < 1);
});

test('weights sum to 1', () => {
  assert.equal(Math.round(Object.values(WEIGHTS).reduce((a, b) => a + b, 0) * 1000), 1000);
});

test('matching prefers a reliable, idle driver over a slightly nearer overloaded one', () => {
  fleet.clear();
  const base = { status: 'available', vehicle: { category: 'sedan' }, rating: 4.7, stops: [] };
  fleet.set('near', { ...base, _id: 'near', name: 'Near', location: { lat: 12.9760, lng: 77.6050 }, baseAcceptance: 0.5, stats: { offered: 50, accepted: 25, todayTrips: 10 }, lastTripEndedAt: new Date() });
  fleet.set('fair', { ...base, _id: 'fair', name: 'Fair', location: { lat: 12.9790, lng: 77.6060 }, baseAcceptance: 0.95, stats: { offered: 50, accepted: 48, todayTrips: 2 }, lastTripEndedAt: new Date(Date.now() - 50 * 60000) });
  const { ranked, nearest } = rankDrivers({ lat: 12.9756, lng: 77.6050 }, { category: 'sedan', hour: 12 });
  assert.equal(nearest.driverId, 'near');
  assert.equal(ranked[0].driverId, 'fair');
  assert.match(explainChoice(ranked[0], ranked, nearest), /nearest driver Near/);
});

test('busy / offered drivers are not eligible', () => {
  fleet.get('fair').status = 'busy';
  fleet.get('near').pendingOffer = 'x';
  assert.equal(rankDrivers({ lat: 12.9756, lng: 77.6050 }).ranked.length, 0);
  fleet.clear();
});

test('pool sequence always picks up before dropping', () => {
  const riders = [
    { id: 'a', pickup: { lat: 12.935, lng: 77.62 }, drop: { lat: 12.975, lng: 77.605 } },
    { id: 'b', pickup: { lat: 12.937, lng: 77.626 }, drop: { lat: 12.972, lng: 77.607 } },
  ];
  const seq = bestSequence(riders[0].pickup, riders);
  assert.ok(seq);
  for (const r of riders) {
    const p = seq.sequence.findIndex((s) => s.riderId === r.id && s.type === 'pickup');
    const d = seq.sequence.findIndex((s) => s.riderId === r.id && s.type === 'drop');
    assert.ok(p < d);
  }
});

test('pool grouping saves distance and money', () => {
  const res = groupRequests(simulatedPoolRequests(12, 7), 10);
  assert.ok(res.totals.kmSaved > 0);
  assert.ok(res.groups.filter((g) => g.pooled).every((g) => g.kmSaved > 0));
  assert.ok(res.totals.passengerSavings > 0);
});

test('fares: surge increases, pool discount decreases', () => {
  const f = estimateFare({ distanceKm: 6, durationMin: 15, category: 'sedan' });
  assert.ok(estimateFare({ distanceKm: 6, durationMin: 15, surge: 1.5 }).total > f.total);
  assert.ok(estimateFare({ distanceKm: 6, durationMin: 15, pool: true, matched: true }).total < f.total);
});

test('intelligent allocation is fairer than nearest-driver (simulation)', () => {
  const r = compareAllocation({ seed: 2026 });
  assert.ok(r.intelligent.tripsGini < r.nearest.tripsGini);
  assert.ok(r.intelligent.jainFairness >= r.nearest.jainFairness);
});

import { crossTrackKm } from '../src/utils/geo.js';
test('EV-only and woman-driver filters, suspended drivers excluded', () => {
  fleet.clear();
  const base = { status: 'available', rating: 4.7, stops: [], baseAcceptance: 0.9, stats: { offered: 10, accepted: 9, todayTrips: 1 }, lastTripEndedAt: new Date() };
  fleet.set('ev', { ...base, _id: 'ev', name: 'EV Man', gender: 'male', vehicle: { category: 'sedan', fuel: 'ev' }, location: { lat: 12.976, lng: 77.605 } });
  fleet.set('w', { ...base, _id: 'w', name: 'Woman', gender: 'female', vehicle: { category: 'sedan', fuel: 'petrol' }, location: { lat: 12.977, lng: 77.605 } });
  fleet.set('wf', { ...base, _id: 'wf', name: 'Flagged', gender: 'female', flagged: true, vehicle: { category: 'sedan', fuel: 'ev' }, location: { lat: 12.976, lng: 77.606 } });
  const p = { lat: 12.9756, lng: 77.6050 };
  assert.deepEqual(rankDrivers(p, { ev: true }).ranked.map((r) => r.driverId), ['ev']);
  assert.deepEqual(rankDrivers(p, { women: true }).ranked.map((r) => r.driverId), ['w']);
  fleet.clear();
});

test('route deviation: cross-track distance', () => {
  const a = { lat: 12.93, lng: 77.62 }; const b = { lat: 12.98, lng: 77.62 };
  assert.ok(crossTrackKm({ lat: 12.95, lng: 77.62 }, a, b) < 0.01);
  const off = crossTrackKm({ lat: 12.95, lng: 77.64 }, a, b);
  assert.ok(off > 2 && off < 2.3, `got ${off}`);
});

import { findRoute, addIncident, removeIncident, routeMinutes, incidentsOnRoute } from '../src/services/routing.js';
test('routing: A* finds a faster road around a traffic jam', () => {
  const a = { lat: 12.9121, lng: 77.6446 }; const b = { lat: 12.9719, lng: 77.6074 };
  const before = findRoute(a, b, 12);
  const i = Math.floor((before.points.length - 1) / 2);
  const p = before.points[i]; const q = before.points[i + 1];
  const inc = addIncident({ center: { lat: (p.lat + q.lat) / 2, lng: (p.lng + q.lng) / 2 }, name: 'Test jam', radiusKm: 0.8, speedFactor: 0.1 });
  assert.equal(incidentsOnRoute(before.points).length, 1);
  const oldTime = routeMinutes(before.points, 12);
  const after = findRoute(a, b, 12);
  assert.ok(after.minutes < oldTime, `rerouted ${after.minutes} should beat ${oldTime}`);
  removeIncident(inc.id);
});
