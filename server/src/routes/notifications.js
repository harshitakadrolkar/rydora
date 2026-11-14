import { Router } from 'express';
import Notification from '../models/Notification.js';
import { auth, wrap } from '../middleware/auth.js';

const r = Router();
r.use(auth());
r.get('/', wrap(async (req, res) => {
  const items = await Notification.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(40).lean();
  res.json({ notifications: items, unread: items.filter((n) => !n.read).length });
}));
r.post('/read-all', wrap(async (req, res) => {
  await Notification.updateMany({ user: req.user.id, read: false }, { read: true });
  res.json({ ok: true });
}));
r.post('/:id/read', wrap(async (req, res) => {
  await Notification.updateOne({ _id: req.params.id, user: req.user.id }, { read: true });
  res.json({ ok: true });
}));
export default r;
