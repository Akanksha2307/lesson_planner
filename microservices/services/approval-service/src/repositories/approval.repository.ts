// All database access for approval records. Services never call the model directly.
import { Approval, type ApprovalDocument, type ApprovalStatus, type IApproval } from '../models/index.js';

export const approvalRepository = {
  findById(schoolId: string, id: string): Promise<IApproval | null> {
    return Approval.findOne({ _id: id, schoolId }).lean<IApproval>().exec();
  },

  findByPlan(schoolId: string, lessonPlanId: string): Promise<IApproval | null> {
    return Approval.findOne({ schoolId, lessonPlanId }).lean<IApproval>().exec();
  },

  // A full document, because the review service changes it and saves it
  findDocumentByPlan(schoolId: string, lessonPlanId: string): Promise<ApprovalDocument | null> {
    return Approval.findOne({ schoolId, lessonPlanId }).exec();
  },

  newRecord(data: Partial<IApproval>): ApprovalDocument {
    return new Approval(data);
  },

  list(filter: { schoolId: string; teacherId?: string; status?: ApprovalStatus }): Promise<IApproval[]> {
    return Approval.find(filter).sort({ updatedAt: -1 }).limit(200).lean<IApproval[]>().exec();
  },
};
