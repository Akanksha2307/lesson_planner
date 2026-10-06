import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { forbidden, unauthorized } from './response.js';

export const ROLES = ['teacher', 'hod', 'admin', 'principal', 'parent'];

export function authenticate(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (token) {
    try {
      const p = jwt.verify(token, config.jwtSecret);
      req.user = { id: p.sub, role: p.role, name: p.name, departmentId: p.departmentId, schoolId: p.schoolId };
    } catch {
      return next(unauthorized('Your session has expired. Please log in again.'));
    }
  } else if (config.allowDevAuth && req.get('x-user-id') && ROLES.includes(req.get('x-user-role'))) {
    // For testing only: x-user-id and x-user-role headers
    req.user = { id: req.get('x-user-id'), role: req.get('x-user-role') };
  } else {
    return next(unauthorized());
  }

  req.ctx = {
    // A logged-in user can only see their own school; the header is only used with test headers
    schoolId: req.user.schoolId || req.get('x-school-id') || config.defaultSchoolId,
    academicYearId: req.get('x-academic-year-id') || '',
    boardId: req.get('x-board-id') || '',
  };
  next();
}

// Example: router.put('/settings', allow('admin', 'principal'), handler)
export const allow =
  (...roles) =>
  (req, res, next) =>
    roles.includes(req.user?.role) ? next() : next(forbidden());

export const signToken = (user, expiresIn = '12h') =>
  jwt.sign(
    { sub: user.id, role: user.role, name: user.name, departmentId: user.departmentId, schoolId: user.schoolId },
    config.jwtSecret,
    { expiresIn },
  );