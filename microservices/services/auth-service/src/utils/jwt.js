// Login tokens. Payload: { sub: staff id, role, name, departmentId, schoolId }
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

export const signToken = (user) =>
  jwt.sign(
    { sub: user.id, role: user.role, name: user.name, departmentId: user.departmentId, schoolId: user.schoolId },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn },
  );

// Throws if the token is wrong or expired
export const verifyToken = (token) => jwt.verify(token, config.jwtSecret);