// The school's people: teachers, HODs, principal, admin, parents.
// This is the school directory only – NO passwords here. Logging in belongs to the
// Authentication service; its token's user id must be this staff id.
import mongoose from "mongoose";
import { ROLES } from "../constants/roles";
import { schoolModel, req } from "./schoolModel";

const staffSchema = schoolModel(
  "stf",
  {
    name: req(String),
    role: { type: String, required: true, enum: Object.values(ROLES) },
    departmentId: String,
    active: { type: Boolean, default: true }
  },
  "staff"
);

export const Staff = mongoose.model("Staff", staffSchema);
