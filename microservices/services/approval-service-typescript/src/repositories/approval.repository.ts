import Approval from "../models/Approval.js";

/**
 * Data-access layer for approval records. Keeps MongoDB queries out of
 * controllers and gives services one place to change persistence behavior.
 */
export const ApprovalRepository = {
  findByIdAndSchool(id: string, schoolId: string) {
    return Approval.findOne({ _id: id, schoolId });
  },

  findBySchoolAndLessonPlan(schoolId: string, lessonPlanId: string) {
    return Approval.findOne({ schoolId, lessonPlanId });
  },

  findMany(query: Record<string, unknown>) {
    return Approval.find(query).sort({ updatedAt: -1 }).limit(200).lean();
  },

  create(input: Record<string, unknown>) {
    return new Approval(input);
  }
};

export default ApprovalRepository;
