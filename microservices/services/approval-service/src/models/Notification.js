import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    schoolId: {
      type: String,
      required: true,
      index: true
    },
    recipientId: {
      type: String,
      required: true,
      index: true
    },
    type: {
      type: String,
      default: "GENERAL",
      trim: true,
      maxlength: 100
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },
    relatedPlanId: {
      type: String,
      default: null
    },
    // Page the bell opens when clicked, e.g. /lesson-planner/plans/plan-123
    link: {
      type: String,
      default: null
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true
    },
    readAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

notificationSchema.index({
  schoolId: 1,
  recipientId: 1,
  isRead: 1,
  createdAt: -1
});

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;