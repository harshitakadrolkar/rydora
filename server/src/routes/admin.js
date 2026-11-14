import { Router } from 'express';
import User from '../models/User.js';
import Ride from '../models/Ride.js';
import { auth, wrap } from '../middleware/auth.js';
import { fleet, activeRides, events, settings, publicDriver, persistDriver, logEvent, acceptanceRate, idleMinutes, safetyEvents } from '../services/state.js';
import { resolveSafety } from '../services/safety.js';
import { traffic, addIncident, removeIncident, publicIncident, HOTSPOTS } from '../services/routing.js';
import { emit } from '../services/state.js';
import { reassign, cancelRide, serializeRide } from '../services/dispatcher.js';
import { generateSimRide } from '../services/simulator.js';
import { repositioningPlan, getZoneStats, prepositionPlan } from '../services/zones.js';
import { zoneById, randomPointNear, ZONES } from '../utils/geo.js';
import { dbMode } from '../config/db.js';

const r = Router();
r.use(auth('admin'));

r.get('/overview', wrap(async (req, res) => {
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const today = await Ride.find({ requestedAt: { $gte: startOfDay } }).select('status requestedAt fare waitTimeMin type reassignments pickup driverEarning prefs co2SavedKg').lean();
  const completed = today.filter((x) => x.status === 'COMPLETED');
  const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: `${h}:00`, requests: 0, completed: 0, cancelled: 0 }));
  for (const x of today) {
    const h = new Date(x.requestedAt).getHours();
    byHour[h].requests += 1;
    if (x.status === 'COMPLETED') byHour[h].completed += 1;
    if (x.status === 'CANCELLED') byHour[h].cancelled += 1;
  }
  const statusCounts = {};
  for (const x of today) statusCounts[x.status] = (statusCounts[x.status] || 0) + 1;
  const drivers = [...fleet.values()];
  const waits = completed.map((x) => x.waitTimeMin).filter((x) => x != null);
  const zoneStats = getZoneStats();
  res.json({
    dbMode,
    kpis: {
      activeRides: activeRides.size,
      onlineDrivers: drivers.filter((d) => d.status !== 'offline').length,
      availableDrivers: drivers.filter((d) => d.status === 'available').length,
      busyDrivers: drivers.filter((d) => d.status === 'busy').length,
      totalDrivers: drivers.length,
      passengers: await User.countDocuments({ role: 'passenger' }),
      ridesToday: today.length, completedToday: completed.length,
      cancelledToday: today.filter((x) => x.status === 'CANCELLED').length,
      revenueToday: completed.reduce((s, x) => s + (x.fare?.final || 0), 0),
      avgWaitMin: waits.length ? Math.round((waits.reduce((a, b) => a + b, 0) / waits.length) * 10) / 10 : 0,
      reassignmentsToday: today.reduce((s, x) => s + (x.reassignments?.length || 0), 0),
      poolRidesToday: today.filter((x) => x.type === 'pool').length,
      surgeZones: zoneStats.zones.filter((z) => z.surge > 1).length,
      evRidesToday: today.filter((x) => x.prefs?.ev).length,
      co2SavedToday: Math.round(today.reduce((s, x) => s + (x.co2SavedKg || 0), 0) * 10) / 10,
      evDrivers: drivers.filter((d) => d.vehicle?.fuel === 'ev').length,
      womenDrivers: drivers.filter((d) => d.gender === 'female').length,
      openSafety: safetyEvents.filter((e) => e.status === 'OPEN' || e.status === 'ACTIVE' || e.status === 'ESCALATED').length,
    },
    byHour, statusCounts: Object.entries(statusCounts).map(([name, value]) => ({ name, value })),
    recentPickups: today.slice(-150).map((x) => ({ lat: x.pickup?.lat, lng: x.pickup?.lng })),
    zones: zoneStats.zones, settings,
  });
}));

r.get('/passengers', wrap(async (req, res) => {
  const users = await User.find({ role: 'passenger' }).select('-passwordHash').sort({ simulated: 1, createdAt: -1 }).lean();
  const rides = await Ride.find({}).select('passenger fare requestedAt').lean();
  const map = {};
  for (const x of rides) {
    const k = String(x.passenger); const m = (map[k] = map[k] || { rides: 0, spent: 0, last: null });
    m.rides += 1; m.spent += x.fare?.final || 0;
    if (!m.last || new Date(x.requestedAt) > new Date(m.last)) m.last = x.requestedAt;
  }
  res.json({ passengers: users.map((u) => ({ ...u, rides: map[String(u._id)]?.rides || 0, spent: map[String(u._id)]?.spent || 0, lastRide: map[String(u._id)]?.last || null, activeRide: [...activeRides.values()].some((x) => x.passenger === String(u._id)) })) });
}));

r.patch('/users/:id/active', wrap(async (req, res) => {
  const u = await User.findByIdAndUpdate(req.params.id, { active: !!req.body.active }, { new: true }).select('-passwordHash');
  if (!u) return res.status(404).json({ error: 'User not found' });
  logEvent('admin', `${u.name} ${u.active ? 're-activated' : 'suspended'} by admin`);
  res.json({ user: u });
}));

r.get('/drivers', (req, res) => {
  res.json({ drivers: [...fleet.values()].map((d) => ({ ...publicDriver(d), phone: d.phone, baseAcceptance: d.baseAcceptance })) });
});

r.post('/drivers/:id/status', (req, res) => {
  const d = fleet.get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Driver not found' });
  if (d.status === 'busy') return res.status(400).json({ error: 'Driver is on a trip' });
  d.status = req.body.online ? 'available' : 'offline';
  if (req.body.online) d.onlineSince = new Date();
  persistDriver(d);
  logEvent('admin', `Admin set ${d.name} ${d.status}`);
  res.json({ driver: publicDriver(d) });
});

r.get('/rides/active', (req, res) => res.json({ rides: [...activeRides.values()].map(serializeRide).sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt)) }));

r.get('/rides', wrap(async (req, res) => {
  const q = {};
  if (req.query.status) q.status = req.query.status;
  const rides = await Ride.find(q).sort({ requestedAt: -1 }).limit(Number(req.query.limit) || 100).lean();
  res.json({ rides });
}));

r.post('/rides/:id/reassign', (req, res) => {
  const ride = activeRides.get(req.params.id);
  if (!ride) return res.status(404).json({ error: 'Active ride not found' });
  const out = reassign(ride, 'ADMIN_REASSIGN', `Admin manually reassigned the ride from ${ride.driverName}`);
  if (!out.ok) return res.status(400).json(out);
  res.json(out);
});

r.post('/rides/:id/cancel', (req, res) => {
  const ride = activeRides.get(req.params.id);
  if (!ride) return res.status(404).json({ error: 'Active ride not found' });
  const out = cancelRide(ride, 'admin', 'Cancelled by operations team');
  if (!out.ok) return res.status(400).json(out);
  res.json(out);
});

r.get('/events', (req, res) => res.json({ events }));

r.get('/settings', (req, res) => res.json({ settings }));
r.put('/settings', (req, res) => {
  const b = req.body;
  if (b.surgeEnabled !== undefined) settings.surgeEnabled = !!b.surgeEnabled;
  if (b.surgeCap !== undefined) settings.surgeCap = Math.min(4, Math.max(1, Number(b.surgeCap) || 2.5));
  if (b.surgeSensitivity !== undefined) settings.surgeSensitivity = Math.min(1, Math.max(0.05, Number(b.surgeSensitivity) || 0.35));
  if (b.simRunning !== undefined) settings.simRunning = !!b.simRunning;
  if (b.simRideIntervalMs !== undefined) settings.simRideIntervalMs = Math.max(3000, Number(b.simRideIntervalMs) || 12000);
  if (b.offerTimeoutSec !== undefined) settings.offerTimeoutSec = Math.min(60, Math.max(5, Number(b.offerTimeoutSec) || 15));
  if (b.simSpeed !== undefined) settings.simSpeed = Math.min(30, Math.max(1, Number(b.simSpeed) || 10));
  logEvent('admin', 'Platform settings updated');
  res.json({ settings });
});

r.post('/simulate/rides', (req, res) => {
  const count = Math.min(10, Math.max(1, Number(req.body.count) || 3));
  const zone = req.body.zoneId ? zoneById(req.body.zoneId) : null;
  const created = [];
  for (let i = 0; i < count; i++) {
    const ride = generateSimRide({ zone, scenario: req.body.scenario || 'normal', type: req.body.type });
    if (ride) created.push(ride.code);
  }
  logEvent('admin', `Admin generated ${created.length} simulated ride request(s)${zone ? ` in ${zone.name}` : ''}`);
  res.json({ created });
});

r.post('/reposition/apply', (req, res) => {
  const plan = repositioningPlan();
  let applied = 0;
  for (const m of plan.moves) {
    const d = fleet.get(m.driverId);
    if (!d || d.status !== 'available' || !d.isSimulated) continue;
    const z = zoneById(m.toZoneId);
    d.repositionTarget = { ...randomPointNear(z, 0.5), zoneId: z.id, zoneName: z.name };
    applied += 1;
  }
  logEvent('reposition', `Repositioning applied: ${applied} simulated drivers moving to shortage zones`);
  res.json({ applied, plan });
});

r.post('/preposition/apply', (req, res) => {
  const hour = req.body.hour !== undefined ? Number(req.body.hour) % 24 : undefined;
  const plan = prepositionPlan(hour);
  let applied = 0;
  for (const m of plan.moves) {
    const d = fleet.get(m.driverId);
    if (!d || d.status !== 'available' || !d.isSimulated) continue;
    const z = zoneById(m.toZoneId);
    d.repositionTarget = { ...randomPointNear(z, 0.6), zoneId: z.id, zoneName: z.name };
    applied += 1;
  }
  logEvent('reposition', `Proactive dispatch: ${applied} idle drivers pre-positioned for forecast demand at ${plan.targetHour}:00`);
  res.json({ applied, plan });
});

r.get('/fairness', (req, res) => {
  const drivers = [...fleet.values()].filter((d) => d.status !== 'offline');
  res.json({ drivers: drivers.map((d) => ({ name: d.name, todayTrips: d.stats.todayTrips, acceptance: acceptanceRate(d), idle: idleMinutes(d) })) });
});

r.get('/zones', (req, res) => res.json({ zones: ZONES }));

r.get('/traffic', (req, res) => res.json({ incidents: traffic.incidents.map(publicIncident), hotspots: HOTSPOTS }));
r.post('/traffic', (req, res) => {
  const h = HOTSPOTS.find((x) => x.name === req.body.place);
  if (!h) return res.status(400).json({ error: 'Choose a traffic hotspot' });
  const severity = { moderate: 0.4, heavy: 0.2, gridlock: 0.08 }[req.body.severity] ?? 0.2;
  const inc = addIncident({ center: h, name: h.name, radiusKm: 1.2, speedFactor: severity, minutes: Math.min(30, Math.max(2, Number(req.body.minutes) || 8)), cause: req.body.cause || 'Heavy traffic', source: 'admin' });
  logEvent('traffic', `Admin reported ${inc.cause.toLowerCase()} at ${inc.name} (${req.body.severity || 'heavy'})`);
  emit('fleet', 'traffic:update', traffic.incidents.map(publicIncident));
  res.json({ incident: publicIncident(inc) });
});
r.delete('/traffic/:id', (req, res) => {
  removeIncident(req.params.id);
  emit('fleet', 'traffic:update', traffic.incidents.map(publicIncident));
  res.json({ ok: true });
});

r.get('/safety', (req, res) => {
  const active = [...activeRides.values()].filter((x) => x.safety?.monitoring || x.safety?.sos || x.safety?.alerts?.length)
    .map((x) => ({ ...serializeRide(x), driverLocation: x.driver ? fleet.get(x.driver)?.location : null }));
  res.json({ events: safetyEvents, active, flaggedDrivers: [...fleet.values()].filter((d) => d.flagged).map(publicDriver) });
});

r.post('/safety/:rideId/resolve', (req, res) => {
  resolveSafety(req.params.rideId, 'RYDORA safety team');
  logEvent('safety', 'Safety case marked resolved by admin');
  res.json({ ok: true });
});

r.post('/drivers/:id/flag', (req, res) => {
  const d = fleet.get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Driver not found' });
  d.flagged = !!req.body.flagged;
  persistDriver(d);
  logEvent('safety', `${d.name} ${d.flagged ? 'suspended from new requests' : 'reinstated'} by admin`);
  res.json({ driver: publicDriver(d) });
});

export default r;
