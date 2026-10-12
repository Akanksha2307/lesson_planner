// /internal/... routes are only for other services. They must send the shared INTERNAL_TOKEN.
import { config } from '../config/index.js';
import { forbidden } from '../utils/response.js';

export function internalOnly(req, res, next) {
  if (req.get('x-internal-token') !== config.internalToken) return next(forbidden('Internal route.'));
  next();
}