// SIMULATION ENGINE (clearly simulated): driver movement, simulated passenger demand.
import User from '../models/User.js';
import Driver from '../models/Driver.js';
import Ride from '../models/Ride.js';
import { ZONES, zoneOf, stepTowards, speedKmh, randomPointNear, roadKm, etaMinutes, round, zoneById, haversine } from '../utils/geo.js';
import { fleet, activeRides, settings, emit, publicDriver } from './state.js';
import { markArrived, requestRide, monitorDelays, startArriving } from './dispatcher.js';
import { computeZoneStats } from './zones.js';
import { monitorSafety } from './safety.js';
import { findRoute, routeMinutes, routeKm, trafficFactor, traffic, incidentsOnRoute, expireIncidents, addIncident, HOTSPOTS, publicIncident } from './routing.js';
import { addTimeline, save, passengerNotify } from './dispatcher.js';
import { logEvent } from './state.js';
import { forecastFor } from './forecast.js';
import { PLACES } from '../data/places.js';

let simPassengers = [];
let tick = 0;
let lastSimRide = Date.now();

export async function loadFleet() {
  const drivers = await Driver.find().lean();
  fleet.clear();
  // Rides in flight cannot survive a restart (live state is in memory): close them cleanly.
  const orphaned = await Ride.find({ status: { $in: ['REQUESTED', 'ACCEPTED', 'ARRIVING', 'ONGOING'] } }).select('_id').lean();
  for (const o of orphaned) {
    await Ride.updateOne({ _id: o._id }, { $set: { status: 'CANCELLED', cancelledBy: 'system', cancelReason: 'Server restarted', cancelledAt: new Date() } });
  }
  if (orphaned.length) console.log(`[sim] Closed ${orphaned.length} ride(s) left in progress by a previous run`);
  for (const d of drivers) {
    if (d.status === 'busy') d.status = 'available';
    fleet.set(String(d._id), { ...d, _id: String(d._id), stops: [], pendingOffer: null, stalled: false, repositionTarget: null });
  }
  simPassengers = await User.find({ role: 'passenger', simulated: true }).select('name').lean();
  console.log(`[sim] Loaded ${fleet.size} drivers, ${simPassengers.length} simulated passengers`);
}

export function addToFleet(d) {
  fleet.set(String(d._id), { ...d, _id: String(d._id), stops: [], pendingOffer: null, stalled: false, repositionTarget: null });
}

/** Plan the fastest road route for the driver's next stop and store it on the ride. */
function planLeg(d, ride, stop, legKey) {
  const route = findRoute(d.location, stop);
  d.path = route.points.slice(1);
  d.pathFor = legKey;
  d.routeVersion = traffic.version;
  ride.route = { leg: stop.type, points: route.points, km: route.km, minutes: route.minutes, at: new Date() };
  if (ride.safety) ride.safety.minRemainingKm = null;
  save(ride); // push the planned route to the rider's map
}

/** When traffic changes, re-plan routes that now pass through a jam (if a faster road exists). */
function checkReroutes() {
  for (const d of fleet.values()) {
    if (!d.path?.length || d.routeVersion === traffic.version || !d.pathFor) continue;
    d.routeVersion = traffic.version;
    const [rideId, type] = d.pathFor.split(':');
    const ride = activeRides.get(rideId);
    if (!ride) continue;
    const stop = d.stops?.[0];
    if (!stop) continue;
    const current = [d.location, ...d.path];
    const jams = incidentsOnRoute(current);
    if (!jams.length) continue;
    const oldMin = routeMinutes(current);
    const best = findRoute(d.location, stop);
    const jamName = jams[0].name;
    if (best.minutes < oldMin - 1 && best.minutes < oldMin * 0.92) {
      const saved = Math.round(oldMin - best.minutes);
      ride.reroutes = ride.reroutes || [];
      ride.reroutes.push({ at: new Date(), reason: `${jams[0].cause} near ${jamName}`, incident: jamName, oldEtaMin: round(oldMin, 1), newEtaMin: best.minutes, savedMin: saved, oldKm: round(routeKm(current), 2), newKm: best.km, oldPoints: current });
      d.path = best.points.slice(1);
      ride.route = { leg: type, points: best.points, km: best.km, minutes: best.minutes, at: new Date() };
      if (ride.safety) ride.safety.minRemainingKm = null;
      addTimeline(ride, ride.status, `Heavy traffic near ${jamName}: rerouted. New route ${best.km} km, ETA ${Math.round(best.minutes)} min (saves ${saved} min)`);
      passengerNotify(ride, { title: 'Route changed to avoid traffic', message: `Heavy traffic near ${jamName}. Your driver has been rerouted and saves about ${saved} min.`, type: 'info' });
      emit(`driver:${d._id}`, 'driver:rerouted', { rideId, incident: jamName, savedMin: saved });
      logEvent('traffic', `${ride.code}: rerouted around ${jamName} (saves ${saved} min)`, { rideId });
      save(ride);
    } else if (!ride.trafficNotified?.[jams[0].id]) {
      ride.trafficNotified = { ...(ride.trafficNotified || {}), [jams[0].id]: true };
      addTimeline(ride, ride.status, `Heavy traffic near ${jamName}. No faster road available, ETA updated to ${Math.round(oldMin)} min`);
      passengerNotify(ride, { title: 'Heavy traffic ahead', message: `Traffic near ${jamName}. This is still the fastest route; new ETA about ${Math.round(oldMin)} min.`, type: 'warning' });
      save(ride);
    }
  }
}

let lastRandomJam = Date.now();
function maybeRandomJam() {
  if (!settings.simRunning || Date.now() - lastRandomJam < 150000) return;
  lastRandomJam = Date.now();
  if (traffic.incidents.filter((i) => i.source === 'random').length >= 2 || Math.random() > 0.5) return;
  const h = HOTSPOTS[Math.floor(Math.random() * HOTSPOTS.length)];
  const inc = addIncident({ center: h, name: h.name, radiusKm: 1.1, speedFactor: 0.2, minutes: 6, cause: Math.random() < 0.3 ? 'Waterlogging' : 'Heavy traffic', source: 'random' });
  logEvent('traffic', `Simulated ${inc.cause.toLowerCase()} at ${inc.name}`);
}

function moveDriver(d) {
  if (d.status === 'offline' || d.stalled) return;
  const speed = speedKmh() * settings.simSpeed; // km/h in simulated time
  const stepKm = speed / 3600; // per 1s tick
  const stop = d.stops?.[0];
  if (stop) {
    const ride = activeRides.get(stop.rideId);
    if (!ride) { d.stops.shift(); return; }
    const canMove = (stop.type === 'pickup' && ride.status === 'ARRIVING') || (stop.type === 'drop' && ride.status === 'ONGOING');
    // pooled car: if the next stop is a pickup for a rider still in ACCEPTED, start them
    if (!canMove && stop.type === 'pickup' && ride.status === 'ACCEPTED' && d.isSimulated) startArriving(ride._id, String(d._id));
    if (!canMove) return;
    if (d.detourTarget) { // DEMO: driver takes a wrong turn
      const r = stepTowards(d.location, d.detourTarget, stepKm * 0.6);
      d.location = r.point;
      if (r.arrived) { d.detourTarget = null; d.path = null; }
      return;
    }
    // follow the planned road route (computed with live traffic)
    const legKey = `${stop.rideId}:${stop.type}`;
    if (d.pathFor !== legKey || !d.path) planLeg(d, ride, stop, legKey);
    let budget = stepKm * trafficFactor(d.location); // heavy traffic slows the car down
    while (budget > 1e-6 && d.path.length) {
      const target = d.path[0];
      const r = stepTowards(d.location, target, budget);
      budget -= haversine(d.location, r.point);
      d.location = r.point;
      if (r.arrived) d.path.shift(); else break;
    }
    if (!d.path.length) { d.pathFor = null; markArrived(ride, d, stop); }
    return;
  }
  if (d.status !== 'available') return;
  if (d.repositionTarget) {
    const { point, arrived } = stepTowards(d.location, d.repositionTarget, stepKm);
    d.location = point;
    if (arrived) {
      emit(`driver:${d._id}`, 'driver:repositioned', { zone: d.repositionTarget.zoneName });
      d.repositionTarget = null;
    }
    return;
  }
  if (d.isSimulated) {
    // gentle idle wandering around the current zone
    if (!d.wander || Math.random() < 0.02) {
      const z = zoneById(d.zoneId) || ZONES[0];
      d.wander = randomPointNear(z, 1.5);
    }
    const { point } = stepTowards(d.location, d.wander, stepKm * 0.25);
    d.location = point;
  }
}

function weightedZone(hour) {
  const weights = ZONES.map((z) => Math.max(0.5, forecastFor(z.id, hour)));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ZONES.length; i++) { r -= weights[i]; if (r <= 0) return ZONES[i]; }
  return ZONES[0];
}

function nearestPlaceName(p) {
  let best = null; let bd = Infinity;
  for (const pl of PLACES) { const d = roadKm(p, pl); if (d < bd) { bd = d; best = pl; } }
  return bd < 1.2 ? `Near ${best.name}` : `${zoneOf(p).name} (pinned)`;
}

export function generateSimRide(opts = {}) {
  if (!simPassengers.length) return null;
  const hour = new Date().getHours();
  const pz = opts.zone || weightedZone(hour);
  let dz = weightedZone(hour);
  if (dz.id === pz.id && Math.random() < 0.6) dz = ZONES[(ZONES.indexOf(pz) + 1 + Math.floor(Math.random() * 3)) % ZONES.length];
  const pickup = opts.pickup || randomPointNear(pz, 1.4);
  let drop = randomPointNear(dz, 1.6);
  if (roadKm(pickup, drop) < 2) drop = randomPointNear(ZONES[(ZONES.indexOf(dz) + 2) % ZONES.length], 1.5);
  if (roadKm(pickup, drop) > 10) drop = randomPointNear(pickup, 4.5);
  if (roadKm(pickup, drop) < 2) drop = randomPointNear(pickup, 5);
  const p = simPassengers[Math.floor(Math.random() * simPassengers.length)];
  const cats = ['mini', 'mini', 'sedan', 'sedan', 'suv'];
  return requestRide({
    passenger: p,
    pickup: { ...pickup, address: nearestPlaceName(pickup) },
    drop: { ...drop, address: nearestPlaceName(drop) },
    category: opts.category || cats[Math.floor(Math.random() * cats.length)],
    type: opts.type || (Math.random() < 0.25 ? 'pool' : 'solo'),
    scenario: opts.scenario || 'normal',
    forceDriverId: opts.forceDriverId || null,
    simulated: true,
  });
}

/** Persist positions in bulk occasionally (cheap). */
async function persistPositions() {
  const ops = [...fleet.values()].map((d) => ({
    updateOne: { filter: { _id: d._id }, update: { $set: { location: d.location, zoneId: d.zoneId, status: d.status } } },
  }));
  if (ops.length) await Driver.bulkWrite(ops).catch(() => {});
}

export function startSimulation() {
  computeZoneStats();
  setInterval(() => {
    tick += 1;
    for (const d of fleet.values()) {
      moveDriver(d);
      d.zoneId = zoneOf(d.location).id;
      if (d.stalled && d.stalledAt && Date.now() - d.stalledAt > 60000) { d.stalled = false; d.stalledAt = null; }
    }
    // live location for each active ride room
    for (const r of activeRides.values()) {
      if (!r.driver) continue;
      const d = fleet.get(r.driver);
      if (!d) continue;
      const target = r.status === 'ONGOING' ? r.drop : r.pickup;
      const onLeg = d.path && d.pathFor && d.pathFor.startsWith(r._id) && d.stops?.[0]?.rideId === r._id;
      const pts = onLeg ? [d.location, ...d.path] : [d.location, target];
      const km = onLeg ? routeKm(pts) : roadKm(d.location, target);
      const eta = onLeg ? routeMinutes(pts) : etaMinutes(km);
      const payload = { rideId: r._id, location: d.location, remainingKm: round(km), etaMin: round(eta, 1), stalled: !!d.stalled, slowed: trafficFactor(d.location) < 0.6 };
      emit(`ride:${r._id}`, 'ride:location', payload);
    }
    if (tick % 2 === 0) emit('fleet', 'fleet:update', [...fleet.values()].filter((d) => d.status !== 'offline').map((d) => ({
      _id: String(d._id), name: d.name, location: d.location, status: d.pendingOffer ? 'offered' : d.status, zoneId: d.zoneId,
      category: d.vehicle?.category, isSimulated: d.isSimulated, stalled: !!d.stalled, repositioning: !!d.repositionTarget,
      ev: d.vehicle?.fuel === 'ev', female: d.gender === 'female', childSeat: !!d.vehicle?.childSeat,
    })));
    for (const d of fleet.values()) if (!d.isSimulated && d.status !== 'offline') emit(`driver:${d._id}`, 'driver:state', publicDriver(d));
    if (tick % 3 === 0) { if (expireIncidents()) emit('fleet', 'traffic:update', traffic.incidents.map(publicIncident)); checkReroutes(); monitorDelays(); monitorSafety(); maybeRandomJam(); }
    if (tick % 5 === 0) emit('fleet', 'traffic:update', traffic.incidents.map(publicIncident));
    if (tick % 5 === 0) emit('fleet', 'zones:update', computeZoneStats());
    if (tick % 10 === 0) persistPositions();
    const simActive = [...activeRides.values()].filter((r) => r.simulated).length;
    if (settings.simRunning && settings.simRideIntervalMs > 0 && Date.now() - lastSimRide > settings.simRideIntervalMs && simActive < 9) {
      lastSimRide = Date.now();
      try { generateSimRide(); } catch (e) { console.error('[sim ride]', e.message); }
    }
  }, 1000);
  console.log(`[sim] Simulation running (speed x${settings.simSpeed}, sim ride every ${settings.simRideIntervalMs}ms)`);
}
