import app from "./app";

import { config } from "./config/index";
import connectDatabase from "./config/database";

async function startServer(): Promise<void> {
  try {
    await connectDatabase();

    app.listen(config.port, "0.0.0.0", () => {
      console.log(
        `[lesson-plan-service] Running on port ${config.port}`
      );
    });
  } catch (error) {
    console.error(
      "[lesson-plan-service] Startup failed:",
      error instanceof Error ? error.message : error
    );

    process.exit(1);
  }
}

startServer();
