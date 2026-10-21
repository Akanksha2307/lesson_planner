import mongoose from "mongoose";
import { config } from "./index";

const connectDatabase = async (): Promise<void> => {
  if (!config.mongoUrl) {
    throw new Error(
      "MONGO_URL is missing from the environment"
    );
  }

  await mongoose.connect(config.mongoUrl, {
    serverSelectionTimeoutMS: 10000
  });

  console.log(
    "[lesson-plan-service] MongoDB connected"
  );
};

export default connectDatabase;
