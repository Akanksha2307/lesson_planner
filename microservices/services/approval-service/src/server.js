import "dotenv/config";
import app from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import dns from 'node:dns';

const PORT = Number(process.env.PORT) || 5003;
let server;

async function startServer() {
  try {
    dns.setServers(['8.8.8.8']);
    await connectDatabase();

    server = app.listen(PORT, () => {
      console.log(`Approval Service running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start Approval Service:", error.message);
    process.exitCode = 1;
  }
}

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down Approval Service...`);

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  try {
    await disconnectDatabase();
  } catch (error) {
    console.error("Error while disconnecting from MongoDB:", error.message);
    process.exitCode = 1;
  }

  process.exit();
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

await startServer();
