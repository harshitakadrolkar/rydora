import mongoose from 'mongoose';
import { dualModel } from '../config/localStore.js';

const point = { lat: Number, lng: Number, address: String, zoneId: String, zoneName: String };

// strict:false - the live dispatcher persists the full in-memory ride object
// (timeline, offers, match explanation, pooling info, reassignments...).
const rideSchema = new mongoose.Schema({
  code: { type: String, index: true },
  passenger: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  passengerName: String,
  driver: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', index: true },
  driverName: String,
  type: { type: String, enum: ['solo', 'pool'], default: 'solo' },
  category: String,
  pickup: point,
  drop: point,
  status: {
    type: String,
    enum: ['REQUESTED', 'ACCEPTED', 'ARRIVING', 'ONGOING', 'COMPLETED', 'CANCELLED'],
    default: 'REQUESTED', index: true,
  },
  simulated: { type: Boolean, default: false },
  requestedAt: { type: Date, index: true },
}, { timestamps: true, strict: false });

export default dualModel(mongoose.model('Ride', rideSchema));
