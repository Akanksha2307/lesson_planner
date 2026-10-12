// npm run seed – fills the qshikshak_auth database with the demo school.
// It deletes school "one" first. ONLY ONE PERSON in the team runs this.
import { config } from '../src/config/index.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { seedDemoSchool } from '../src/services/seed.service.js';

await connectDatabase();
console.log(await seedDemoSchool({ schoolId: config.defaultSchoolId }));
await disconnectDatabase();
console.log('Done – log in with t1 / demo123');