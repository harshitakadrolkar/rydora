import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Driver from '../models/Driver.js';
import { signToken, auth, wrap } from '../middleware/auth.js';
import { isEmail, isPhone, required } from '../utils/validate.js';
import { ZONES, randomPointNear } from '../utils/geo.js';
import { addToFleet } from '../services/simulator.js';

const r = Router();
const userOut = (u) => ({
  _id: String(u._id), name: u.name, email: u.email, phone: u.phone, role: u.role, driverId: u.driver ? String(u.driver) : null,
  gender: u.gender || 'unspecified', emergencyContacts: u.emergencyContacts || [],
  eco: { coupons: u.eco?.coupons || 0, ecoRides: u.eco?.ecoRides || 0, co2SavedKg: Math.round((u.eco?.co2SavedKg || 0) * 100) / 100, credits: u.eco?.credits || 0 },
});
const GENDERS = ['female', 'male', 'other', 'unspecified'];

function validateBase(b) {
  const miss = required(b, ['name', 'email', 'phone', 'password']);
  if (miss) return miss;
  if (b.name.trim().length < 2) return 'Name must be at least 2 characters';
  if (!isEmail(b.email)) return 'Please enter a valid email address';
  if (!isPhone(b.phone)) return 'Please enter a valid phone number (8-15 digits)';
  if (String(b.password).length < 6) return 'Password must be at least 6 characters';
  return null;
}

r.post('/register/passenger', wrap(async (req, res) => {
  const err = validateBase(req.body);
  if (err) return res.status(400).json({ error: err });
  if (await User.findOne({ email: req.body.email.toLowerCase() })) return res.status(409).json({ error: 'An account with this email already exists' });
  const user = await User.create({
    name: req.body.name.trim(), email: req.body.email, phone: req.body.phone,
    passwordHash: await bcrypt.hash(req.body.password, 10), role: 'passenger',
    gender: GENDERS.includes(req.body.gender) ? req.body.gender : 'unspecified',
  });
  res.status(201).json({ token: signToken(user), user: userOut(user) });
}));

r.post('/register/driver', wrap(async (req, res) => {
  const b = req.body;
  const err = validateBase(b) || required(b, ['vehicleModel', 'plate', 'category', 'licenseNo']);
  if (err) return res.status(400).json({ error: err });
  if (!['mini', 'sedan', 'suv'].includes(b.category)) return res.status(400).json({ error: 'Vehicle category must be mini, sedan or suv' });
  if (!['female', 'male', 'other'].includes(b.gender)) return res.status(400).json({ error: 'Please select your gender (used for the woman-driver option)' });
  if (!['ev', 'petrol', 'cng'].includes(b.fuel)) return res.status(400).json({ error: 'Please select the vehicle fuel type' });
  if (!/^[A-Z]{2}[ -]?\d{1,2}[ -]?[A-Z]{1,3}[ -]?\d{3,4}$/i.test(b.plate.trim())) return res.status(400).json({ error: 'Plate must look like KA 01 AB 1234' });
  if (await User.findOne({ email: b.email.toLowerCase() })) return res.status(409).json({ error: 'An account with this email already exists' });
  const zone = ZONES.find((z) => z.id === b.zoneId) || ZONES[0];
  const user = await User.create({ name: b.name.trim(), email: b.email, phone: b.phone, passwordHash: await bcrypt.hash(b.password, 10), role: 'driver', gender: b.gender });
  const driver = await Driver.create({
    user: user._id, name: user.name, phone: b.phone, licenseNo: b.licenseNo,
    vehicle: { model: b.vehicleModel, plate: b.plate.toUpperCase(), category: b.category, seats: b.category === 'suv' ? 6 : 4, fuel: b.fuel, childSeat: !!b.childSeat },
    gender: b.gender, featuresMigrated: true,
    location: randomPointNear(zone, 0.8), zoneId: zone.id, status: 'offline', isSimulated: false, baseAcceptance: 0.9, rating: 5.0,
  });
  user.driver = driver._id; await user.save();
  addToFleet(driver.toObject());
  res.status(201).json({ token: signToken(user), user: userOut(user) });
}));

r.post('/login', wrap(async (req, res) => {
  const { email, password, role } = req.body;
  if (!isEmail(email) || !password) return res.status(400).json({ error: 'Enter a valid email and password' });
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: 'Invalid email or password' });
  if (role && user.role !== role) return res.status(403).json({ error: `This account is a ${user.role} account. Please use the ${user.role} login.` });
  if (!user.active) return res.status(403).json({ error: 'This account has been suspended by an administrator' });
  res.json({ token: signToken(user), user: userOut(user) });
}));

r.get('/me', auth(), wrap(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: userOut(user) });
}));

r.put('/me/contacts', auth(), wrap(async (req, res) => {
  const list = Array.isArray(req.body.contacts) ? req.body.contacts : [];
  if (list.length > 3) return res.status(400).json({ error: 'You can save up to 3 trusted contacts' });
  for (const c of list) {
    if (!c.name || String(c.name).trim().length < 2) return res.status(400).json({ error: 'Each contact needs a name' });
    if (!isPhone(String(c.phone || ''))) return res.status(400).json({ error: `Enter a valid phone number for ${c.name}` });
  }
  const contacts = list.map((c) => ({ name: String(c.name).trim().slice(0, 40), phone: String(c.phone).trim(), relation: String(c.relation || '').slice(0, 20) }));
  const user = await User.findByIdAndUpdate(req.user.id, { emergencyContacts: contacts }, { new: true });
  res.json({ user: userOut(user) });
}));

export default r;
