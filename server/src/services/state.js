// In-memory live state (single source of truth for the real-time engine).
// Everything is persisted to MongoDB through persistDriver / persistRide.
import Driver from '../models/Driver.js';
import Ride from '../models/Ride.js';
import { config } from '../config/env.js';

export const fleet = new Map();       // driverId -> live driver object
export const activeRides = new Map(); // rideId -> live ride object (non-terminal)
export const requestLog = [];         // [{zoneId, at}] rolling log of ride requests (demand signal)
export const events = [];             // recent system events for the admin feed
export const safetyEvents = [];       // safety alerts / SOS log for the Safety Centre

export const settings = {
  surgeEnabled: true,
  surgeCap: 2.5,
  surgeSensitivity: 0.35,
  simRunning: true,
  simRideIntervalMs: config.simRideIntervalMs,
  offerTimeoutSec: config.offerTimeoutSec,
  simSpeed: config.simSpeed,
};

let io = null;
export const setIO = (s) => { io = s; };
export const getIO = () => io;
export const emit = (room, event, payload) => { if (io) io.to(room).emit(event, payload); };

const LIVE_ONLY = ['stops', 'pendingOffer', 'stalled', 'repositionTarget', 'waitingAtStop', 'detourTarget', 'path', 'pathFor', 'routeVersion', 'wander', '_id'];

export function persistDriver(d) {
  const doc = {};
  for (const [k, v] of Object.entries(d)) if (!LIVE_ONLY.includes(k)) doc[k] = v;
  return Driver.updateOne({ _id: d._id }, { $set: doc }).catch((e) => console.error('[persistDriver]', e.message));
}

export function persistRide(r) {
  const { _id, ...rest } = r;
  return Ride.updateOne({ _id }, { $set: rest }, { upsert: true }).catch((e) => console.error('[persistRide]', e.message));
}

export function logEvent(type, message, extra = {}) {
  const ev = { type, message, at: new Date(), ...extra };
  events.unshift(ev);
  if (events.length > 150) events.pop();
  emit('admins', 'admin:event', ev);
  return ev;
}

export function idleMinutes(d) {
  if (d.status !== 'available') return 0;
  const since = d.lastTripEndedAt || d.onlineSince || new Date();
  return Math.max(0, (Date.now() - new Date(since).getTime()) / 60000);
}

export function publicDriver(d) {
  return {
    _id: String(d._id), name: d.name, vehicle: d.vehicle, location: d.location, zoneId: d.zoneId,
    status: d.status, isSimulated: d.isSimulated, rating: d.rating, stats: d.stats,
    acceptanceRate: acceptanceRate(d), idleMinutes: Math.round(idleMinutes(d)),
    stopsCount: d.stops?.length || 0, stalled: !!d.stalled, hasOffer: !!d.pendingOffer,
    repositionTarget: d.repositionTarget || null, user: d.user ? String(d.user) : null,
    gender: d.gender || 'male', ev: d.vehicle?.fuel === 'ev', flagged: !!d.flagged, childSeat: !!d.vehicle?.childSeat, seats: d.vehicle?.seats || 4,
  };
}

/** Observed acceptance rate with a Bayesian prior (avoids 0/100% on new drivers). */
export function acceptanceRate(d) {
  const prior = 10;
  const s = d.stats || {};
  return ((s.accepted || 0) + d.baseAcceptance * prior) / ((s.offered || 0) + prior);
}

export const onlineDrivers = () => [...fleet.values()].filter((d) => d.status !== 'offline');
