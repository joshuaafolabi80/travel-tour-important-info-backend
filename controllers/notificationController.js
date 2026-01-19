// travel-tour-important-info-backend/controllers/notificationController.js

const Notification = require('../models/Notification');

class NotificationController {
    // Get notifications for user
    static async getUserNotifications(req, res) {
        try {
            const userId = req.user.userId;
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;

            // Get total count
            const total = await Notification.countDocuments({ userId });

            // Get paginated notifications
            const notifications = await Notification.find({ userId })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('messageId')
                .lean();

            res.json({
                success: true,
                data: notifications,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(total / limit),
                    totalItems: total,
                    itemsPerPage: limit
                }
            });
        } catch (error) {
            console.error('Error fetching notifications:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching notifications'
            });
        }
    }

    // Mark all notifications as read
    static async markAllAsRead(req, res) {
        try {
            const userId = req.user.userId;

            await Notification.updateMany(
                { userId, isRead: false },
                { isRead: true }
            );

            // Emit socket event to update notification count
            const io = req.app.get('io');
            io.to(`user-${userId}`).emit('all-notifications-read', {
                type: 'important-info'
            });

            res.json({
                success: true,
                message: 'All notifications marked as read'
            });
        } catch (error) {
            console.error('Error marking notifications as read:', error);
            res.status(500).json({
                success: false,
                message: 'Error marking notifications as read'
            });
        }
    }

    // Clear all notifications
    static async clearAllNotifications(req, res) {
        try {
            const userId = req.user.userId;

            await Notification.deleteMany({ userId });

            // Emit socket event
            const io = req.app.get('io');
            io.to(`user-${userId}`).emit('notifications-cleared', {
                type: 'important-info'
            });

            res.json({
                success: true,
                message: 'All notifications cleared'
            });
        } catch (error) {
            console.error('Error clearing notifications:', error);
            res.status(500).json({
                success: false,
                message: 'Error clearing notifications'
            });
        }
    }
}

module.exports = NotificationController;