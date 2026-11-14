import mongoose from 'mongoose';
import { dualModel } from '../config/localStore.js';

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  title: String,
  message: String,
  type: { type: String, default: 'info' }, // info | success | warning | danger
  ride: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride' },
  read: { type: Boolean, default: false },
}, { timestamps: true });

export default dualModel(mongoose.model('Notification', notificationSchema));
