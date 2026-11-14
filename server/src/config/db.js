import mongoose from 'mongoose';
import { config } from './env.js';
import { loadLocalStore, storeState } from './localStore.js';

export let dbMode = 'unknown';

/**
 * Connection strategy (always runs, never needs a paid / external service):
 *   1. MONGO_URI (local MongoDB or Atlas) via Mongoose
 *   2. USE_MEMORY_DB=true and `mongodb-memory-server` installed -> embedded MongoDB
 *   3. Built-in local datastore (Mongoose-schema compatible, persisted to server/data/rydora-db.json)
 */
export async function connectDB() {
  mongoose.set('strictQuery', true);
  if (config.useMemoryDb) {
    try {
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      const mem = await MongoMemoryServer.create();
      await mongoose.connect(mem.getUri('rydora'));
      dbMode = 'mongodb-memory-server';
      console.log('[db] Connected to embedded mongodb-memory-server');
      return dbMode;
    } catch (e) {
      console.warn(`[db] mongodb-memory-server unavailable (${e.message.split('\n')[0]})`);
    }
  } else {
    try {
      await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 2500 });
      dbMode = 'mongodb';
      storeState.mode = 'mongodb';
      console.log(`[db] Connected to MongoDB at ${config.mongoUri}`);
      return dbMode;
    } catch (e) {
      console.warn(`[db] MongoDB not reachable at ${config.mongoUri} (${e.message.split('\n')[0]})`);
    }
  }
  loadLocalStore();
  dbMode = 'local-fallback';
  console.log('[db] Using built-in local datastore fallback (server/data/rydora-db.json). Start MongoDB to use Mongo persistence.');
  return dbMode;
}

export async function disconnectDB() {
  if (mongoose.connection.readyState) await mongoose.disconnect();
  // give the local store time to flush
  await new Promise((r) => setTimeout(r, 1800));
}
