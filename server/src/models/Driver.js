import mongoose from 'mongoose';
import { dualModel } from '../config/localStore.js';

const driverSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String, required: true },
  phone: String,
  licenseNo: String,
  vehicle: {
    model: String,
    plate: String,
    category: { type: String, enum: ['mini', 'sedan', 'suv'], default: 'sedan' },
    seats: { type: Number, default: 4 },
    fuel: { type: String, enum: ['ev', 'petrol', 'cng'], default: 'petrol' },
    childSeat: { type: Boolean, default: false },
  },
  gender: { type: String, enum: ['female', 'male', 'other'], default: 'male' },
  flagged: { type: Boolean, default: false }, // suspended from new requests after an SOS
  location: { lat: Number, lng: Number },
  zoneId: String,
  status: { type: String, enum: ['offline', 'available', 'busy'], default: 'offline' },
  isSimulated: { type: Boolean, default: true },
  baseAcceptance: { type: Number, default: 0.85 }, // simulated behavioural acceptance probability
  rating: { type: Number, default: 4.6 },
  lastTripEndedAt: Date,
  onlineSince: Date,
  stats: {
    offered: { type: Number, default: 0 },
    accepted: { type: Number, default: 0 },
    rejected: { type: Number, default: 0 },
    timeouts: { type: Number, default: 0 },
    completed: { type: Number, default: 0 },
    cancelled: { type: Number, default: 0 },
    delays: { type: Number, default: 0 },
    earnings: { type: Number, default: 0 },
    todayEarnings: { type: Number, default: 0 },
    todayTrips: { type: Number, default: 0 },
    totalKm: { type: Number, default: 0 },
  },
}, { timestamps: true, strict: false });

export default dualModel(mongoose.model('Driver', driverSchema));
