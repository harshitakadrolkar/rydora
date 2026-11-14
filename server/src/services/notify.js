import Notification from '../models/Notification.js';
import { emit } from './state.js';

/** Persist + push a notification to a user. Simulated users only get socket events. */
export async function notify(userId, { title, message, type = 'info', rideId = null }, { simulated = false } = {}) {
  if (!userId) return;
  const payload = { title, message, type, ride: rideId, read: false, createdAt: new Date() };
  if (!simulated) {
    try {
      const n = await Notification.create({ user: userId, ...payload });
      payload._id = String(n._id);
    } catch (e) { console.error('[notify]', e.message); }
  }
  emit(`user:${userId}`, 'notification', payload);
}
