// Public, read-only trip sharing for family members (no login required).
import { Router } from 'express';
import Ride from '../models/Ride.js';
import { wrap } from '../middleware/auth.js';
import { activeRides, fleet } from '../services/state.js';
import { roadKm, etaMinutes, round } from '../utils/geo.js';

const r = Router();

r.get('/share/:token', wrap(async (req, res) => {
  const token = String(req.params.token);
  let ride = [...activeRides.values()].find((x) => x.safety?.shareToken === token);
  const live = !!ride;
  if (!ride) ride = await Ride.findOne({ 'safety.shareToken': token }).lean();
  if (!ride) return res.status(404).json({ error: 'This trip link is invalid or has been stopped by the rider' });
  const endedAt = ride.completedAt || ride.cancelledAt;
  if (!live && endedAt && Date.now() - new Date(endedAt).getTime() > 2 * 3600000) return res.status(410).json({ error: 'This trip ended more than 2 hours ago, so the link has expired' });
  const d = live && ride.driver ? fleet.get(String(ride.driver)) : null;
  const target = ride.status === 'ONGOING' ? ride.drop : ride.pickup;
  res.json({
    code: ride.code, status: ride.status, live, passengerName: String(ride.passengerName || '').split(' ')[0],
    driverName: ride.driverName, vehicle: ride.vehicle ? { model: ride.vehicle.model, plate: ride.vehicle.plate } : null,
    pickup: ride.pickup, drop: ride.drop, driverLocation: d?.location || null,
    etaMin: d ? round(etaMinutes(roadKm(d.location, target)), 1) : null,
    sos: ride.safety?.sos || null, trail: (ride.safety?.trail || []).map((p) => ({ lat: p.lat, lng: p.lng })), alerts: (ride.safety?.alerts || []).map((a) => ({ type: a.type, message: a.message, at: a.at, status: a.status })),
    updatedAt: new Date(),
  });
}));

export default r;
