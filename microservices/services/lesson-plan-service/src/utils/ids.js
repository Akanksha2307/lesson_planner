import { Types } from 'mongoose';

export const newId = (prefix) => `${prefix}-${new Types.ObjectId().toString()}`;

export function toClient(schema) {
  const transform = (doc, ret) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  };
  schema.set('toJSON', { virtuals: false, versionKey: false, transform });
  schema.set('toObject', { virtuals: false, versionKey: false, transform });
}