import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

export const signToken = (user) => jwt.sign(
  { id: String(user._id), role: user.role, name: user.name, driverId: user.driver ? String(user.driver) : null },
  config.jwtSecret, { expiresIn: '7d' });

export function auth(...roles) {
  return (req, res, next) => {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    try {
      req.user = jwt.verify(token, config.jwtSecret);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
    }
    if (roles.length && !roles.includes(req.user.role)) return res.status(403).json({ error: 'You do not have access to this resource' });
    next();
  };
}

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
