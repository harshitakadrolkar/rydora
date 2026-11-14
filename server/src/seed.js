// npm run seed  -> resets and re-seeds the database (only meaningful with a persistent MongoDB)
import { connectDB, disconnectDB } from './config/db.js';
import { seedDatabase } from './data/seedData.js';

await connectDB();
await seedDatabase({ reset: true });
await disconnectDB();
process.exit(0);
