// WOMEN & NIGHT SAFETY: route-deviation / unexpected-stop detection, trip sharing and SOS.
import User from '../models/User.js';
import { haversine, crossTrackKm, round, roadKm } from '../utils/geo.js';
import { fleet, activeRides, safetyEvents, emit, persistDriver, logEvent } from './state.js';
import { addTimeline, save, passengerNotify } from './dispatcher.js';
import { routeKm } from './routing.js';

export const HELPLINES = [
  { name: 'Emergency (Police / Ambulance / Fire)', number: '112' },
  { name: 'Women Helpline (Police)', number: '1091' },
  { name: 'Women Helpline (National)', number: '181' },
];
const DEVIATION_KM = 0.6;     // distance from the direct route that counts as "off route"
const AWAY_KM = 0.5;          // moving this much further from the destination than the best point so far
const STOP_SEC = 25;          // stopped this long mid-trip (simulated time is 15x faster)

const newId = () => Math.random().toString(36).slice(2, 10);

function logSafety(ride, type, message, extra = {}) {
  const ev = {
    id: newId(), rideId: ride._id, code: ride.code, passengerName: ride.passengerName, passenger: ride.passenger,
    driverName: ride.driverName, driverId: ride.driver, plate: ride.vehicle?.plate, type, message,
    at: new Date(), status: 'OPEN', location: ride.driver ? fleet.get(ride.driver)?.location : null, ...extra,
  };
  safetyEvents.unshift(ev);
  if (safetyEvents.length > 100) safetyEvents.pop();
  emit('admins', 'safety:alert', ev);
  logEvent('safety', `${ride.code}: ${message}`, { rideId: ride._id });
  return ev;
}

export function raiseAlert(ride, type, message) {
  const d = ride.driver ? fleet.get(ride.driver) : null;
  const alert = { id: newId(), type, message, at: new Date(), location: d?.location || null, status: 'OPEN' };
  ride.safety.alerts.push(alert);
  addTimeline(ride, ride.status, `Safety alert: ${message}`);
  passengerNotify(ride, { title: type === 'ROUTE_DEVIATION' ? 'Route deviation detected' : 'Unexpected stop detected', message: `${message} Tap "Share trip with family" or "SOS" if you feel unsafe.`, type: 'danger' });
  emit(`ride:${ride._id}`, 'ride:safety', { rideId: ride._id, alert });
  logSafety(ride, type, message);
  save(ride);
  return alert;
}

/** Runs every few seconds from the simulator. */
export function monitorSafety() {
  const now = Date.now();
  for (const ride of activeRides.values()) {
    const s = ride.safety;
    if (!s) continue;
    // breadcrumb trail of the vehicle (shown to the safety team and family)
    if ((s.monitoring || s.sos) && ride.driver && ['ARRIVING', 'ONGOING'].includes(ride.status)) {
      const loc = fleet.get(ride.driver)?.location;
      if (loc && (!s.trail.length || haversine(s.trail[s.trail.length - 1], loc) > 0.05)) { s.trail.push({ lat: loc.lat, lng: loc.lng, at: new Date() }); if (s.trail.length > 300) s.trail.shift(); }
    }
    // AUTO-ESCALATION: an alert nobody answers within 60 s becomes an SOS automatically
    const stale = (s.alerts || []).find((a) => a.status === 'OPEN' && now - new Date(a.at).getTime() > 60000);
    if (stale && !s.sos) { triggerSOS(ride, s.baseUrl || 'http://localhost:5000', 'No response to a safety alert within 60 seconds (automatic escalation)'); continue; }
    if (!s.monitoring || ride.status !== 'ONGOING' || !ride.driver || ride.atDrop) continue;
    const d = fleet.get(ride.driver);
    if (!d) continue;
    const pts = ride.route?.leg === 'drop' && ride.route.points?.length > 1 ? ride.route.points : [ride.pickup, ride.drop];
    let off = Infinity;
    for (let i = 1; i < pts.length; i++) off = Math.min(off, crossTrackKm(d.location, pts[i - 1], pts[i]));
    const onLeg = d.path && d.pathFor === `${ride._id}:drop`;
    const remaining = onLeg ? routeKm([d.location, ...d.path]) : haversine(d.location, ride.drop);
    s.minRemainingKm = Math.min(s.minRemainingKm ?? remaining, remaining);
    const awayBy = remaining - s.minRemainingKm;
    if ((off > DEVIATION_KM || awayBy > AWAY_KM) && (!s.lastDeviationAt || now - s.lastDeviationAt > 45000)) {
      s.lastDeviationAt = now;
      raiseAlert(ride, 'ROUTE_DEVIATION', off > DEVIATION_KM
        ? `The driver has left the planned route and is ${round(off, 1)} km away from it.`
        : `The vehicle is moving away from your destination (${round(awayBy, 1)} km further than before).`);
    }
    if (!s.lastPos || haversine(s.lastPos.loc, d.location) > 0.03) s.lastPos = { loc: d.location, at: now };
    else if (now - s.lastPos.at > STOP_SEC * 1000 && !s.stopAlertedAt) {
      s.stopAlertedAt = now;
      raiseAlert(ride, 'UNEXPECTED_STOP', 'The vehicle has stopped unexpectedly in the middle of your trip.');
    }
    if (s.stopAlertedAt && haversine(s.lastPos.loc, d.location) > 0.03) s.stopAlertedAt = null;
  }
}

/** Builds a live-tracking link and (simulated) messages for the rider's trusted contacts. */
export async function shareTrip(ride, baseUrl) {
  ride.safety.shareToken = ride.safety.shareToken || newId() + newId();
  const url = `${baseUrl}/share/${ride.safety.shareToken}`;
  const user = ride.simulated ? null : await User.findById(ride.passenger).lean().catch(() => null);
  const contacts = user?.emergencyContacts || [];
  const message = `RYDORA trip alert: ${ride.passengerName} is travelling with ${ride.driverName || 'a RYDORA driver'}` +
    `${ride.vehicle?.plate ? ` (${ride.vehicle.model}, ${ride.vehicle.plate})` : ''} from ${ride.pickup.address} to ${ride.drop.address}. ` +
    `Follow the live location: ${url}`;
  const sentTo = contacts.map((c) => ({
    name: c.name, phone: c.phone, relation: c.relation,
    whatsapp: `https://wa.me/${String(c.phone).replace(/\D/g, '').replace(/^(\d{10})$/, '91$1')}?text=${encodeURIComponent(message)}`,
  }));
  ride.safety.sharedWith = [...new Set([...(ride.safety.sharedWith || []), ...sentTo.map((c) => c.name)])];
  addTimeline(ride, ride.status, sentTo.length ? `Live trip shared with ${sentTo.map((c) => c.name).join(', ')} (SMS simulated)` : 'Live trip link created');
  save(ride);
  return { url, message, sentTo, whatsappAll: `https://wa.me/?text=${encodeURIComponent(message)}` };
}

export function acknowledge(ride, response) {
  for (const a of ride.safety.alerts) if (a.status === 'OPEN') a.status = response === 'safe' ? 'SAFE' : 'ESCALATED';
  for (const e of safetyEvents) if (e.rideId === ride._id && e.status === 'OPEN') e.status = response === 'safe' ? 'SAFE' : 'ESCALATED';
  addTimeline(ride, ride.status, response === 'safe' ? 'Rider confirmed they are safe' : 'Rider reported feeling unsafe');
  emit('admins', 'safety:update', { rideId: ride._id });
  save(ride);
}

/** SOS: recommended escalation steps, all automatic. */
export async function triggerSOS(ride, baseUrl, reason = 'Rider pressed SOS') {
  const d = ride.driver ? fleet.get(ride.driver) : null;
  ride.safety.monitoring = true;
  ride.safety.sos = { at: new Date(), status: 'ACTIVE', reason, location: d?.location || ride.pickup };
  // 1. alert the RYDORA safety team with live location
  logSafety(ride, 'SOS', `SOS raised by ${ride.passengerName}: ${reason}`, { status: 'ACTIVE' });
  // 2. share live location with trusted contacts
  const share = await shareTrip(ride, baseUrl);
  // 3. suspend the driver from new requests until reviewed
  if (d) { d.flagged = true; persistDriver(d); }
  acknowledge(ride, 'unsafe');
  addTimeline(ride, ride.status, 'SOS: safety team alerted, live location shared, driver suspended from new requests pending review');
  passengerNotify(ride, { title: 'SOS activated', message: 'RYDORA safety team has been alerted and your live location shared. Call 112 if you are in immediate danger.', type: 'danger' });
  emit(`ride:${ride._id}`, 'ride:safety', { rideId: ride._id, sos: ride.safety.sos });
  save(ride);
  return { share, helplines: HELPLINES };
}

export function resolveSafety(rideId, by = 'admin') {
  for (const e of safetyEvents) if (e.rideId === rideId) e.status = 'RESOLVED';
  const ride = activeRides.get(rideId);
  if (ride?.safety) {
    if (ride.safety.sos) ride.safety.sos.status = 'RESOLVED';
    for (const a of ride.safety.alerts) a.status = 'RESOLVED';
    addTimeline(ride, ride.status, `Safety case resolved by ${by}`);
    save(ride);
  }
  emit('admins', 'safety:update', { rideId });
}

export const nearestKmToRoute = (ride, p) => round(roadKm(p, ride.drop), 2);
