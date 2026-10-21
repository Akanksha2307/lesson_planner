// For OTHER SERVICES only (lesson-plan-service)
import type { Request, Response } from 'express';
import { bodyOf } from '../middleware/validation.middleware.js';
import * as authService from '../services/auth.service.js';
import { ok } from '../utils/response.js';
import type { accountsBody } from '../validations/internal.validation.js';

// PUT /internal/accounts   { schoolId, accounts: [{ id, username, name, role, departmentId, active, password? }] }
export async function syncAccounts(req: Request, res: Response): Promise<void> {
  const { schoolId, accounts } = bodyOf<typeof accountsBody>(req);
  ok(res, await authService.syncAccounts(schoolId, accounts), 'Accounts saved');
}