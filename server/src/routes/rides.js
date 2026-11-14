import { Router } from 'express';
import Ride from '../models/Ride.js';
import { auth, wrap } from '../middleware/auth.js';
import { isPoint } from '../utils/validate.js';
import { activeRides, fleet } from '../services/state.js';
import { buildEstimate, requestRide, cancelRide, serializeRide, broadcastRide } from '../services/dispatcher.js';
import { rankDrivers, explainChoice } from '../services/matching.js';
import { PLACES } from '../data/places.js';
import User from '../models/User.js';
import { shareTrip, triggerSOS, acknowledge, HELPLINES } from '../services/safety.js';
import { perpendicularPoint } from '../utils/geo.js';
import { traffic, addIncident, publicIncident, nearestLandmark, routeKm as pathKm } from '../services/routing.js';
import { emit } from '../services/state.js';

const baseUrl = (req) => req.headers.origin || `${req.protocol}://${req.get('host')}`;
import { ZONES } from '../utils/geo.js';

const r = Router();

r.get('/places', (req, res) => res.json({ places: PLACES, zones: ZONES }));

const pt = (p) => ({ lat: +p.lat, lng: +p.lng, address: String(p.address || 'Pinned location').slice(0, 120) });

r.post('/estimate', auth(), wrap(async (req, res) => {
  const { pickup, drop, category = 'sedan' } = req.body;
  if (!isPoint(pickup) || !isPoint(drop)) return res.status(400).json({ error: 'Pickup and destination must be valid locations inside the service area' });
  const est = buildEstimate({ pickup: pt(pickup), drop: pt(drop) });
  if (est.distanceKm < 0.5) return res.status(400).json({ error: 'Pickup and destination are too close (min 0.5 km)' });
  const ev = !!req.body.ev; const women = !!req.body.women; const childSeat = !!req.body.childSeat;
  const seats = Math.min(6, Math.max(1, Number(req.body.passengers) || 1));
  const { ranked, nearest, upgraded } = rankDrivers(pt(pickup), { category: (ev || women || childSeat) && seats <= 4 ? null : seats > 4 ? 'suv' : category, ev, women, seats, childSeat });
  const childSeatNearby = rankDrivers(pt(pickup), { childSeat: true }).ranked.length;
  const seatsNearby = rankDrivers(pt(pickup), { seats }).ranked.length;
  const evNearby = rankDrivers(pt(pickup), { ev: true }).ranked.length;
  const womenNearby = rankDrivers(pt(pickup), { women: true }).ranked.length;
  const user = req.user.role === 'passenger' ? await User.findById(req.user.id).lean() : null;
  res.json({
    ...est, upgraded, evNearby, womenNearby, childSeatNearby, seatsNearby, co2Kg: Math.round(est.distanceKm * 0.12 * 100) / 100,
    greenCoupons: user?.eco?.coupons || 0, greenBonus: { pct: 10, cap: 50 },
    drivers: ranked.slice(0, 8), nearest,
    explanation: ranked.length ? explainChoice(ranked[0], ranked, nearest) : women ? 'No woman driver is free right now. Your request will wait for one.' : ev ? 'No electric vehicle is free nearby right now.' : 'No drivers are currently available nearby.',
  });
}));

r.post('/', auth('passenger'), wrap(async (req, res) => {
  const { pickup, drop, category = 'sedan', type = 'solo', scenario = 'normal' } = req.body;
  if (!isPoint(pickup) || !isPoint(drop)) return res.status(400).json({ error: 'Please choose a valid pickup and destination' });
  if (!['mini', 'sedan', 'suv'].includes(category)) return res.status(400).json({ error: 'Invalid vehicle category' });
  if (!['solo', 'pool'].includes(type)) return res.status(400).json({ error: 'Invalid ride type' });
  if (!['normal', 'reject_first', 'timeout_first', 'late_night'].includes(scenario)) return res.status(400).json({ error: 'Invalid scenario' });
  const existing = [...activeRides.values()].find((x) => x.passenger === req.user.id);
  if (existing) return res.status(409).json({ error: 'You already have an active ride', rideId: existing._id });
  const prefs = { ev: !!req.body.ev, women: !!req.body.women, safety: !!req.body.safety };
  let greenBonus = null;
  if (req.body.applyGreenBonus) {
    const u = await User.findById(req.user.id).lean();
    if ((u?.eco?.coupons || 0) > 0) {
      greenBonus = { pct: 10, cap: 50 };
      await User.updateOne({ _id: req.user.id }, { $inc: { 'eco.coupons': -1 } });
    }
  }
  const passengers = Number(req.body.passengers || 1);
  if (!Number.isInteger(passengers) || passengers < 1 || passengers > 6) return res.status(400).json({ error: 'Passengers must be between 1 and 6' });
  prefs.childSeat = !!req.body.childSeat;
  const ride = requestRide({ passenger: { _id: req.user.id, name: req.user.name }, pickup: pt(pickup), drop: pt(drop), category, type, scenario, prefs, greenBonus,
    passengers, autoRebook: req.body.autoRebook !== false, baseUrl: baseUrl(req) });
  res.status(201).json({ ride: { ...serializeRide(ride), pin: ride.pin } });
}));

r.get('/active', auth('passenger'), (req, res) => {
  const ride = [...activeRides.values()].find((x) => x.passenger === req.user.id);
  res.json({ ride: ride ? { ...serializeRide(ride), pin: ride.pin } : null });
});

r.get('/mine', auth('passenger', 'driver'), wrap(async (req, res) => {
  const q = req.user.role === 'driver' ? { driver: req.user.driverId } : { passenger: req.user.id };
  const rides = await Ride.find(q).sort({ requestedAt: -1 }).limit(200).lean();
  res.json({ rides });
}));

r.get('/:id', auth(), wrap(async (req, res) => {
  const live = activeRides.get(req.params.id);
  const ride = live ? serializeRide(live) : await Ride.findById(req.params.id).lean().catch(() => null);
  if (!ride) return res.status(404).json({ error: 'Ride not found' });
  const u = req.user;
  if (u.role === 'passenger' && String(ride.passenger) !== u.id) return res.status(403).json({ error: 'Not your ride' });
  if (u.role === 'driver' && String(ride.driver) !== u.driverId) return res.status(403).json({ error: 'Not your ride' });
  const d = ride.driver ? fleet.get(String(ride.driver)) : null;
  if (u.role === 'driver') delete ride.pin; else if (live) ride.pin = live.pin;
  res.json({ ride, driverLocation: d?.location || null });
}));

r.post('/:id/cancel', auth('passenger', 'admin'), (req, res) => {
  const ride = activeRides.get(req.params.id);
  if (!ride) return res.status(404).json({ error: 'Active ride not found' });
  if (req.user.role === 'passenger' && ride.passenger !== req.user.id) return res.status(403).json({ error: 'Not your ride' });
  const reason = String(req.body.reason || 'Changed plans').slice(0, 100);
  const out = cancelRide(ride, req.user.role, reason);
  if (!out.ok) return res.status(400).json(out);
  res.json(out);
});

/** DEMO: simulate a delayed / stuck driver so automatic delay detection can be shown. */
r.post('/:id/simulate-delay', auth('passenger', 'admin'), (req, res) => {
  const ride = activeRides.get(req.params.id);
  if (!ride || !ride.driver) return res.status(400).json({ error: 'Ride has no assigned driver yet' });
  if (!['ACCEPTED', 'ARRIVING'].includes(ride.status)) return res.status(400).json({ error: 'Delay can only be simulated before pickup' });
  const d = fleet.get(ride.driver);
  d.stalled = true; d.stalledAt = Date.now();
  ride.timeline.push({ status: ride.status, at: new Date(), note: `[DEMO] ${d.name}'s vehicle stopped (simulated traffic jam / breakdown)` });
  broadcastRide(ride);
  res.json({ ok: true, message: 'Driver stalled. Delay detection will trigger automatic reassignment within ~15 seconds.' });
});

// ---------------- Safety ----------------
const ownActive = (req, res) => {
  const ride = activeRides.get(req.params.id);
  if (!ride) { res.status(404).json({ error: 'This ride is no longer active' }); return null; }
  if (req.user.role === 'passenger' && ride.passenger !== req.user.id) { res.status(403).json({ error: 'Not your ride' }); return null; }
  return ride;
};

r.post('/:id/share', auth('passenger', 'admin'), wrap(async (req, res) => {
  const ride = ownActive(req, res); if (!ride) return;
  res.json(await shareTrip(ride, baseUrl(req)));
}));

/** DEMO: the system cancels the ride (e.g. the driver can't make it in time) -> automatic rebooking. */
r.post('/:id/simulate-cancel', auth('passenger', 'admin'), (req, res) => {
  const ride = ownActive(req, res); if (!ride) return;
  if (ride.status === 'ONGOING') return res.status(400).json({ error: 'The trip has already started' });
  const out = cancelRide(ride, 'system', 'Driver could not reach you in time');
  if (!out.ok) return res.status(400).json(out);
  res.json({ ok: true, message: 'Ride cancelled by the system. Watch: a new ride is booked automatically in about a second.' });
});

r.post('/:id/share/stop', auth('passenger'), (req, res) => {
  const ride = ownActive(req, res); if (!ride) return;
  ride.safety.shareToken = null; ride.safety.sharedWith = [];
  ride.timeline.push({ status: ride.status, at: new Date(), note: 'Trip sharing stopped by rider - the old link no longer works' });
  broadcastRide(ride);
  res.json({ ok: true });
});

r.post('/:id/sos', auth('passenger'), wrap(async (req, res) => {
  const ride = ownActive(req, res); if (!ride) return;
  res.json({ ok: true, ...(await triggerSOS(ride, baseUrl(req), String(req.body.reason || 'Rider pressed SOS').slice(0, 120))) });
}));

r.post('/:id/safety/ack', auth('passenger'), (req, res) => {
  const ride = ownActive(req, res); if (!ride) return;
  acknowledge(ride, req.body.response === 'unsafe' ? 'unsafe' : 'safe');
  res.json({ ok: true });
});

r.post('/:id/safety/monitor', auth('passenger'), (req, res) => {
  const ride = ownActive(req, res); if (!ride) return;
  ride.safety.monitoring = !!req.body.on;
  ride.timeline.push({ status: ride.status, at: new Date(), note: `Safety monitoring turned ${ride.safety.monitoring ? 'ON' : 'OFF'} by rider` });
  broadcastRide(ride);
  res.json({ ok: true });
});

r.get('/meta/traffic', auth(), (req, res) => res.json({ incidents: traffic.incidents.map(publicIncident) }));

/** DEMO: create heavy traffic on the road ahead of this ride's driver to trigger automatic rerouting. */
r.post('/:id/simulate-traffic', auth('passenger', 'admin'), (req, res) => {
  const ride = activeRides.get(req.params.id);
  if (!ride) return res.status(404).json({ error: 'Ride not active' });
  if (req.user.role === 'passenger' && ride.passenger !== req.user.id) return res.status(403).json({ error: 'Not your ride' });
  if (!['ARRIVING', 'ONGOING'].includes(ride.status) || !ride.driver) return res.status(400).json({ error: 'Traffic can be simulated once the driver is on the way' });
  const d = fleet.get(ride.driver);
  const pts = [d.location, ...(d.path || [ride.status === 'ONGOING' ? ride.drop : ride.pickup])];
  const remaining = pathKm(pts);
  if (remaining < 2) return res.status(400).json({ error: `Only ${remaining.toFixed(1)} km of road left - try during the trip, when there is room for a different route` });
  // put the jam in the middle of the remaining route, clear of the car and the destination
  let total = 0; const seg = [];
  for (let i = 1; i < pts.length; i++) { const k = Math.hypot(pts[i].lat - pts[i - 1].lat, pts[i].lng - pts[i - 1].lng); seg.push(k); total += k; }
  let want = total * 0.5; let center = pts[pts.length - 1];
  for (let i = 0; i < seg.length; i++) { if (want <= seg[i]) { const f = want / seg[i]; center = { lat: pts[i].lat + (pts[i + 1].lat - pts[i].lat) * f, lng: pts[i].lng + (pts[i + 1].lng - pts[i].lng) * f }; break; } want -= seg[i]; }
  const inc = addIncident({ center, name: nearestLandmark(center), radiusKm: Math.min(0.9, remaining * 0.18), speedFactor: 0.1, minutes: 6, cause: 'Heavy traffic', source: 'demo' });
  ride.timeline.push({ status: ride.status, at: new Date(), note: `[DEMO] Heavy traffic reported near ${inc.name} on your route` });
  broadcastRide(ride);
  emit('fleet', 'traffic:update', traffic.incidents.map(publicIncident));
  res.json({ ok: true, incident: publicIncident(inc), message: `Heavy traffic created near ${inc.name}. RYDORA will look for a faster road within a few seconds.` });
});

r.get('/meta/helplines', (req, res) => res.json({ helplines: HELPLINES }));

/** DEMO: make the driver take a wrong turn so route-deviation detection can be shown. */
r.post('/:id/simulate-detour', auth('passenger', 'admin'), (req, res) => {
  const ride = ownActive(req, res); if (!ride) return;
  if (ride.status !== 'ONGOING') return res.status(400).json({ error: 'Start the trip first - a wrong turn can only be simulated during the trip' });
  const d = fleet.get(ride.driver);
  d.detourTarget = perpendicularPoint(d.location, ride.pickup, ride.drop, 2.2, Math.random() < 0.5 ? 1 : -1);
  ride.safety.monitoring = true;
  ride.timeline.push({ status: ride.status, at: new Date(), note: '[DEMO] Driver takes an unexpected turn away from the route' });
  broadcastRide(ride);
  res.json({ ok: true, message: 'The driver is now leaving the route. A safety alert will appear within a few seconds.' });
});

r.post('/:id/rate', auth('passenger'), wrap(async (req, res) => {
  const rating = Number(req.body.rating);
  if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'Rating must be 1-5' });
  const ride = await Ride.findOne({ _id: req.params.id, passenger: req.user.id });
  if (!ride || ride.status !== 'COMPLETED') return res.status(400).json({ error: 'Only completed rides can be rated' });
  ride.set('rating', rating); await ride.save();
  const d = fleet.get(String(ride.driver));
  if (d) d.rating = Math.round(((d.rating * 20 + rating) / 21) * 100) / 100;
  res.json({ ok: true });
}));

export default r;
