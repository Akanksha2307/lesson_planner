// Slows down password guessing: max LOGIN_RATE_LIMIT login / refresh calls per IP in 15 minutes
import { rateLimit } from 'express-rate-limit';
import { config } from '../config/env.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { fail } from '../utils/response.js';

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.loginRateLimit,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => config.isTest,
  handler: (_req, res) => fail(res, HTTP_STATUS.TOO_MANY_REQUESTS, 'Too many login attempts. Please wait a few minutes and try again.'),
});
