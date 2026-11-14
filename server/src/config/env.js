import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

export const ROOT_DIR = path.join(__dirname, '../../..');
export const config = {
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rydora',
  useMemoryDb: process.env.USE_MEMORY_DB === 'true',
  jwtSecret: process.env.JWT_SECRET || 'rydora-dev-secret',
  clientOrigin: process.env.CLIENT_ORIGIN || '*',
  simSpeed: Number(process.env.SIM_SPEED || 15),
  simRideIntervalMs: Number(process.env.SIM_RIDE_INTERVAL_MS ?? 12000),
  offerTimeoutSec: Number(process.env.OFFER_TIMEOUT_SEC || 15),
  pythonBin: process.env.PYTHON_BIN || 'python3',
};
