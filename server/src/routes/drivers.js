import { Router } from 'express';
import Ride from '../models/Ride.js';
import { auth, wrap } from '../middleware/auth.js';
import { fleet, activeRides, publicDriver, persistDriver, logEvent } from '../services/state.js';
import { respondToOffer, startArriving, pickupPassenger, completeRide, reassign, serializeRide } from '../services/dispatcher.js';
import { suggestionForDriver } from '../services/zones.js';
import { generateSimRide } from '../services/simulator.js';
import { zoneById, randomPointNear } from '../utils/geo.js';

const r = Router();
r.use(auth('driver'));

const me = (req, res) => {
  const d = fleet.get(req.user.driverId);
  if (!d) { res.status(404).json({ error: 'Driver profile not found' }); return null; }
  return d;
};

r.get('/me', (req, res) => {
  const d = me(req, res); if (!d) return;
  // Simulated riders cannot read out their PIN, so the demo shows it to the driver
  const rides = [...activeRides.values()].filter((x) => x.driver === String(d._id)).map((x) => ({ ...serializeRide(x), demoPin: x.simulated ? x.pin : undefined }));
  const offer = d.pendingOffer ? activeRides.get(d.pendingOffer) : null;
  res.json({
    driver: publicDriver(d), stops: d.stops, rides, waitingAtStop: d.waitingAtStop,
    offer: offer ? { ride: serializeRide(offer), expiresAt: offer.currentOffer?.expiresAt, match: offer.match?.chosen } : null,
    suggestion: d.status !== 'offline' ? suggestionForDriver(d) : null,
  });
});

r.post('/me/status', (req, res) => {
  const d = me(req, res); if (!d) return;
  const online = !!req.body.online;
  if (!online && d.status === 'busy') return res.status(400).json({ error: 'Finish your current ride before going offline' });
  if (!online && d.pendingOffer) respondToOffer(d.pendingOffer, String(d._id), 'rejected');
  d.status = online ? 'available' : 'offline';
  if (online) { d.onlineSince = new Date(); if (!d.lastTripEndedAt) d.lastTripEndedAt = new Date(); }
  persistDriver(d);
  logEvent('driver', `${d.name} went ${online ? 'online' : 'offline'}`);
  res.json({ driver: publicDriver(d) });
});

r.post('/offers/:rideId/respond', (req, res) => {
  const out = respondToOffer(req.params.rideId, req.user.driverId, req.body.accept ? 'accepted' : 'rejected');
  if (!out.ok) return res.status(400).json(out);
  res.json(out);
});

const action = (fn) => (req, res) => {
  const out = fn(req.params.id, req.user.driverId);
  if (!out.ok) return res.status(400).json(out);
  res.json(out);
};
r.post('/rides/:id/start', action(startArriving));
r.post('/rides/:id/pickup', (req, res) => {
  const out = pickupPassenger(req.params.id, req.user.driverId, req.body.pin);
  if (!out.ok) return res.status(400).json(out);
  res.json(out);
});
r.post('/rides/:id/complete', action(completeRide));
r.post('/rides/:id/cancel', (req, res) => {
  const ride = activeRides.get(req.params.id);
  if (!ride || ride.driver !== req.user.driverId) return res.status(404).json({ error: 'Ride not found' });
  const out = reassign(ride, 'DRIVER_CANCELLED', `${ride.driverName} cancelled (${String(req.body.reason || 'driver unavailable').slice(0, 80)})`);
  if (!out.ok) return res.status(400).json(out);
  res.json(out);
});

r.post('/me/reposition', (req, res) => {
  const d = me(req, res); if (!d) return;
  const z = zoneById(req.body.zoneId);
  if (!z) return res.status(400).json({ error: 'Unknown zone' });
  if (d.status !== 'available') return res.status(400).json({ error: 'You must be online and free to reposition' });
  d.repositionTarget = { ...randomPointNear(z, 0.4), zoneId: z.id, zoneName: z.name };
  res.json({ ok: true, target: d.repositionTarget });
});

/** DEMO: generate a simulated passenger request near this driver, offered to this driver first. */
r.post('/me/test-ride', (req, res) => {
  const d = me(req, res); if (!d) return;
  if (d.status !== 'available' || d.pendingOffer) return res.status(400).json({ error: 'Go online and be free (no active offer or ride) first' });
  const ride = generateSimRide({ pickup: randomPointNear(d.location, 1.2), forceDriverId: String(d._id), category: d.vehicle.category, type: 'solo' });
  res.json({ ok: true, ride: ride && serializeRide(ride) });
});

r.get('/me/earnings', wrap(async (req, res) => {
  const since = new Date(Date.now() - 7 * 86400000);
  const rides = await Ride.find({ driver: req.user.driverId, status: 'COMPLETED', completedAt: { $gte: since } }).lean();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400000);
    const key = day.toISOString().slice(0, 10);
    const list = rides.filter((x) => new Date(x.completedAt).toISOString().slice(0, 10) === key);
    days.push({ date: key, label: day.toLocaleDateString('en-IN', { weekday: 'short' }), trips: list.length, earnings: list.reduce((s, x) => s + (x.driverEarning || 0), 0) });
  }
  res.json({ days });
}));

export default r;
