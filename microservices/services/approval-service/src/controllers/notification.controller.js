
import mongoose from "mongoose";
import Notification from "../models/Notification.js";

export async function getNotifications(req, res) {
  try {
    const { schoolId, id, role } = req.user;

    if (!schoolId || !id || !role) {
      return res.status(403).json({
        success: false,
        message:
          "Your account is missing required school or user information."
      });
    }

    const filter = {
      schoolId: String(schoolId),
      recipientId: String(id)
    };

    if (req.query.unread === "true") {
      filter.isRead = false;
    }

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.status(200).json({
      success: true,
      data: notifications,
      message: "Notifications retrieved successfully."
    });
  } catch (error) {
    console.error("Get notifications failed:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve notifications."
    });
  }
}

export async function markNotificationsRead(req, res) {
  try {
    const { schoolId, id, role } = req.user;

    if (!schoolId || !id || !role) {
      return res.status(403).json({
        success: false,
        message:
          "Your account is missing required school or user information."
      });
    }

    const { notificationIds } = req.body ?? {};

    if (
      !Array.isArray(notificationIds) ||
      notificationIds.length === 0 ||
      notificationIds.length > 100 ||
      !notificationIds.every(
        (notificationId) =>
          typeof notificationId === "string" &&
          mongoose.isValidObjectId(notificationId)
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Provide notificationIds as an array of 1–100 valid notification IDs."
      });
    }

    const result = await Notification.updateMany(
      {
        _id: { $in: notificationIds },
        schoolId: String(schoolId),
        recipientId: String(id),
        isRead: false
      },
      {
        $set: {
          isRead: true,
          readAt: new Date()
        }
      }
    );

    return res.status(200).json({
      success: true,
      data: {
        modifiedCount: result.modifiedCount
      },
      message: "Notifications marked as read."
    });
  } catch (error) {
    console.error("Mark notifications read failed:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to mark notifications as read."
    });
  }
}
