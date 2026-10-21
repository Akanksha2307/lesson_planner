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

  // approval-service sends the bell notifications (holiday added, lessons moved …)
  approvalUrl:
    process.env.APPROVAL_URL ||
    "http://localhost:5003",

  corsOrigins: (
    process.env.CORS_ORIGINS ||
    "http://localhost:3002"
  ).split(",").map((origin) => origin.trim()),

  nodeEnv: process.env.NODE_ENV || "development",

  isProd: process.env.NODE_ENV === "production"
};
