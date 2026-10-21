// Lesson-plan templates: which fields the lesson form shows
import mongoose from "mongoose";
import { schoolModel, req } from "./schoolModel";

export const Template = mongoose.model(
  "Template",
  schoolModel("tpl", {
    name: req(String),
    board: String,
    isDefault: { type: Boolean, default: false },
    // [{ key, label, type, enabled, required }]
    fields: { type: [mongoose.Schema.Types.Mixed], default: [] }
  })
);
