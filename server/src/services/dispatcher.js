// DISPATCHER - ride lifecycle, driver offers, response timeouts and AUTOMATIC REASSIGNMENT.
// REQUESTED -> ACCEPTED -> ARRIVING -> ONGOING -> COMPLETED  (+ CANCELLED, + reassignment loops)
import mongoose from 'mongoose';
import { roadKm, etaMinutes, zoneOf, round, isNightHour } from '../utils/geo.js';
import User from '../models/User.js';
import { routeKm } from './routing.js';
import { fleet, activeRides, requestLog, settings, emit, persistDriver, persistRide, logEvent } from './state.js';
import { rankDrivers, explainChoice } from './matching.js';
import { estimateFare, CATEGORIES, PLATFORM_COMMISSION } from './pricing.js';
import { surgeFor } from './zones.js';
import { bestSequence, POOL_RULES } from './pooling.js';
import { notify } from './notify.js';

const offerTimers = new Map();
const newId = () => new mongoose.Types.ObjectId().toString();
const code = () => 'RYD-' + Math.random().toString(36).slice(2, 7).toUpperCase();
const MAX_DISPATCH_ATTEMPTS = 10;
const MAX_REASSIGNMENTS = 6;

export const serializeRide = (r) => {
  const { pin, ...rest } = r;
  const safety = r.safety ? { ...r.safety, shareToken: undefined, baseUrl: undefined, sharing: !!r.safety.shareToken } : r.safety;
  return { ...rest, safety, _id: String(r._id) };
};

export function addTimeline(ride, status, note) {
  ride.timeline.push({ status, at: new Date(), note });
}

export function broadcastRide(ride) {
  const data = serializeRide(ride);
  emit(`ride:${ride._id}`, 'ride:update', data);
  emit(`user:${ride.passenger}`, 'ride:update', data);
  if (ride.driver) emit(`driver:${ride.driver}`, 'ride:update', data);
  emit('admins', 'ride:update', data);
}

export function passengerNotify(ride, n) {
  notify(ride.passenger, { ...n, rideId: ride._id }, { simulated: ride.simulated });
}
export function driverNotify(d, n, ride) {
  if (!d.isSimulated && d.user) notify(String(d.user), { ...n, rideId: ride?._id }, {});
}

export function save(ride, ...drivers) {
  persistRide(ride);
  drivers.filter(Boolean).forEach(persistDriver);
  broadcastRide(ride);
}

/** Price + distance estimate for the booking screen. */
export function buildEstimate({ pickup, drop }) {
  const pz = zoneOf(pickup);
  const distanceKm = roadKm(pickup, drop);
  const durationMin = etaMinutes(distanceKm);
  const surge = surgeFor(pz.id);
  const options = Object.entries(CATEGORIES).map(([key, c]) => ({
    category: key, label: c.label, seats: c.seats,
    fare: estimateFare({ distanceKm, durationMin, category: key, surge }),
  }));
  const pool = estimateFare({ distanceKm, durationMin, category: 'sedan', surge, pool: true, matched: true });
  return {
    distanceKm: round(distanceKm), durationMin: round(durationMin, 1), surge,
    pickupZone: pz, dropZone: zoneOf(drop), options, pool,
  };
}

export function requestRide({ passenger, pickup, drop, category = 'sedan', type = 'solo', scenario = 'normal', forceDriverId = null, simulated = false, prefs = {}, greenBonus = null,
  passengers = 1, autoRebook = true, priority = false, rebookedFrom = null, rebookCount = 0, baseUrl = 'http://localhost:5000' }) {
  passengers = Math.min(6, Math.max(1, Math.round(Number(passengers) || 1)));
  if (passengers > 4) category = 'suv';                         // 5-6 people need an XL
  if (prefs.women || prefs.childSeat || passengers > 2) type = 'solo'; // pooling only for 1-2 riders without a child seat
  const pz = zoneOf(pickup); const dz = zoneOf(drop);
  const distanceKm = roadKm(pickup, drop);
  const durationMin = etaMinutes(distanceKm);
  const surge = surgeFor(pz.id);
  const isPool = type === 'pool';
  const ride = {
    _id: newId(), code: code(), passenger: String(passenger._id), passengerName: passenger.name, simulated,
    type: isPool ? 'pool' : 'solo', category: isPool ? 'sedan' : category,
    pickup: { lat: pickup.lat, lng: pickup.lng, address: pickup.address || 'Pinned location', zoneId: pz.id, zoneName: pz.name },
    drop: { lat: drop.lat, lng: drop.lng, address: drop.address || 'Pinned location', zoneId: dz.id, zoneName: dz.name },
    status: 'REQUESTED', driver: null, driverName: null, vehicle: null,
    distanceKm: round(distanceKm), durationMin: round(durationMin, 1), surge,
    fare: estimateFare({ distanceKm, durationMin, category: isPool ? 'sedan' : category, surge, pool: isPool }),
    etaPickupMin: null, requestedAt: new Date(), timeline: [], offers: [], reassignments: [],
    match: null, matchHistory: [], scenario, forceDriverId, driverArrived: false, atDrop: false, attempts: 0,
    pool: isPool ? { groupId: null, coRiders: [], matched: false } : null, currentOffer: null,
    prefs: { ev: !!prefs.ev, women: !!prefs.women, childSeat: !!prefs.childSeat }, evFallback: false,
    passengers, autoRebook: autoRebook !== false, priority: !!priority, rebookedFrom, rebookCount,
    pin: String(Math.floor(1000 + Math.random() * 9000)), pinAttempts: 0,
  };
  const night = isNightHour() || scenario === 'late_night';
  ride.safety = {
    monitoring: !!prefs.women || night || !!prefs.safety, night, alerts: [], sos: null,
    shareToken: null, sharedWith: [], minRemainingKm: null, trail: [], baseUrl,
  };
  if (greenBonus) {
    const amount = Math.min(greenBonus.cap, Math.round((ride.fare.total * greenBonus.pct) / 100));
    ride.fare.greenBonus = amount; ride.fare.total -= amount;
    ride.ecoBonusApplied = { ...greenBonus, amount };
  }
  addTimeline(ride, 'REQUESTED', `Ride requested from ${ride.pickup.zoneName} to ${ride.drop.zoneName}${surge > 1 ? ` (surge ${surge}x)` : ''}`);
  if (ride.prefs.ev) addTimeline(ride, 'REQUESTED', 'Eco ride: only electric vehicles will be offered this request');
  if (ride.prefs.women) addTimeline(ride, 'REQUESTED', 'Preference: woman driver only');
  if (passengers > 1) addTimeline(ride, 'REQUESTED', `${passengers} passengers${passengers > 4 ? ' - XL vehicle required' : ''}`);
  if (ride.prefs.childSeat) addTimeline(ride, 'REQUESTED', 'Child car seat required - only cars with a child seat will be offered');
  if (rebookedFrom) addTimeline(ride, 'REQUESTED', 'Automatically rebooked with priority matching after the previous ride was cancelled');
  if (ride.ecoBonusApplied) addTimeline(ride, 'REQUESTED', `Green bonus applied: Rs.${ride.ecoBonusApplied.amount} off`);
  if (ride.safety.monitoring) addTimeline(ride, 'REQUESTED', `Safety monitoring ON${night ? ' (night-time ride)' : ''}: route deviations and unexpected stops will alert you`);
  activeRides.set(ride._id, ride);
  requestLog.push({ zoneId: pz.id, at: Date.now() });
  logEvent('request', `${ride.code}: ${passenger.name} requested a ${ride.type} ride in ${pz.name}`, { rideId: ride._id });
  if (!simulated) passengerNotify(ride, { title: 'Searching for drivers', message: `Matching engine is ranking drivers near ${pz.name}...`, type: 'info' });
  save(ride);
  if (isPool && tryAttachPool(ride)) return ride;
  setTimeout(() => dispatch(ride._id), 400);
  return ride;
}

/** Run the matching engine and offer the ride to the best driver. */
export function dispatch(rideId) {
  const ride = activeRides.get(rideId);
  if (!ride || ride.status !== 'REQUESTED' || ride.currentOffer) return;
  const exclude = new Set(ride.offers.map((o) => o.driverId));
  const opts = {
    exclude, category: (ride.type === 'pool' || ride.prefs?.ev || ride.prefs?.women || ride.prefs?.childSeat || ride.priority) && (ride.passengers || 1) <= 4 ? null : ride.category,
    ev: !!ride.prefs?.ev && !ride.evFallback, women: !!ride.prefs?.women,
    seats: ride.passengers || 1, childSeat: !!ride.prefs?.childSeat,
  };
  let { ranked, nearest, upgraded } = rankDrivers(ride.pickup, opts);
  if (!ranked.length && opts.ev && ride.attempts >= 1) {
    ride.evFallback = true;
    addTimeline(ride, 'REQUESTED', 'No electric vehicle is free nearby - assigning the best regular vehicle instead (no green bonus for this ride)');
    passengerNotify(ride, { title: 'No EV available', message: 'All nearby EVs are busy, so a regular vehicle will be assigned. No green bonus will be earned for this ride.', type: 'warning' });
    ({ ranked, nearest, upgraded } = rankDrivers(ride.pickup, { ...opts, ev: false }));
  }
  if (ride.forceDriverId && ride.offers.length === 0) {
    const i = ranked.findIndex((r) => r.driverId === ride.forceDriverId);
    if (i > 0) ranked.unshift(ranked.splice(i, 1)[0]);
  }
  if (!ranked.length) {
    ride.attempts += 1;
    if (ride.attempts > MAX_DISPATCH_ATTEMPTS) return cancelRide(ride, 'system', 'No drivers available nearby. Please try again.');
    const waitingFor = ride.prefs?.childSeat ? 'a car with a child seat' : ride.prefs?.women ? 'a woman driver' : (ride.passengers || 1) > 4 ? 'an XL vehicle' : null;
    if (ride.attempts === 1 || ride.attempts % 4 === 0) addTimeline(ride, 'REQUESTED', waitingFor ? `Waiting for ${waitingFor} to become free - retrying automatically` : 'All nearby drivers are busy - retrying automatically');
    save(ride);
    setTimeout(() => dispatch(rideId), 5000);
    return;
  }
  const chosen = ranked[0];
  ride.match = {
    chosen, ranked: ranked.slice(0, 6), nearest, sameAsNearest: nearest?.driverId === chosen.driverId,
    explanation: explainChoice(chosen, ranked, nearest), upgraded, candidates: ranked.length,
    attempt: ride.offers.length + 1, at: new Date(),
  };
  ride.matchHistory.push({ driverId: chosen.driverId, name: chosen.name, score: chosen.score, at: new Date(), nearestId: nearest?.driverId });
  makeOffer(ride, fleet.get(chosen.driverId), chosen);
}

function makeOffer(ride, d, scored) {
  const timeoutSec = settings.offerTimeoutSec;
  d.pendingOffer = ride._id;
  d.stats.offered += 1;
  ride.currentOffer = { driverId: String(d._id), driverName: d.name, expiresAt: Date.now() + timeoutSec * 1000, score: scored.score };
  ride.offers.push({ driverId: String(d._id), driverName: d.name, at: new Date(), response: 'pending', score: scored.score, distanceKm: scored.distanceKm });
  addTimeline(ride, 'REQUESTED', `Offered to ${d.name} (score ${scored.score}, ${scored.distanceKm} km away) - waiting up to ${timeoutSec}s`);
  emit(`driver:${d._id}`, 'ride:offer', { ride: serializeRide(ride), expiresAt: ride.currentOffer.expiresAt, timeoutSec, match: scored });
  offerTimers.set(ride._id, setTimeout(() => respondToOffer(ride._id, String(d._id), 'timeout'), timeoutSec * 1000));
  if (d.isSimulated) simulateResponse(ride, d);
  save(ride, d);
}

/** Simulated drivers respond according to their behavioural acceptance probability. */
function simulateResponse(ride, d) {
  const first = ride.offers.length === 1;
  const id = ride._id; const did = String(d._id);
  if (ride.scenario === 'reject_first' && first) return setTimeout(() => respondToOffer(id, did, 'rejected'), 2500);
  if (ride.scenario === 'timeout_first' && first) return; // never responds -> timeout
  const p = d.baseAcceptance; const r = Math.random();
  if (r < p) setTimeout(() => respondToOffer(id, did, 'accepted'), 1500 + Math.random() * 2500);
  else if (r < p + (1 - p) * 0.6) setTimeout(() => respondToOffer(id, did, 'rejected'), 2000 + Math.random() * 3000);
  // else: no response -> automatic timeout handling
}

export function respondToOffer(rideId, driverId, response) {
  const ride = activeRides.get(rideId);
  const d = fleet.get(driverId);
  if (!ride || !d || ride.status !== 'REQUESTED' || ride.currentOffer?.driverId !== driverId) return { ok: false, error: 'This offer is no longer valid' };
  clearTimeout(offerTimers.get(rideId)); offerTimers.delete(rideId);
  d.pendingOffer = null;
  const offer = ride.offers[ride.offers.length - 1];
  offer.response = response; offer.respondedAt = new Date();
  ride.currentOffer = null;
  if (response === 'accepted' && d.status === 'available') {
    d.stats.accepted += 1;
    assignDriver(ride, d);
    return { ok: true, ride: serializeRide(ride) };
  }
  if (response === 'rejected') d.stats.rejected += 1; else d.stats.timeouts += 1;
  const reason = response === 'rejected' ? 'DRIVER_REJECTED' : 'RESPONSE_TIMEOUT';
  ride.reassignments.push({ at: new Date(), reason, fromDriver: d.name, fromDriverId: driverId });
  const msg = response === 'rejected' ? `${d.name} rejected the request` : `${d.name} did not respond within ${settings.offerTimeoutSec}s`;
  addTimeline(ride, 'REQUESTED', `${msg} - automatically reassigning to the next best driver`);
  emit(`driver:${driverId}`, 'ride:offer:cancelled', { rideId, reason });
  logEvent('reassign', `${ride.code}: ${msg}. Reassigning.`, { rideId });
  passengerNotify(ride, { title: 'Finding another driver', message: `${msg}. RYDORA is automatically assigning the next best driver.`, type: 'warning' });
  save(ride, d);
  setTimeout(() => dispatch(rideId), 300);
  return { ok: true };
}

function assignDriver(ride, d) {
  d.status = 'busy'; d.repositionTarget = null;
  ride.driver = String(d._id); ride.driverName = d.name; ride.vehicle = d.vehicle; ride.driverRating = d.rating;
  ride.driverIsSimulated = d.isSimulated;
  ride.status = 'ACCEPTED'; ride.acceptedAt = new Date(); ride.driverArrived = false;
  ride.etaPickupMin = round(etaMinutes(roadKm(d.location, ride.pickup)), 1);
  ride.progress = { km: roadKm(d.location, ride.pickup), at: Date.now() };
  d.stops = [...(d.stops || []), { type: 'pickup', rideId: ride._id, lat: ride.pickup.lat, lng: ride.pickup.lng }, { type: 'drop', rideId: ride._id, lat: ride.drop.lat, lng: ride.drop.lng }];
  if (ride.type === 'pool') { ride.pool.groupId = ride.pool.groupId || 'POOL-' + ride.code.slice(4); }
  addTimeline(ride, 'ACCEPTED', `${d.name} accepted - pickup ETA ${Math.round(ride.etaPickupMin)} min`);
  logEvent('accepted', `${ride.code}: assigned to ${d.name}`, { rideId: ride._id });
  passengerNotify(ride, { title: 'Driver assigned', message: `${d.name} (${d.vehicle?.model}, ${d.vehicle?.plate}) is on the way. ETA ${Math.round(ride.etaPickupMin)} min.`, type: 'success' });
  driverNotify(d, { title: 'Ride accepted', message: `Pickup ${ride.passengerName} at ${ride.pickup.address}`, type: 'success' }, ride);
  save(ride, d);
  if (d.isSimulated) setTimeout(() => startArriving(ride._id, String(d._id)), 1500);
}

export function startArriving(rideId, driverId) {
  const ride = activeRides.get(rideId);
  if (!ride || ride.driver !== driverId || ride.status !== 'ACCEPTED') return { ok: false, error: 'Ride is not in ACCEPTED state' };
  ride.status = 'ARRIVING'; ride.arrivingAt = new Date();
  ride.progress = { km: roadKm(fleet.get(driverId).location, ride.pickup), at: Date.now() };
  addTimeline(ride, 'ARRIVING', `${ride.driverName} is heading to the pickup point`);
  save(ride);
  return { ok: true, ride: serializeRide(ride) };
}

export function markArrived(ride, d, stop) {
  if (stop.type === 'pickup') {
    if (ride.driverArrived) return;
    ride.driverArrived = true; ride.arrivedAt = new Date();
    addTimeline(ride, 'ARRIVING', `${d.name} has arrived at the pickup point`);
    passengerNotify(ride, { title: 'Driver arrived', message: `${d.name} is waiting at ${ride.pickup.address}.`, type: 'success' });
    save(ride);
    if (d.isSimulated) setTimeout(() => pickupPassenger(ride._id, String(d._id)), 2000);
  } else {
    if (ride.atDrop) return;
    ride.atDrop = true;
    save(ride);
    if (d.isSimulated) setTimeout(() => completeRide(ride._id, String(d._id)), 1500);
  }
}

export function pickupPassenger(rideId, driverId, pin = null) {
  const ride = activeRides.get(rideId); const d = fleet.get(driverId);
  if (!ride || !d || ride.driver !== driverId || ride.status !== 'ARRIVING') return { ok: false, error: 'Ride must be ARRIVING' };
  if (!d.isSimulated && ride.pin && String(pin || '').trim() !== ride.pin) {
    ride.pinAttempts = (ride.pinAttempts || 0) + 1;
    addTimeline(ride, ride.status, `Driver entered an incorrect ride PIN (attempt ${ride.pinAttempts})`);
    if (ride.pinAttempts === 3) {
      passengerNotify(ride, { title: 'PIN check failed 3 times', message: 'Do not get into the car until the driver enters your PIN. Contact support if unsure.', type: 'danger' });
      logEvent('safety', `${ride.code}: ride PIN entered incorrectly 3 times by ${d.name}`, { rideId });
    }
    save(ride);
    return { ok: false, error: 'Incorrect PIN. Ask the rider for the 4-digit PIN shown in their app.' };
  }
  if (ride.pin) addTimeline(ride, 'ARRIVING', 'Ride PIN verified - correct passenger and vehicle confirmed');
  if (!ride.driverArrived && roadKm(d.location, ride.pickup) > 0.3) return { ok: false, error: 'You have not reached the pickup point yet' };
  ride.status = 'ONGOING'; ride.pickedUpAt = new Date();
  // Pickup wait = real time spent matching (offers, reassignments) + estimated drive time to pickup.
  const matchingMin = ((ride.acceptedAt ? new Date(ride.acceptedAt) : ride.pickedUpAt) - new Date(ride.requestedAt)) / 60000;
  ride.waitTimeMin = round(matchingMin + (ride.etaPickupMin || 0), 1);
  d.stops = d.stops.filter((s) => !(s.rideId === rideId && s.type === 'pickup'));
  d.waitingAtStop = false;
  addTimeline(ride, 'ONGOING', `Trip started - heading to ${ride.drop.address}`);
  passengerNotify(ride, { title: 'Trip started', message: `Enjoy your ride to ${ride.drop.address}.`, type: 'info' });
  save(ride, d);
  return { ok: true, ride: serializeRide(ride) };
}

export function completeRide(rideId, driverId) {
  const ride = activeRides.get(rideId); const d = fleet.get(driverId);
  if (!ride || !d || ride.driver !== driverId || ride.status !== 'ONGOING') return { ok: false, error: 'Ride must be ONGOING' };
  if (!ride.atDrop && roadKm(d.location, ride.drop) > 0.3) return { ok: false, error: 'You have not reached the destination yet' };
  ride.status = 'COMPLETED'; ride.completedAt = new Date();
  ride.fare.final = ride.fare.total;
  ride.driverEarning = Math.round(ride.fare.total * (1 - PLATFORM_COMMISSION));
  d.stops = d.stops.filter((s) => s.rideId !== rideId);
  d.waitingAtStop = false;
  d.stats.completed += 1; d.stats.todayTrips += 1;
  d.stats.earnings += ride.driverEarning; d.stats.todayEarnings += ride.driverEarning;
  d.stats.totalKm = round((d.stats.totalKm || 0) + ride.distanceKm, 1);
  if (!d.stops.length) { d.status = 'available'; d.lastTripEndedAt = new Date(); }
  if (ride.prefs?.ev && d.vehicle?.fuel === 'ev') {
    ride.co2SavedKg = round(ride.distanceKm * 0.12, 2); // tailpipe CO2 of an average petrol car (~120 g/km)
    ride.greenBonusEarned = true;
    if (!ride.simulated) {
      User.updateOne({ _id: ride.passenger }, { $inc: { 'eco.coupons': 1, 'eco.ecoRides': 1, 'eco.co2SavedKg': ride.co2SavedKg, 'eco.credits': 10 } }).catch(() => {});
      passengerNotify(ride, { title: 'Green bonus earned', message: `Your EV ride avoided ${ride.co2SavedKg} kg of CO2. You get 10% off your next ride (up to Rs.50).`, type: 'success' });
    }
    addTimeline(ride, 'COMPLETED', `EV ride: ${ride.co2SavedKg} kg CO2 avoided - green bonus earned for the next ride`);
  }
  addTimeline(ride, 'COMPLETED', `Ride completed. Fare Rs.${ride.fare.final}`);
  logEvent('completed', `${ride.code}: completed by ${d.name} (Rs.${ride.fare.final})`, { rideId });
  passengerNotify(ride, { title: 'Ride completed', message: `You have reached ${ride.drop.address}. Fare: Rs.${ride.fare.final}.`, type: 'success' });
  driverNotify(d, { title: 'Ride completed', message: `You earned Rs.${ride.driverEarning}.`, type: 'success' }, ride);
  activeRides.delete(rideId);
  save(ride, d);
  return { ok: true, ride: serializeRide(ride) };
}

function releaseDriver(ride, d) {
  if (!d) return;
  d.stops = (d.stops || []).filter((s) => s.rideId !== ride._id);
  d.waitingAtStop = false;
  if (!d.stops.length && d.status === 'busy') d.status = 'available';
}

function clearOffer(ride) {
  if (!ride.currentOffer) return;
  clearTimeout(offerTimers.get(ride._id)); offerTimers.delete(ride._id);
  const od = fleet.get(ride.currentOffer.driverId);
  if (od) { od.pendingOffer = null; persistDriver(od); emit(`driver:${od._id}`, 'ride:offer:cancelled', { rideId: ride._id, reason: 'CANCELLED' }); }
  ride.offers[ride.offers.length - 1].response = 'withdrawn';
  ride.currentOffer = null;
}

function autoRebook(old, reason) {
  if ([...activeRides.values()].some((x) => x.passenger === old.passenger)) return;
  const ride = requestRide({
    passenger: { _id: old.passenger, name: old.passengerName }, pickup: old.pickup, drop: old.drop, category: old.category,
    type: old.type, simulated: old.simulated, prefs: { ...old.prefs, safety: old.safety?.monitoring },
    greenBonus: old.ecoBonusApplied ? { pct: old.ecoBonusApplied.pct, cap: old.ecoBonusApplied.cap } : null,
    passengers: old.passengers, priority: true, rebookedFrom: old._id, rebookCount: (old.rebookCount || 0) + 1, baseUrl: old.safety?.baseUrl,
  });
  old.rebookedTo = ride._id; old.rebookedToCode = ride.code;
  addTimeline(old, 'CANCELLED', `Automatically rebooked as ${ride.code} - no action needed`);
  persistRide(old); broadcastRide(old);
  logEvent('rebook', `${old.code} cancelled (${reason}) -> auto-rebooked as ${ride.code}`, { rideId: ride._id });
  passengerNotify(ride, { title: 'We rebooked your ride', message: `Ride ${old.code} was cancelled (${reason}). We automatically booked ${ride.code} with priority matching - no action needed.`, type: 'warning' });
}

export function cancelRide(ride, by, reason) {
  if (['COMPLETED', 'CANCELLED'].includes(ride.status)) return { ok: false, error: 'Ride already finished' };
  if (ride.status === 'ONGOING' && by !== 'admin') return { ok: false, error: 'Trip already started' };
  clearOffer(ride);
  const d = ride.driver ? fleet.get(ride.driver) : null;
  const minsSinceAccept = ride.acceptedAt ? ((Date.now() - new Date(ride.acceptedAt)) / 60000) * settings.simSpeed : 0;
  ride.cancellationFee = by === 'passenger' && minsSinceAccept > 3 ? 30 : 0;
  releaseDriver(ride, d);
  ride.status = 'CANCELLED'; ride.cancelledAt = new Date(); ride.cancelledBy = by; ride.cancelReason = reason;
  // AUTO-REBOOK: if the ride was cancelled by the system or a driver-side failure (not by the rider or ops), book again automatically
  const willRebook = !['passenger', 'admin'].includes(by) && ride.autoRebook !== false && (ride.rebookCount || 0) < 2;
  if (ride.ecoBonusApplied && !ride.simulated && !willRebook) User.updateOne({ _id: ride.passenger }, { $inc: { 'eco.coupons': 1 } }).catch(() => {});
  if (willRebook) setTimeout(() => autoRebook(ride, reason), 600);
  addTimeline(ride, 'CANCELLED', `Cancelled by ${by}: ${reason}${ride.cancellationFee ? ` (fee Rs.${ride.cancellationFee})` : ''}`);
  if (ride.pool?.groupId) detachFromPool(ride);
  logEvent('cancelled', `${ride.code}: cancelled by ${by} (${reason})`, { rideId: ride._id });
  if (by !== 'passenger' && !willRebook) passengerNotify(ride, { title: 'Ride cancelled', message: reason, type: 'danger' });
  if (d) driverNotify(d, { title: 'Ride cancelled', message: `${ride.passengerName}'s ride was cancelled (${reason}).`, type: 'warning' }, ride);
  activeRides.delete(ride._id);
  save(ride, d);
  return { ok: true, ride: serializeRide(ride) };
}

/** Driver cancellation, delayed arrival or admin action -> automatic reassignment. */
export function reassign(ride, reason, note) {
  if (!['ACCEPTED', 'ARRIVING'].includes(ride.status)) return { ok: false, error: 'Only ACCEPTED/ARRIVING rides can be reassigned' };
  if (ride.reassignments.length >= MAX_REASSIGNMENTS) return cancelRide(ride, 'system', 'Could not find a reliable driver');
  const d = fleet.get(ride.driver);
  if (d) {
    if (reason === 'DRIVER_CANCELLED') d.stats.cancelled += 1;
    if (reason === 'DELAYED_ARRIVAL') d.stats.delays += 1;
    releaseDriver(ride, d);
    emit(`driver:${d._id}`, 'ride:removed', { rideId: ride._id, reason });
    driverNotify(d, { title: 'Ride reassigned', message: note, type: 'warning' }, ride);
  }
  if (ride.pool?.groupId) detachFromPool(ride);
  ride.reassignments.push({ at: new Date(), reason, fromDriver: ride.driverName, fromDriverId: ride.driver });
  if (!ride.offers.some((o) => o.driverId === ride.driver) && ride.driver) ride.offers.push({ driverId: ride.driver, driverName: ride.driverName, response: 'released', at: new Date() });
  ride.status = 'REQUESTED'; ride.driver = null; ride.driverName = null; ride.vehicle = null;
  ride.driverArrived = false; ride.atDrop = false; ride.acceptedAt = null; ride.etaPickupMin = null;
  addTimeline(ride, 'REQUESTED', `${note} - automatically reassigning`);
  logEvent('reassign', `${ride.code}: ${note}. Reassigning.`, { rideId: ride._id });
  passengerNotify(ride, { title: 'Reassigning your ride', message: `${note}. We are assigning a new driver automatically.`, type: 'warning' });
  save(ride, d);
  setTimeout(() => dispatch(ride._id), 300);
  return { ok: true, ride: serializeRide(ride) };
}

// ---------------- Pooling (live) ----------------
function groupRides(groupId) {
  return [...activeRides.values()].filter((r) => r.pool?.groupId === groupId && ['ACCEPTED', 'ARRIVING', 'ONGOING'].includes(r.status));
}

function detachFromPool(ride) {
  const others = groupRides(ride.pool.groupId).filter((r) => r._id !== ride._id);
  for (const o of others) {
    o.pool.coRiders = o.pool.coRiders.filter((c) => c.rideId !== ride._id);
    addTimeline(o, o.status, `Co-rider ${ride.passengerName} left the pool`);
    save(o);
  }
}

/** Try to add a pool request to an existing pooled trip (insertion with optimal re-sequencing). */
function tryAttachPool(ride) {
  let best = null;
  for (const d of fleet.values()) {
    if (d.status !== 'busy' || d.stalled || d.pendingOffer || d.flagged) continue;
    if (ride.prefs?.ev && d.vehicle?.fuel !== 'ev') continue;
    const current = [...activeRides.values()].filter((r) => r.driver === String(d._id) && ['ACCEPTED', 'ARRIVING', 'ONGOING'].includes(r.status));
    if (!current.length || current.some((r) => r.type !== 'pool') || current.length >= POOL_RULES.maxRiders) continue;
    const occupied = current.reduce((n, r) => n + (r.passengers || 1), 0);
    if (ride.prefs?.childSeat || occupied + (ride.passengers || 1) > (d.vehicle?.seats || 4)) continue;
    const pickupKm = roadKm(d.location, ride.pickup);
    if (pickupKm > 4) continue;
    const riders = current.map((r) => ({
      id: r._id, pickup: r.pickup, drop: r.drop, picked: r.status === 'ONGOING', soloKm: r.distanceKm,
      remainingKm: r.status === 'ONGOING' ? roadKm(d.location, r.drop) : undefined,
    }));
    const beforeKm = (bestSequence(d.location, riders) || { totalKm: Infinity }).totalKm;
    riders.push({ id: ride._id, pickup: ride.pickup, drop: ride.drop, picked: false, soloKm: ride.distanceKm });
    const seq = bestSequence(d.location, riders);
    if (!seq) continue;
    const addedKm = seq.totalKm - (Number.isFinite(beforeKm) ? beforeKm : 0);
    if (addedKm > ride.distanceKm * 0.9) continue; // must be cheaper than a separate vehicle
    if (!best || addedKm < best.addedKm) best = { d, seq, current, addedKm, pickupKm };
  }
  if (!best) return false;
  const { d, seq, current, addedKm, pickupKm } = best;
  const groupId = current[0].pool.groupId || 'POOL-' + current[0].code.slice(4);
  d.stops = seq.sequence.map((s) => ({ type: s.type, rideId: s.riderId, lat: s.point.lat, lng: s.point.lng }));
  ride.driver = String(d._id); ride.driverName = d.name; ride.vehicle = d.vehicle; ride.driverRating = d.rating; ride.driverIsSimulated = d.isSimulated;
  ride.status = 'ACCEPTED'; ride.acceptedAt = new Date(); ride.etaPickupMin = round(etaMinutes(pickupKm), 1);
  ride.progress = { km: pickupKm, at: Date.now() };
  ride.match = {
    pooled: true, chosen: { driverId: String(d._id), name: d.name, distanceKm: round(pickupKm), etaMin: ride.etaPickupMin, score: null },
    ranked: [], nearest: null, sameAsNearest: true,
    explanation: `Matched into an existing pool trip driven by ${d.name}. Optimal re-sequencing adds only ${round(addedKm, 1)} km to the route versus ${ride.distanceKm} km for a separate vehicle. Stop order: ${seq.sequence.map((s) => `${s.type === 'pickup' ? 'P' : 'D'}(${s.riderId === ride._id ? ride.passengerName : current.find((c) => c._id === s.riderId)?.passengerName})`).join(' -> ')}.`,
    at: new Date(),
  };
  const members = [...current, ride];
  for (const r of members) {
    r.pool = r.pool || {};
    r.pool.groupId = groupId; r.pool.matched = true;
    r.pool.coRiders = members.filter((m) => m._id !== r._id).map((m) => ({ rideId: m._id, name: m.passengerName, pickup: m.pickup.address, drop: m.drop.address }));
    r.pool.sequence = seq.sequence.map((s) => ({ type: s.type, rideId: s.riderId, name: members.find((m) => m._id === s.riderId)?.passengerName }));
    const newFare = estimateFare({ distanceKm: r.distanceKm, durationMin: r.durationMin, category: 'sedan', surge: r.surge, pool: true, matched: true });
    if (r.fare.greenBonus) { newFare.greenBonus = r.fare.greenBonus; newFare.total -= r.fare.greenBonus; }
    if (newFare.total < r.fare.total) r.fare = newFare;
    r.pool.savings = r.fare.soloEquivalent - r.fare.total;
    if (r._id !== ride._id) { addTimeline(r, r.status, `${ride.passengerName} joined your pool - your fare dropped to Rs.${r.fare.total}`); passengerNotify(r, { title: 'Pool matched', message: `${ride.passengerName} joined your ride. New fare Rs.${r.fare.total}.`, type: 'success' }); save(r); }
  }
  addTimeline(ride, 'ACCEPTED', `Pooled with ${current.map((c) => c.passengerName).join(', ')} in ${d.name}'s vehicle - you save Rs.${ride.pool.savings}`);
  ride.status = 'ARRIVING'; ride.arrivingAt = new Date();
  addTimeline(ride, 'ARRIVING', `${d.name} will pick you up (ETA ${Math.round(ride.etaPickupMin)} min)`);
  logEvent('pool', `${ride.code}: pooled into ${groupId} with ${d.name} (+${round(addedKm, 1)} km)`, { rideId: ride._id });
  passengerNotify(ride, { title: 'Pool matched', message: `Sharing with ${current.map((c) => c.passengerName).join(', ')}. You save Rs.${ride.pool.savings}.`, type: 'success' });
  driverNotify(d, { title: 'New pool passenger', message: `${ride.passengerName} added to your pool trip.`, type: 'info' }, ride);
  // the driver's existing ACCEPTED rides should start moving too
  for (const r of current) if (r.status === 'ACCEPTED' && d.isSimulated) startArriving(r._id, String(d._id));
  save(ride, d);
  return true;
}

// ---------------- Delay monitor ----------------
/** Detects delayed arrival (no progress / far beyond ETA) and reassigns automatically. */
export function monitorDelays() {
  const now = Date.now();
  for (const ride of activeRides.values()) {
    if (!['ACCEPTED', 'ARRIVING'].includes(ride.status) || ride.driverArrived || !ride.driver) continue;
    const d = fleet.get(ride.driver);
    if (!d) continue;
    const onLeg = d.path?.length && d.pathFor === `${ride._id}:pickup`;
    const km = onLeg ? routeKm([d.location, ...d.path]) : roadKm(d.location, ride.pickup);
    if (!ride.progress) ride.progress = { km, at: now };
    if (km < ride.progress.km - 0.03) ride.progress = { km, at: now };
    const stuckSec = (now - ride.progress.at) / 1000;
    const sinceAccept = (now - new Date(ride.acceptedAt).getTime()) / 1000;
    const expectedSec = Math.max(20, ((ride.etaPickupMin || 5) * 60) / settings.simSpeed);
    const nextIsThis = d.stops?.[0]?.rideId === ride._id;
    let delayed = null;
    if (ride.status === 'ACCEPTED' && sinceAccept > 60) delayed = `${d.name} did not start towards the pickup within 60s`;
    else if (ride.status === 'ARRIVING' && nextIsThis && stuckSec > 15) delayed = `${d.name} has stopped moving (no progress for ${Math.round(stuckSec)}s)`;
    else if (ride.status === 'ARRIVING' && sinceAccept > expectedSec * 2.5 + 30) delayed = `${d.name} is significantly delayed vs. the ${Math.round(ride.etaPickupMin)} min ETA`;
    if (delayed) {
      ride.delayDetected = { at: new Date(), message: delayed };
      reassign(ride, 'DELAYED_ARRIVAL', `Delayed arrival detected: ${delayed}`);
    }
  }
}
