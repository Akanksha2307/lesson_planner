// Who is calling? Reads the login token (Authorization: Bearer <token>) and sets
//   req.user = { id, role, name, departmentId, schoolId }    req.ctx = { schoolId, academicYearId, boardId }
// For testing (ALLOW_DEV_AUTH=true) the headers x-user-id + x-user-role can be used instead of a token.
import { config } from '../config/index.js';
import { ROLES } from '../constants/roles.js';
import { verifyToken } from '../utils/jwt.js';
import { forbidden, unauthorized } from '../utils/response.js';

export function authenticate(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (token) {
    try {
      const p = verifyToken(token);
      req.user = { id: p.sub, role: p.role, name: p.name, departmentId: p.departmentId, schoolId: p.schoolId };
    } catch {
      return next(unauthorized('Your session has expired. Please log in again.'));
    }
  } else if (config.allowDevAuth && req.get('x-user-id') && ROLES.includes(req.get('x-user-role'))) {
    req.user = { id: req.get('x-user-id'), role: req.get('x-user-role') };
  } else {
    return next(unauthorized());
  }

  req.ctx = {
    // A logged-in user only sees their own school; the header is only used with test headers
    schoolId: req.user.schoolId || req.get('x-school-id') || config.defaultSchoolId,
    academicYearId: req.get('x-academic-year-id') || '',
    boardId: req.get('x-board-id') || '',
  };
  next();
}

// Only these roles may continue. Example: router.put('/settings', allow('admin', 'principal'), handler)
export const allow =
  (...roles) =>
  (req, res, next) =>
    roles.includes(req.user?.role) ? next() : next(forbidden());