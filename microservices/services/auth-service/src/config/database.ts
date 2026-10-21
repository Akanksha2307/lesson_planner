// MongoDB connection for auth-service (database: qshikshak_auth)
import mongoose from 'mongoose';
import { config } from './env.js';

export async function connectDatabase(): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongoBaseUrl, { dbName: config.dbName, serverSelectionTimeoutMS: 10_000 });
  console.log(`[${config.serviceName}] MongoDB connected (database: ${config.dbName})`);
}

export const disconnectDatabase = (): Promise<void> => mongoose.disconnect();

export const isDatabaseUp = (): boolean => mongoose.connection.readyState === 1;
