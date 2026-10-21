// /internal/...   Only other services (x-internal-token). The gateway blocks /internal from outside.
import * as internal from '../controllers/internal.controller.js';
import { validate } from '../middleware/validation.middleware.js';
import { accountsBody } from '../validations/internal.validation.js';
import { secureRouter } from './secureRouter.js';

const r = secureRouter('/internal');

r.put('/accounts', validate({ body: accountsBody }), internal.syncAccounts);

export default r.router;