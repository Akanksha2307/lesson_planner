// Refresh-token sessions (one per logged-in device)
import { RefreshSession, type IRefreshSession } from '../models/index.js';

export interface NewSession {
  _id: string;
  userId: string;
  schoolId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent: string;
  ip: string;
}

export const sessionRepository = {
  async create(data: NewSession): Promise<void> {
    await RefreshSession.create(data);
  },

  findById(id: string): Promise<IRefreshSession | null> {
    return RefreshSession.findById(id).lean<IRefreshSession>().exec();
  },

  // Atomic: only succeeds if nobody used this token in the meantime
  async rotate(id: string, oldHash: string, newHash: string, expiresAt: Date): Promise<boolean> {
    const updated = await RefreshSession.findOneAndUpdate(
      { _id: id, tokenHash: oldHash, revokedAt: null },
      { $set: { tokenHash: newHash, expiresAt, lastUsedAt: new Date() } },
    ).exec();
    return updated !== null;
  },

  async revoke(id: string, reason: string): Promise<number> {
    const r = await RefreshSession.updateOne({ _id: id, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: reason } }).exec();
    return r.modifiedCount;
  },

  async revokeAllForUser(userId: string, reason: string): Promise<number> {
    const r = await RefreshSession.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: reason } }).exec();
    return r.modifiedCount;
  },
};
