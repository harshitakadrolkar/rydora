import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from './config/env.js';
import { setIO, activeRides } from './services/state.js';

export function initSocket(server) {
  const io = new Server(server, { cors: { origin: '*' } });
  io.use((socket, next) => {
    try {
      socket.user = jwt.verify(socket.handshake.auth?.token, config.jwtSecret);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });
  io.on('connection', (socket) => {
    const u = socket.user;
    socket.join(`user:${u.id}`);
    socket.join('fleet');
    if (u.role === 'driver' && u.driverId) socket.join(`driver:${u.driverId}`);
    if (u.role === 'admin') socket.join('admins');
    socket.on('ride:join', (rideId) => {
      const r = activeRides.get(rideId);
      if (u.role === 'admin' || !r || r.passenger === u.id || r.driver === u.driverId) socket.join(`ride:${rideId}`);
    });
    socket.on('ride:leave', (rideId) => socket.leave(`ride:${rideId}`));
  });
  setIO(io);
  return io;
}
