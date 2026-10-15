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

    // The shape the frontend's bell uses: { id, to, title, text, link, at, read }
    const data = notifications.map((n) => ({
      id: String(n._id),
      to: n.recipientId,
      title: n.title,
      text: n.message,
      link: n.link || (n.relatedPlanId ? `/lesson-planner/plans/${n.relatedPlanId}` : null),
      at: n.createdAt,
      read: n.isRead
    }));

    return res.status(200).json({
      success: true,
      data,
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

    // The frontend's bell sends no ids ("mark all as read") – then every unread one is marked
    if (!Array.isArray(notificationIds)) {
      const all = await Notification.updateMany(
        { schoolId: String(schoolId), recipientId: String(id), isRead: false },
        { $set: { isRead: true, readAt: new Date() } }
      );
      return res.status(200).json({
        success: true,
        data: { modifiedCount: all.modifiedCount },
        message: "Notifications marked as read."
      });
    }

    if (
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