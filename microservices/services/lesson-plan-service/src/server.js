
import app from "./app.js";

import { config } from "./config/index.js";
import { connectDatabase } from "./config/database.js";

async function startServer() {
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
      error.message
    );

    process.exit(1);
  }
}

startServer();
