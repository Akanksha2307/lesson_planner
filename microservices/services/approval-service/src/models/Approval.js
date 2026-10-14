import mongoose from "mongoose";

const approvalHistorySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: [
        "SUBMITTED",
        "HOD_APPROVED",
        "HOD_SENT_BACK",
        "PRINCIPAL_APPROVED",
        "PRINCIPAL_SENT_BACK",
        "RESUBMITTED"
      ]
    },
    performedBy: {
      type: String,
      required: true
    },
    role: {
      type: String,
      required: true,
      enum: ["teacher", "hod", "principal", "admin"]
    },
    comment: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: ""
    },
    performedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const approvalSchema = new mongoose.Schema(
  {
    schoolId: {
      type: String,
      required: true,
      index: true
    },
    lessonPlanId: {
      type: String,
      required: true,
      trim: true
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    subject: {
      type: String,
      trim: true,
      default: ""
    },
    className: {
      type: String,
      trim: true,
      default: ""
    },
    section: {
      type: String,
      trim: true,
      default: ""
    },
    teacherId: {
      type: String,
      required: true,
      index: true
    },
    teacherName: {
      type: String,
      trim: true,
      default: ""
    },
    status: {
      type: String,
      enum: [
        "SUBMITTED",
        "HOD_REVIEW",
        "SENT_BACK_TO_TEACHER",
        "PRINCIPAL_REVIEW",
        "SENT_BACK_BY_PRINCIPAL",
        "APPROVED"
      ],
      default: "SUBMITTED",
      index: true
    },
    hodId: {
      type: String,
      default: ""
    },
    hodComment: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: ""
    },
    hodReviewedAt: {
      type: Date,
      default: null
    },
    principalId: {
      type: String,
      default: ""
    },
    principalComment: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: ""
    },
    principalReviewedAt: {
      type: Date,
      default: null
    },
    history: {
      type: [approvalHistorySchema],
      default: []
    }
  },
  { timestamps: true }
);

approvalSchema.index({ schoolId: 1, lessonPlanId: 1 });
approvalSchema.index({ schoolId: 1, status: 1, createdAt: -1 });
approvalSchema.index({ schoolId: 1, teacherId: 1, createdAt: -1 });

const Approval = mongoose.model("Approval", approvalSchema);

export default Approval;
