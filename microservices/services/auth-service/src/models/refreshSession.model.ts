// One row per logged-in device. The refresh token itself is NEVER stored – only its SHA-256 hash.
//   login           → new session
//   refresh-token   → the session gets a NEW token (rotation); the old one stops working
//   old token used again → someone copied it: ALL sessions of that user are revoked
//   logout          → the session is revoked
// MongoDB deletes expired sessions by itself (TTL index on expiresAt).
import { Schema, model } from 'mongoose';
import { newId } from '../utils/ids.js';

export interface IRefreshSession {
  _id: string;
  userId: string;
  schoolId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
  userAgent: string;
  ip: string;
  lastUsedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const sessionSchema = new Schema<IRefreshSession>(
  {
    _id: { type: String, default: () => newId('ses') },
    userId: { type: String, required: true, index: true },
    schoolId: { type: String, required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: null },
    userAgent: { type: String, default: '' },
    ip: { type: String, default: '' },
    lastUsedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true, collection: 'refresh_sessions' },
);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshSession = model<IRefreshSession>('RefreshSession', sessionSchema);
