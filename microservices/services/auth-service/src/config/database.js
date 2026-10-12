// MongoDB connection for auth-service (database: qshikshak_auth)
import mongoose from 'mongoose';
import { config } from './index.js';

export async function connectDatabase() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongoBaseUrl, { dbName: config.dbName });
  console.log(`[${config.serviceName}] MongoDB connected (database: ${config.dbName})`);
}

export const disconnectDatabase = () => mongoose.disconnect();

export const isDatabaseUp = () => mongoose.connection.readyState === 1;