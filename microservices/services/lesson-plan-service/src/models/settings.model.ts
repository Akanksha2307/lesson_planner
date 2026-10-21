// One settings record per school (its _id is the school id)
import mongoose from "mongoose";
import { toClient } from "../utils/ids";

const settingsSchema = new mongoose.Schema(
  {
    _id: String,
    approvalRequired: { type: Boolean, default: true },
    approver: { type: String, default: "hod" },
    submissionDay: { type: String, default: "Saturday" },
    dailyReminderTime: { type: String, default: "18:00" },
    autoShift: { type: Boolean, default: true },
    skipHolidays: { type: Boolean, default: true },
    skipExams: { type: Boolean, default: true },
    whatsappHomework: { type: Boolean, default: false },
    editAfterApproval: { type: String, enum: ["reapprove", "allow"], default: "reapprove" },
    // The principal may review a plan the HOD has not reviewed after this many days
    principalAfterDays: { type: Number, default: 2, min: 0, max: 30 },
    // [{ id, type: 'period' | 'break' | 'assembly' | 'study', label, start, end }]
    bellSchedule: { type: [mongoose.Schema.Types.Mixed], default: [] }
  },
  { timestamps: true, collection: "settings" }
);
settingsSchema.plugin(toClient);

export const Settings = mongoose.model("Settings", settingsSchema);
