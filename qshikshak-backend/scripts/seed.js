// npm run seed  →  loads the demo school (scripts/data/demo.json) into MongoDB.
// Create demo.json first:  node scripts/export-demo.js ..
import { readFile } from 'node:fs/promises';
import { config } from '../src/config/index.js';
import { connectDb, disconnectDb } from '../src/config/db.js';
import { seedDemo } from './seedDemo.js';

const schoolId = process.env.SCHOOL_ID || config.defaultSchoolId;
const password = process.env.DEMO_PASSWORD || 'demo123';

let data;
try {
  data = JSON.parse(await readFile(new URL('./data/demo.json', import.meta.url), 'utf8'));
} catch {
  console.error('scripts/data/demo.json not found. Run first:  node scripts/export-demo.js ..');
  process.exit(1);
}

await connectDb();
const counts = await seedDemo(data, { schoolId, password });
await disconnectDb();

Object.entries(counts).forEach(([name, n]) => console.log(`✓ ${name}: ${n}`));
console.log(`\nDemo school "${schoolId}" is ready. Log in with username t1 / t3 / a1 / p1 and password "${password}".`);