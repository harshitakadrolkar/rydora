import mongoose from 'mongoose';
import { dualModel } from '../config/localStore.js';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, default: '' },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['passenger', 'driver', 'admin'], required: true },
  driver: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },
  simulated: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  homeZone: String,
  gender: { type: String, enum: ['female', 'male', 'other', 'unspecified'], default: 'unspecified' },
  emergencyContacts: [{ name: String, phone: String, relation: String }],
  eco: {
    coupons: { type: Number, default: 0 },     // green bonuses waiting to be used
    ecoRides: { type: Number, default: 0 },
    co2SavedKg: { type: Number, default: 0 },
    credits: { type: Number, default: 0 },
  },
}, { timestamps: true });

export default dualModel(mongoose.model('User', userSchema));
