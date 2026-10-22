// @ts-nocheck

import mongoose from "mongoose";
import dns from "node:dns";

export async function connectDatabase() {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error(
      "MONGODB_URI is missing from the environment configuration."
    );
  }

  // Use Google's DNS resolver for MongoDB Atlas SRV records.
  dns.setServers(["8.8.8.8"]);

  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 15000,
  });

  console.log(
    `Approval Service connected to MongoDB database: ${mongoose.connection.name}`
  );
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
