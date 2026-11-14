import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { config, ROOT_DIR } from './config/env.js';
import { connectDB, dbMode } from './config/db.js';
import { seedDatabase, migrateFeatures, migrateFeatures2 } from './data/seedData.js';
import { initSocket } from './socket.js';
import { loadFleet, startSimulation } from './services/simulator.js';
import { loadForecast } from './services/forecast.js';
import authRoutes from './routes/auth.js';
import rideRoutes from './routes/rides.js';
import driverRoutes from './routes/drivers.js';
import adminRoutes from './routes/admin.js';
import analyticsRoutes from './routes/analytics.js';
import notificationRoutes from './routes/notifications.js';
import publicRoutes from './routes/public.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, name: 'RYDORA', db: dbMode, time: new Date() }));
app.use('/api/auth', authRoutes);
app.use('/api/rides', rideRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/public', publicRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` }));

// Serve built frontend if available (single-port production mode)
const dist = path.join(ROOT_DIR, 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err);
  if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid identifier' });
  res.status(500).json({ error: err.message || 'Internal server error' });
});

async function main() {
  await connectDB();
  const seeded = await seedDatabase();
  if (!seeded) console.log('[seed] Existing data found - skipping seed (run `npm run seed` to reset)');
  await migrateFeatures();
  await migrateFeatures2();
  loadForecast();
  await loadFleet();
  const server = http.createServer(app);
  initSocket(server);
  startSimulation();
  server.listen(config.port, () => console.log(`\n  RYDORA API running on http://localhost:${config.port}  (db: ${dbMode})\n`));
}

main().catch((e) => { console.error('Fatal startup error:', e); process.exit(1); });
