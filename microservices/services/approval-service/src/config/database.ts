// MongoDB connection for approval-service (database: qshikshak_approvals, named in MONGODB_URI)
import dns from 'node:dns';
import mongoose from 'mongoose';
import { config } from './env.js';

export async function connectDatabase(): Promise<void> {
  // Atlas "mongodb+srv" addresses need an SRV lookup; some networks only answer it via public DNS
  if (config.mongoUri.startsWith('mongodb+srv://') && config.dnsServers.length) dns.setServers(config.dnsServers);
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 15_000 });
  console.log(`[${config.serviceName}] MongoDB connected (database: ${mongoose.connection.name})`);
}

export const disconnectDatabase = (): Promise<void> => mongoose.disconnect();

export const isDatabaseUp = (): boolean => mongoose.connection.readyState === 1;
