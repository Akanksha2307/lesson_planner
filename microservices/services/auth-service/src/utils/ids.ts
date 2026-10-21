import { Types } from 'mongoose';

// Readable unique ids: "ses-6710a2…" (a prefix + a MongoDB ObjectId as text)
export const newId = (prefix: string): string => `${prefix}-${new Types.ObjectId().toString()}`;