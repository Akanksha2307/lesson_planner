// Helper for every school model: string _id, schoolId, order (for sorting) + the fields given.
import mongoose from 'mongoose';
import { newId, toClient } from '../utils/ids.js';

export function schoolModel(prefix, fields, collection) {
  const schema = new mongoose.Schema(
    {
      _id: { type: String, default: () => newId(prefix) },
      schoolId: { type: String, required: true, index: true },
      order: { type: Number, default: 0 },
      ...fields,
    },
    { timestamps: true, collection },
  );
  schema.plugin(toClient);
  return schema;
}

// A required field (strings are trimmed)
export const req = (type) => ({ type, required: true, trim: type === String });