// npm run seed – creates (or resets) the 7 demo logins in qshikshak_auth, so auth-service can be
// tested on its own. Development only. Passwords are reset to demo123.
// When the school data service runs its own demo seed, it sends the same logins through
// PUT /internal/accounts, so running both is safe.
import { config } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { syncAccounts } from '../src/services/auth.service.js';
import { DEMO_ACCOUNTS } from './demo-accounts.js';

if (config.isProd) {
  console.error('Refusing to create demo logins in production.');
  process.exit(1);
}

await connectDatabase();
console.log(await syncAccounts(config.defaultSchoolId, DEMO_ACCOUNTS));
await disconnectDatabase();
console.log('Done – log in with t1 / demo123');