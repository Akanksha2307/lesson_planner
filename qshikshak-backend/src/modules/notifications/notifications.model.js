// One bell notification for one person.
import mongoose from 'mongoose';
import { newId, toClient } from '../../common/ids.js';

const schema = new mongoose.Schema(
  {
    _id: { type: String, default: () => newId('n') },
    schoolId: { type: String, required: true },
    to: { type: String, required: true }, // staff id
    title: { type: String, required: true },
    text: String,
    link: String, // frontend page to open, e.g. /lesson-planner/plans/plan-123
    at: { type: Date, default: Date.now },
    read: { type: Boolean, default: false },
    // Stops the same notification being sent twice (e.g. the "waited too long" reminder)
    key: String,
  },
  { versionKey: false },
);
schema.index({ schoolId: 1, to: 1, at: -1 });
schema.index({ schoolId: 1, key: 1 });
schema.plugin(toClient);

export const Notification = mongoose.model('Notification', schema);
