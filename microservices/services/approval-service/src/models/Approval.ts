// One approval record per lesson plan: its current state and the full review history.
// The PLAN itself (and its status) lives in lesson-plan-service; this is the review log.
import { Schema, model, type HydratedDocument } from 'mongoose';
import type { Role } from '../constants/roles.js';

export const APPROVAL_ACTIONS = ['SUBMITTED', 'HOD_APPROVED', 'HOD_SENT_BACK', 'PRINCIPAL_APPROVED', 'PRINCIPAL_SENT_BACK', 'RESUBMITTED'] as const;
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

export type ApprovalStatus = 'SUBMITTED' | 'SENT_BACK_TO_TEACHER' | 'SENT_BACK_BY_PRINCIPAL' | 'APPROVED';

export interface ApprovalHistoryItem {
  action: ApprovalAction;
  performedBy: string;
  role: Role;
  comment: string;
  performedAt: Date;
}

export interface IApproval {
  schoolId: string;
  lessonPlanId: string;
  title: string;
  subject: string;
  className: string;
  section: string;
  teacherId: string;
  teacherName: string;
  status: ApprovalStatus;
  hodId: string;
  hodComment: string;
  hodReviewedAt: Date | null;
  principalId: string;
  principalComment: string;
  principalReviewedAt: Date | null;
  history: ApprovalHistoryItem[];
  createdAt?: Date;
  updatedAt?: Date;
}

const historySchema = new Schema<ApprovalHistoryItem>(
  {
    action: { type: String, required: true, enum: APPROVAL_ACTIONS },
    performedBy: { type: String, required: true },
    role: { type: String, required: true },
    comment: { type: String, trim: true, maxlength: 2000, default: '' },
    performedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const approvalSchema = new Schema<IApproval>(
  {
    schoolId: { type: String, required: true, index: true },
    lessonPlanId: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    subject: { type: String, trim: true, default: '' },
    className: { type: String, trim: true, default: '' },
    section: { type: String, trim: true, default: '' },
    teacherId: { type: String, required: true, index: true },
    teacherName: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['SUBMITTED', 'SENT_BACK_TO_TEACHER', 'SENT_BACK_BY_PRINCIPAL', 'APPROVED'], default: 'SUBMITTED', index: true },
    hodId: { type: String, default: '' },
    hodComment: { type: String, trim: true, maxlength: 2000, default: '' },
    hodReviewedAt: { type: Date, default: null },
    principalId: { type: String, default: '' },
    principalComment: { type: String, trim: true, maxlength: 2000, default: '' },
    principalReviewedAt: { type: Date, default: null },
    history: { type: [historySchema], default: [] },
  },
  { timestamps: true },
);

approvalSchema.index({ schoolId: 1, lessonPlanId: 1 });
approvalSchema.index({ schoolId: 1, status: 1, createdAt: -1 });
approvalSchema.index({ schoolId: 1, teacherId: 1, createdAt: -1 });

export type ApprovalDocument = HydratedDocument<IApproval>;
export const Approval = model<IApproval>('Approval', approvalSchema);
