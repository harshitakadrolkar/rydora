// SIMULATED DEMO DATA - every record created here is synthetic and labelled `simulated: true`.
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Driver from '../models/Driver.js';
import Ride from '../models/Ride.js';
import Notification from '../models/Notification.js';
import { ZONES, randomPointNear, roadKm, etaMinutes, zoneOf, round, seededRandom } from '../utils/geo.js';
import { estimateFare, PLATFORM_COMMISSION } from '../services/pricing.js';
import { PLACES } from './places.js';

const DRIVER_NAMES = ['Ravi Kumar', 'Suresh Gowda', 'Imran Khan', 'Priya Nair', 'Manjunath R', 'Arjun Shetty', 'Vikram Rao', 'Lakshmi Devi', 'Kiran Patil', 'Mohammed Asif', 'Deepak Singh', 'Ganesh Murthy', 'Farhan Ali', 'Sneha Reddy', 'Naveen Babu', 'Rahul Verma', 'Anil Joseph', 'Harish Hegde', 'Sanjay Pillai', 'Venkatesh M', 'Rakesh Jain', 'Yusuf Pasha'];
const PASSENGER_NAMES = ['Aarav Mehta', 'Diya Sharma', 'Kabir Iyer', 'Ananya Rao', 'Vihaan Gupta', 'Isha Kapoor', 'Rohan Das', 'Meera Pillai', 'Aditya Joshi', 'Saanvi Menon', 'Ishaan Bose', 'Kiara Shah', 'Reyansh Nair', 'Tara Krishnan', 'Dev Malhotra', 'Nisha Kulkarni', 'Yash Agarwal', 'Pooja Hegde', 'Siddharth Rao', 'Riya Banerjee', 'Kunal Sinha', 'Aditi Desai', 'Varun Reddy', 'Shreya Ghosh', 'Nikhil Bhat', 'Kavya Srinivas', 'Manav Chawla', 'Zara Sheikh', 'Om Prakash', 'Fatima Begum'];
const VEHICLES = {
  mini: ['Maruti WagonR', 'Hyundai i10', 'Tata Tiago', 'Maruti Celerio'],
  sedan: ['Maruti Dzire', 'Toyota Etios', 'Honda Amaze', 'Hyundai Aura'],
  suv: ['Toyota Innova', 'Maruti Ertiga', 'Kia Carens'],
};
const plate = (rand) => `KA ${String(1 + Math.floor(rand() * 53)).padStart(2, '0')} ${String.fromCharCode(65 + Math.floor(rand() * 26))}${String.fromCharCode(65 + Math.floor(rand() * 26))} ${1000 + Math.floor(rand() * 8999)}`;
const nearestPlace = (p) => { let b = PLACES[0]; let bd = Infinity; for (const pl of PLACES) { const d = roadKm(p, pl); if (d < bd) { bd = d; b = pl; } } return bd < 1.5 ? `Near ${b.name}` : `${zoneOf(p).name} (pinned)`; };

export async function seedDatabase({ reset = false } = {}) {
  if (!reset && (await User.countDocuments()) > 0) return false;
  if (reset) await Promise.all([User.deleteMany({}), Driver.deleteMany({}), Ride.deleteMany({}), Notification.deleteMany({})]);
  const rand = seededRandom(20261113);
  const hash = await bcrypt.hash('password123', 10);
  const adminHash = await bcrypt.hash('admin123', 10);

  await User.create({ name: 'Rydora Admin', email: 'admin@rydora.com', phone: '9000000000', passwordHash: adminHash, role: 'admin' });
  const demoPassenger = await User.create({ name: 'Neha Passenger', email: 'passenger@rydora.com', phone: '9876543210', passwordHash: hash, role: 'passenger' });

  const passengers = [demoPassenger];
  for (let i = 0; i < PASSENGER_NAMES.length; i++) {
    passengers.push(await User.create({
      name: PASSENGER_NAMES[i], email: `sim.passenger${i + 1}@rydora.sim`, phone: `98${String(10000000 + i * 7919).slice(0, 8)}`,
      passwordHash: hash, role: 'passenger', simulated: true, homeZone: ZONES[i % ZONES.length].id,
    }));
  }

  // Demo (human-controlled) driver
  const demoDriverUser = await User.create({ name: 'Demo Driver', email: 'driver@rydora.com', phone: '9123456780', passwordHash: hash, role: 'driver' });
  const z0 = ZONES[0];
  const demoDriver = await Driver.create({
    user: demoDriverUser._id, name: 'Demo Driver', phone: '9123456780', licenseNo: 'KA0120230001234',
    vehicle: { model: 'Maruti Dzire', plate: 'KA 01 RY 2026', category: 'sedan', seats: 4 },
    location: randomPointNear(z0, 0.5, rand), zoneId: z0.id, status: 'offline', isSimulated: false,
    baseAcceptance: 0.9, rating: 4.8, lastTripEndedAt: new Date(Date.now() - 25 * 60000),
    stats: { offered: 40, accepted: 36, rejected: 3, timeouts: 1, completed: 35, earnings: 0, todayTrips: 2, todayEarnings: 0 },
  });
  demoDriverUser.driver = demoDriver._id; await demoDriverUser.save();

  const drivers = [demoDriver];
  const cats = ['mini', 'mini', 'sedan', 'sedan', 'mini', 'sedan', 'suv', 'sedan', 'mini', 'suv', 'sedan'];
  for (let i = 0; i < DRIVER_NAMES.length; i++) {
    const zone = ZONES[i % ZONES.length];
    const cat = cats[i % cats.length];
    const acc = round(0.55 + rand() * 0.42, 2); // different acceptance behaviour per driver
    const offered = 30 + Math.floor(rand() * 60);
    const accepted = Math.round(offered * acc);
    const todayTrips = Math.floor(rand() * 10);
    const u = await User.create({ name: DRIVER_NAMES[i], email: `sim.driver${i + 1}@rydora.sim`, phone: `91${String(20000000 + i * 4931).slice(0, 8)}`, passwordHash: hash, role: 'driver', simulated: true });
    const d = await Driver.create({
      user: u._id, name: DRIVER_NAMES[i], phone: u.phone, licenseNo: `KA${String(1000000000 + i * 7777)}`,
      vehicle: { model: VEHICLES[cat][i % VEHICLES[cat].length], plate: plate(rand), category: cat, seats: cat === 'suv' ? 6 : 4 },
      location: randomPointNear(zone, 1.5, rand), zoneId: zone.id,
      status: i < 19 ? 'available' : 'offline', isSimulated: true, baseAcceptance: acc,
      rating: round(4.1 + rand() * 0.85, 2), onlineSince: new Date(Date.now() - rand() * 4 * 3600000),
      lastTripEndedAt: new Date(Date.now() - rand() * 80 * 60000),
      stats: { offered, accepted, rejected: Math.round((offered - accepted) * 0.65), timeouts: Math.round((offered - accepted) * 0.35), completed: accepted - 1, todayTrips, earnings: 0, todayEarnings: 0 },
    });
    u.driver = d._id; await u.save();
    drivers.push(d);
  }

  // Historical rides: last 14 days (+ earlier today)
  const rides = [];
  const now = Date.now();
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const earnings = new Map();
  const N = 420;
  for (let i = 0; i < N; i++) {
    const isToday = i < 70;
    const t = isToday ? startToday.getTime() + rand() * Math.max(60000, now - startToday.getTime() - 15 * 60000) : now - (1 + rand() * 13) * 86400000;
    const pz = ZONES[Math.floor(rand() ** 1.3 * ZONES.length)];
    const dz = ZONES[Math.floor(rand() * ZONES.length)];
    const pickup = randomPointNear(pz, 1.4, rand);
    let drop = randomPointNear(dz, 1.6, rand);
    if (roadKm(pickup, drop) < 2) drop = randomPointNear(ZONES[(ZONES.indexOf(dz) + 3) % ZONES.length], 1.5, rand);
    const passenger = i % 30 === 0 || i < 4 ? demoPassenger : passengers[1 + Math.floor(rand() * (passengers.length - 1))];
    const driver = i % 25 === 0 || (i > 4 && i < 9) || i % 37 === 0 ? demoDriver : drivers[1 + Math.floor(rand() * (drivers.length - 1))];
    const cat = driver.vehicle.category;
    const type = rand() < 0.2 ? 'pool' : 'solo';
    const distanceKm = roadKm(pickup, drop);
    const hour = new Date(t).getHours();
    const durationMin = etaMinutes(distanceKm, hour);
    const surge = rand() < 0.2 ? round(1.1 + rand() * 0.8, 1) : 1;
    const matched = type === 'pool' && rand() < 0.7;
    const fare = estimateFare({ distanceKm, durationMin, category: type === 'pool' ? 'sedan' : cat, surge, pool: type === 'pool', matched });
    const cancelled = rand() < 0.08;
    const pickupEta = 2 + rand() * 9;
    const reassignCount = rand() < 0.15 ? 1 + Math.floor(rand() * 2) : 0;
    const reasons = ['DRIVER_REJECTED', 'RESPONSE_TIMEOUT', 'DRIVER_CANCELLED', 'DELAYED_ARRIVAL'];
    const requestedAt = new Date(t);
    const acceptedAt = new Date(t + 20000 + reassignCount * 15000);
    const pickedUpAt = new Date(acceptedAt.getTime() + pickupEta * 60000);
    const completedAt = new Date(pickedUpAt.getTime() + durationMin * 60000);
    const same = rand() < 0.55;
    const contrib = () => ({ distance: round(12 + rand() * 12, 1), eta: round(9 + rand() * 10, 1), workload: round(4 + rand() * 11, 1), acceptance: round(11 + rand() * 9, 1), idle: round(2 + rand() * 13, 1), rating: round(2 + rand() * 3, 1) });
    const c = contrib();
    const chosen = { driverId: String(driver._id), name: driver.name, distanceKm: round(pickupEta * 0.4, 2), etaMin: round(pickupEta, 1), contributions: c, score: round(Object.values(c).reduce((a, b) => a + b, 0), 1) };
    const other = drivers[1 + Math.floor(rand() * (drivers.length - 1))];
    const nearest = same ? chosen : { driverId: String(other._id), name: other.name, distanceKm: round(chosen.distanceKm * (0.4 + rand() * 0.5), 2), score: round(chosen.score - 2 - rand() * 12, 1) };
    const pickupPt = { ...pickup, address: nearestPlace(pickup), zoneId: pz.id, zoneName: pz.name };
    const dropZ = zoneOf(drop);
    const dropPt = { ...drop, address: nearestPlace(drop), zoneId: dropZ.id, zoneName: dropZ.name };
    const ride = {
      _id: new mongoose.Types.ObjectId(), code: 'RYD-' + (10000 + i).toString(36).toUpperCase(), simulated: true, historical: true,
      passenger: passenger._id, passengerName: passenger.name, driver: driver._id, driverName: driver.name, vehicle: driver.vehicle,
      type, category: type === 'pool' ? 'sedan' : cat, pickup: pickupPt, drop: dropPt,
      distanceKm: round(distanceKm), durationMin: round(durationMin, 1), surge, fare, requestedAt,
      etaPickupMin: round(pickupEta, 1),
      status: cancelled ? 'CANCELLED' : 'COMPLETED',
      reassignments: Array.from({ length: reassignCount }, () => ({ at: requestedAt, reason: reasons[Math.floor(rand() * reasons.length)], fromDriver: other.name })),
      offers: [{ driverId: String(driver._id), driverName: driver.name, response: 'accepted', at: acceptedAt }],
      match: { chosen, nearest, sameAsNearest: same, explanation: `${driver.name} was selected with a score of ${chosen.score}/100 (simulated historical decision).` },
      pool: type === 'pool' ? { matched, groupId: matched ? `POOL-H${Math.floor(i / 2)}` : null, savings: fare.soloEquivalent - fare.total, coRiders: matched ? [{ name: passengers[1 + (i % 29)].name }] : [] } : null,
      timeline: [
        { status: 'REQUESTED', at: requestedAt, note: 'Ride requested (simulated history)' },
        { status: 'ACCEPTED', at: acceptedAt, note: `${driver.name} accepted` },
        ...(cancelled ? [{ status: 'CANCELLED', at: new Date(acceptedAt.getTime() + 60000), note: 'Cancelled by passenger: Changed plans' }] : [
          { status: 'ARRIVING', at: new Date(acceptedAt.getTime() + 5000), note: 'Driver heading to pickup' },
          { status: 'ONGOING', at: pickedUpAt, note: 'Trip started' },
          { status: 'COMPLETED', at: completedAt, note: `Ride completed. Fare Rs.${fare.total}` }]),
      ],
    };
    if (cancelled) Object.assign(ride, { cancelledAt: new Date(acceptedAt.getTime() + 60000), cancelledBy: 'passenger', cancelReason: 'Changed plans' });
    else {
      const earn = Math.round(fare.total * (1 - PLATFORM_COMMISSION));
      Object.assign(ride, { acceptedAt, pickedUpAt, completedAt, waitTimeMin: round((pickedUpAt - requestedAt) / 60000, 1), driverEarning: earn, rating: 3 + Math.floor(rand() * 3) });
      ride.fare.final = fare.total;
      const e = earnings.get(String(driver._id)) || { total: 0, today: 0 };
      e.total += earn; if (isToday) e.today += earn;
      earnings.set(String(driver._id), e);
    }
    rides.push(ride);
  }
  await Ride.insertMany(rides);
  for (const d of drivers) {
    const e = earnings.get(String(d._id)) || { total: 0, today: 0 };
    await Driver.updateOne({ _id: d._id }, { $set: { 'stats.earnings': e.total + d.stats.completed * 120, 'stats.todayEarnings': e.today } });
  }
  await Notification.create([
    { user: demoPassenger._id, title: 'Welcome to RYDORA', message: 'Book your first intelligent ride. All drivers and rides in this demo are simulated.', type: 'info' },
    { user: demoDriverUser._id, title: 'Welcome, driver', message: 'Go online to start receiving ride requests. Try "Request test ride" for a guided demo.', type: 'info' },
  ]);
  console.log(`[seed] Seeded ${passengers.length} passengers, ${drivers.length} drivers, ${rides.length} historical rides (SIMULATED)`);
  return true;
}

// ---- Feature migration (idempotent): EV fleet + women drivers -------------------------
const FEMALE = ['Priya Nair', 'Lakshmi Devi', 'Sneha Reddy', 'Kavya Shetty', 'Ayesha Banu', 'Meena Kumari', 'Divya Rao'];
const EV_DRIVERS = ['Ravi Kumar', 'Arjun Shetty', 'Lakshmi Devi', 'Mohammed Asif', 'Sneha Reddy', 'Naveen Babu', 'Harish Hegde', 'Kavya Shetty', 'Ayesha Banu'];
const EV_MODELS = { mini: 'Tata Tiago EV', sedan: 'Tata Tigor EV', suv: 'MG ZS EV' };
const NEW_DRIVERS = [
  { name: 'Kavya Shetty', zone: 'Z2', cat: 'sedan', acc: 0.93, rating: 4.9 },
  { name: 'Ayesha Banu', zone: 'Z1', cat: 'mini', acc: 0.88, rating: 4.8 },
  { name: 'Meena Kumari', zone: 'Z6', cat: 'sedan', acc: 0.84, rating: 4.7 },
  { name: 'Divya Rao', zone: 'Z3', cat: 'suv', acc: 0.9, rating: 4.85 },
];

export async function migrateFeatures() {
  const hash = await bcrypt.hash('password123', 10);
  let added = 0;
  for (const [i, n] of NEW_DRIVERS.entries()) {
    if (await Driver.findOne({ name: n.name }).lean()) continue;
    const zone = ZONES.find((z) => z.id === n.zone);
    const u = await User.create({ name: n.name, email: `sim.driver.w${i + 1}@rydora.sim`, phone: `90${String(30000000 + i * 3911).slice(0, 8)}`, passwordHash: hash, role: 'driver', simulated: true, gender: 'female' });
    const d = await Driver.create({
      user: u._id, name: n.name, phone: u.phone, licenseNo: `KA${2000000000 + i * 913}`,
      vehicle: { model: VEHICLES[n.cat][i % VEHICLES[n.cat].length], plate: `KA 0${i + 1} WD ${4100 + i * 37}`, category: n.cat, seats: n.cat === 'suv' ? 6 : 4 },
      location: randomPointNear(zone, 1.2), zoneId: zone.id, status: 'available', isSimulated: true, baseAcceptance: n.acc, rating: n.rating,
      onlineSince: new Date(), lastTripEndedAt: new Date(Date.now() - (20 + i * 9) * 60000),
      stats: { offered: 40, accepted: Math.round(40 * n.acc), rejected: 3, timeouts: 1, completed: Math.round(40 * n.acc) - 1, todayTrips: 1 + i, earnings: 0, todayEarnings: 0 },
    });
    u.driver = d._id; await u.save(); added += 1;
  }
  const drivers = await Driver.find().lean();
  let updated = 0;
  for (const d of drivers) {
    if (d.featuresMigrated || !d.isSimulated && d.name !== 'Demo Driver') continue; // real drivers chose at registration
    const ev = EV_DRIVERS.includes(d.name);
    const set = {
      featuresMigrated: true,
      gender: FEMALE.includes(d.name) ? 'female' : 'male',
      'vehicle.fuel': ev ? 'ev' : (d.vehicle?.category === 'mini' && d.name.length % 2 ? 'cng' : 'petrol'),
    };
    if (ev) set['vehicle.model'] = EV_MODELS[d.vehicle?.category] || 'Tata Tigor EV';
    await Driver.updateOne({ _id: d._id }, { $set: set }); updated += 1;
  }
  if (added || updated) console.log(`[migrate] EV & women-safety data: ${added} women drivers added, ${updated} drivers updated (SIMULATED)`);
}

// ---- Feature migration 2 (idempotent): child car seats ---------------------------------
const CHILD_SEAT = ['Priya Nair', 'Divya Rao', 'Suresh Gowda', 'Vikram Rao', 'Kavya Shetty', 'Ganesh Murthy', 'Rakesh Jain', 'Meena Kumari', 'Mohammed Asif', 'Demo Driver'];
export async function migrateFeatures2() {
  const drivers = await Driver.find().lean();
  let n = 0;
  for (const d of drivers) {
    if (d.features2Migrated || (!d.isSimulated && d.name !== 'Demo Driver')) continue;
    await Driver.updateOne({ _id: d._id }, { $set: { features2Migrated: true, 'vehicle.childSeat': CHILD_SEAT.includes(d.name) } });
    n += 1;
  }
  if (n) console.log(`[migrate] child car seats: ${n} drivers updated, ${CHILD_SEAT.length} cars now carry a child seat (SIMULATED)`);
}
