// ZONE INTELLIGENCE ENGINE: supply vs demand per zone, surge multipliers,
// shortage detection and driver repositioning recommendations.
import { ZONES, haversine, roadKm, round, zoneById } from '../utils/geo.js';
import { fleet, activeRides, requestLog, settings } from './state.js';
import { forecastFor } from './forecast.js';

const TRIPS_PER_DRIVER_PER_HOUR = 4; // simulated capacity assumption
// The fleet is a small demo fleet; scale city-level forecast down to fleet level
const FLEET_DEMAND_SCALE = 0.3;
let lastStats = null;

export function computeZoneStats() {
  const now = Date.now();
  const hour = new Date().getHours();
  while (requestLog.length && now - requestLog[0].at > 60 * 60 * 1000) requestLog.shift();

  const stats = ZONES.map((z) => {
    const drivers = [...fleet.values()].filter((d) => d.zoneId === z.id && d.status !== 'offline');
    const available = drivers.filter((d) => d.status === 'available' && !d.pendingOffer).length;
    const busy = drivers.length - available;
    const openRequests = [...activeRides.values()].filter((r) => r.status === 'REQUESTED' && r.pickup.zoneId === z.id).length;
    const recent15 = requestLog.filter((e) => e.zoneId === z.id && now - e.at < 15 * 60 * 1000).length;
    const recent60 = requestLog.filter((e) => e.zoneId === z.id).length;
    const forecastNow = forecastFor(z.id, hour);
    const forecastNext = forecastFor(z.id, hour + 1);
    // Demand units over the next ~15 minutes expressed as "drivers needed"
    const expected = (forecastNow * FLEET_DEMAND_SCALE) / TRIPS_PER_DRIVER_PER_HOUR;
    const driversNeeded = expected + openRequests + recent15 * 0.25;
    const pressure = driversNeeded / Math.max(available, 0.5);
    let surge = 1;
    if (settings.surgeEnabled && pressure > 1) surge = Math.min(settings.surgeCap, 1 + (pressure - 1) * settings.surgeSensitivity);
    surge = Math.round(surge * 10) / 10;
    const gap = round(driversNeeded - available, 1);
    // PREDICTIVE: expected need in the next hour from the ML forecast (+ half of today's open queue)
    const neededNext = (forecastNext * FLEET_DEMAND_SCALE) / TRIPS_PER_DRIVER_PER_HOUR + openRequests * 0.5;
    const pressureNext = neededNext / Math.max(available, 0.5);
    let surgeNext = 1;
    if (settings.surgeEnabled && pressureNext > 1) surgeNext = Math.min(settings.surgeCap, 1 + (pressureNext - 1) * settings.surgeSensitivity);
    const gapNext = round(neededNext - available, 1);
    const trend = forecastNext > forecastNow * 1.1 ? 'rising' : forecastNext < forecastNow * 0.9 ? 'falling' : 'steady';
    return {
      zoneId: z.id, name: z.name, type: z.type, lat: z.lat, lng: z.lng,
      supply: { available, busy, total: drivers.length },
      demand: { openRequests, last15min: recent15, last60min: recent60, forecastNow: round(forecastNow, 1), forecastNext: round(forecastNext, 1) },
      driversNeeded: round(driversNeeded, 1), pressure: round(pressure, 2), surge, gap,
      status: pressure > 1.6 ? 'shortage' : pressure > 1.0 ? 'tight' : available - driversNeeded > 1.5 ? 'surplus' : 'balanced',
      next: {
        hour: (hour + 1) % 24, driversNeeded: round(neededNext, 1), pressure: round(pressureNext, 2),
        surge: Math.round(surgeNext * 10) / 10, gap: gapNext, trend,
        shortageExpected: gapNext > 0.5 && pressureNext > 1 && gapNext > gap,
      },
    };
  });
  lastStats = { at: new Date(), hour, zones: stats };
  return lastStats;
}

export const getZoneStats = () => lastStats || computeZoneStats();
export const surgeFor = (zoneId) => getZoneStats().zones.find((z) => z.zoneId === zoneId)?.surge || 1;

/** Greedy repositioning: move idle drivers from surplus zones to shortage zones. */
export function repositioningPlan() {
  const { zones } = getZoneStats();
  // Target gap = worst of the current gap and the gap PREDICTED for the next hour.
  const withNeed = zones.map((z) => {
    const predicted = z.next.gap > z.gap;
    return { ...z, needGap: Math.max(z.gap, z.next.gap), trigger: predicted ? 'predicted' : 'current', needed: predicted ? z.next.driversNeeded : z.driversNeeded };
  });
  const short = withNeed.filter((z) => z.needGap > 0.5).sort((a, b) => b.needGap - a.needGap);
  const spareByZone = {};
  for (const z of withNeed) spareByZone[z.zoneId] = Math.floor(Math.max(0, z.supply.available - Math.max(z.driversNeeded, z.next.driversNeeded)));
  const used = new Set();
  const moves = [];
  for (const target of short) {
    let need = Math.ceil(target.needGap);
    const candidates = [...fleet.values()]
      .filter((d) => d.status === 'available' && !d.pendingOffer && !used.has(String(d._id)) && d.zoneId !== target.zoneId && spareByZone[d.zoneId] > 0)
      .map((d) => ({ d, km: roadKm(d.location, target) }))
      .filter((c) => c.km < 18)
      .sort((a, b) => a.km - b.km);
    for (const { d, km } of candidates) {
      if (need <= 0) break;
      used.add(String(d._id)); spareByZone[d.zoneId] -= 1; need -= 1;
      moves.push({
        driverId: String(d._id), driverName: d.name, isSimulated: d.isSimulated,
        fromZone: zoneById(d.zoneId)?.name, toZoneId: target.zoneId, toZone: target.name,
        distanceKm: round(km, 1), expectedSurge: target.trigger === 'predicted' ? target.next.surge : target.surge, trigger: target.trigger,
        reason: target.trigger === 'predicted'
          ? `Predicted shortage in ~60 min: ${target.name} will need ~${target.next.driversNeeded} drivers at ${target.next.hour}:00 (forecast ${target.demand.forecastNext} rides/h, ${target.next.trend}) but has ${target.supply.available} available.`
          : `Current shortage: ${target.name} needs ~${target.driversNeeded} drivers but has ${target.supply.available} available (pressure ${target.pressure}x).`,
      });
    }
  }
  return {
    at: new Date(), moves,
    shortageZones: short.filter((z) => z.trigger === 'current').map((z) => z.name),
    predictedShortageZones: short.filter((z) => z.trigger === 'predicted').map((z) => z.name),
  };
}

/**
 * PROACTIVE DISPATCH: distribute idle drivers across zones in proportion to the
 * ML-forecast demand for a target hour, BEFORE the demand arrives.
 */
export function prepositionPlan(targetHour = (new Date().getHours() + 1) % 24) {
  const idle = [...fleet.values()].filter((d) => d.status === 'available' && !d.pendingOffer && !d.stalled && !d.repositionTarget);
  const forecasts = ZONES.map((z) => ({ z, f: forecastFor(z.id, targetHour) }));
  const total = forecasts.reduce((s, x) => s + x.f, 0) || 1;
  // ideal idle-driver count per zone (largest remainder rounding)
  const raw = forecasts.map((x) => ({ ...x, ideal: (x.f / total) * idle.length }));
  raw.forEach((x) => { x.target = Math.floor(x.ideal); });
  let left = idle.length - raw.reduce((s, x) => s + x.target, 0);
  [...raw].sort((a, b) => (b.ideal % 1) - (a.ideal % 1)).forEach((x) => { if (left > 0) { x.target += 1; left -= 1; } });
  const current = Object.fromEntries(ZONES.map((z) => [z.id, idle.filter((d) => d.zoneId === z.id)]));
  const zonesOut = raw.map((x) => ({ zoneId: x.z.id, name: x.z.name, forecast: round(x.f, 1), share: round(x.f / total, 3), idleNow: current[x.z.id].length, target: x.target, delta: x.target - current[x.z.id].length }));
  const surplus = []; // drivers that can leave their zone
  for (const zo of zonesOut) if (zo.delta < 0) surplus.push(...current[zo.zoneId].slice(0, -zo.delta));
  const moves = [];
  const deficits = zonesOut.filter((zo) => zo.delta > 0).sort((a, b) => b.forecast - a.forecast);
  for (const zo of deficits) {
    const target = zoneById(zo.zoneId);
    for (let k = 0; k < zo.delta && surplus.length; k++) {
      surplus.sort((a, b) => roadKm(a.location, target) - roadKm(b.location, target));
      if (roadKm(surplus[0].location, target) > 15) break; // don't send drivers across the whole city
      const d = surplus.shift();
      moves.push({
        driverId: String(d._id), driverName: d.name, isSimulated: d.isSimulated, fromZone: zoneById(d.zoneId)?.name,
        toZoneId: zo.zoneId, toZone: zo.name, distanceKm: round(roadKm(d.location, target), 1),
        reason: `${zo.name} is forecast to generate ${zo.forecast} rides at ${targetHour}:00 (${Math.round(zo.share * 100)}% of city demand); target ${zo.target} idle drivers, currently ${zo.idleNow}.`,
      });
    }
  }
  return { targetHour, idleDrivers: idle.length, zones: zonesOut.sort((a, b) => b.forecast - a.forecast), moves };
}

/** Personal repositioning suggestion for one driver (driver dashboard). */
export function suggestionForDriver(d) {
  const { zones } = getZoneStats();
  const ranked = zones
    .map((z) => {
      const km = roadKm(d.location, z);
      const opportunity = (z.demand.forecastNext * 0.6 + z.gap * 4) * z.surge;
      return { ...z, km: round(km, 1), score: opportunity / (1 + km / 6) };
    })
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const current = zones.find((z) => z.zoneId === d.zoneId);
  if (!best || best.zoneId === d.zoneId) {
    return { stay: true, zone: current, message: `Stay in ${current?.name}: it is currently the best zone for you (pressure ${current?.pressure}x).` };
  }
  return {
    stay: false, zone: best, distanceKm: best.km,
    message: `Move to ${best.name} (${best.km} km). Forecast ${best.demand.forecastNext} rides next hour, ${best.supply.available} drivers available, surge ${best.surge}x.`,
    alternatives: ranked.slice(1, 3).map((z) => ({ zoneId: z.zoneId, name: z.name, km: z.km, surge: z.surge })),
  };
}

export const nearestZoneDistance = (p, zoneId) => haversine(p, zoneById(zoneId));
