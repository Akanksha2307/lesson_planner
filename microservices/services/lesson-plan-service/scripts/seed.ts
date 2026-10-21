// npm run seed – fills the lesson-plan database with the demo school (data/demo.json).
// It deletes school "one" first. ONLY ONE PERSON in the team runs this.
import mongoose from "mongoose";
import { config } from "../src/config/index";
import connectDatabase from "../src/config/database";
import { seedDemoSchool } from "../src/services/seed.service";

async function main() {
  await connectDatabase();
  console.log(await seedDemoSchool({ schoolId: config.defaultSchoolId }));
  await mongoose.disconnect();
  console.log("Done – the demo school is loaded.");
}

main().catch((error) => {
  console.error("Seed failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
