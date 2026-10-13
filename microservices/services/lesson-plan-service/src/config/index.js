
import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 5002),

  mongoUrl: process.env.MONGO_URL || "",

  jwtSecret: process.env.JWT_SECRET || "",

  internalToken: process.env.INTERNAL_TOKEN || "",

  defaultSchoolId: process.env.DEFAULT_SCHOOL_ID || "one",

  allowDevAuth:
  process.env.NODE_ENV === "development" &&
  process.env.ALLOW_DEV_AUTH === "true",

  authServiceUrl:
    process.env.AUTH_SERVICE_URL ||
    "http://localhost:5001",

  corsOrigins: (
    process.env.CORS_ORIGINS ||
    "http://localhost:3002"
  ).split(",").map((origin) => origin.trim()),

  nodeEnv: process.env.NODE_ENV || "development"
};
