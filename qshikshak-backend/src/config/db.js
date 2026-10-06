import mongoose from 'mongoose';
import { config } from './index.js';

export async function connectDb(url = config.mongoUrl) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(url);
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}