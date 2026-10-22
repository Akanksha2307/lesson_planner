// @ts-nocheck
import dotenv from "dotenv";
import { connectDatabase, disconnectDatabase } from "./src/config/database.js";
import Notification from "./src/models/Notification.js";

dotenv.config();

try {
  await connectDatabase();

  const notification = await Notification.create({
    schoolId: "one",
    recipientId: "t1",
    type: "TEST",
    title: "API 7 Test",
    message: "Testing mark notifications as read.",
    relatedPlanId: "test-plan-001"
  });

  console.log("TEST NOTIFICATION CREATED");
  console.log("Notification ID:", notification._id.toString());

} catch (error) {
  console.error("TEST NOTIFICATION FAILED:", error.message);
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
