// travel-tour-important-info-backend/controllers/importantInfoController.js
const ImportantInfo = require('../models/ImportantInfo');
const Notification = require('../models/Notification');
const axios = require('axios');

class ImportantInfoController {
    // Create new important information (Admin only)
    static async createImportantInfo(req, res) {
        try {
            const { title, message, isUrgent, recipients } = req.body;
            const files = req.files || [];

            // Create important info document
            const importantInfo = new ImportantInfo({
                title,
                message,
                sender: {
                    userId: req.user.userId,
                    name: req.user.name,
                    email: req.user.email,
                    role: req.user.role
                },
                isUrgent: isUrgent || false,
                recipients: recipients || ['all'],
                attachments: files.map(file => ({
                    filename: file.filename,
                    originalname: file.originalname,
                    path: file.path,
                    url: file.path ? `${req.protocol}://${req.get('host')}/${file.path}` : file.url,
                    fileType: this.getFileType(file.mimetype),
                    size: file.size
                }))
            });

            await importantInfo.save();

            // Get all users from main API
            let allUsers = [];
            try {
                const response = await axios.get(`${process.env.MAIN_API_BASE_URL}/api/auth/users`, {
                    headers: {
                        'Authorization': `Bearer ${req.header('Authorization').replace('Bearer ', '')}`
                    }
                });
                
                if (response.data.success) {
                    allUsers = response.data.users || [];
                }
            } catch (error) {
                console.error('Error fetching users from main API:', error.message);
            }

            // Create notifications for recipients
            const notifications = [];
            const recipientIds = new Set();

            // Determine recipient user IDs
            if (recipients && recipients.length > 0 && !recipients.includes('all')) {
                recipients.forEach(recipient => {
                    if (recipient !== 'students' && recipient !== 'admins') {
                        recipientIds.add(recipient);
                    }
                });
            }

            // If recipients is 'all' or includes 'students'/'admins', add all users
            if (!recipients || recipients.includes('all') || recipients.includes('students') || recipients.includes('admins')) {
                allUsers.forEach(user => {
                    if (recipients && recipients.length > 0) {
                        if (recipients.includes('students') && user.role === 'student') {
                            recipientIds.add(user._id);
                        } else if (recipients.includes('admins') && user.role === 'admin') {
                            recipientIds.add(user._id);
                        } else if (recipients.includes('all')) {
                            recipientIds.add(user._id);
                        }
                    } else {
                        recipientIds.add(user._id);
                    }
                });
            }

            // Create notification for each recipient
            for (const userId of recipientIds) {
                notifications.push({
                    userId,
                    messageId: importantInfo._id,
                    type: 'important-info',
                    title: `New Important Information: ${title}`,
                    isRead: false
                });
            }

            // Bulk insert notifications
            if (notifications.length > 0) {
                await Notification.insertMany(notifications);
            }

            // Emit socket event for real-time notifications
            const io = req.app.get('io');
            notifications.forEach(notification => {
                io.to(`user-${notification.userId}`).emit('new-important-info', {
                    messageId: importantInfo._id,
                    title: importantInfo.title,
                    isUrgent: importantInfo.isUrgent,
                    notificationCount: 1
                });
            });

            // Also emit to admin room
            io.to('admin-room').emit('important-info-sent', {
                messageId: importantInfo._id,
                title: importantInfo.title,
                recipientCount: recipientIds.size
            });

            res.status(201).json({
                success: true,
                message: 'Important information sent successfully',
                data: importantInfo,
                notificationCount: notifications.length
            });

        } catch (error) {
            console.error('Error creating important info:', error);
            res.status(500).json({
                success: false,
                message: 'Error creating important information',
                error: error.message
            });
        }
    }

    // Get all important information for admin (with pagination)
    static async getAllImportantInfo(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;

            // Get total count
            const total = await ImportantInfo.countDocuments();

            // Get paginated data
            const importantInfo = await ImportantInfo.find()
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('sender.userId', 'name email')
                .lean();

            res.json({
                success: true,
                data: importantInfo,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(total / limit),
                    totalItems: total,
                    itemsPerPage: limit
                }
            });
        } catch (error) {
            console.error('Error fetching important info:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching important information'
            });
        }
    }

    // Get important information for a specific user (with pagination)
    static async getUserImportantInfo(req, res) {
        try {
            const userId = req.user?.userId;
            
            // ✅ FIX: Check if userId exists
            if (!userId) {
                console.warn('User ID is undefined in getUserImportantInfo');
                return res.json({
                    success: true,
                    data: [],
                    pagination: {
                        currentPage: 1,
                        totalPages: 0,
                        totalItems: 0,
                        itemsPerPage: 10
                    }
                });
            }
            
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;

            // ✅ FIX: Use optional chaining and fallback for user role
            const userRole = req.user?.role || 'student';

            // Find messages where user is recipient and not deleted
            const query = {
                $and: [
                    {
                        $or: [
                            { recipients: 'all' },
                            { recipients: userRole },
                            { recipients: userId.toString() }
                        ]
                    },
                    { 'deletedFor.userId': { $ne: userId } }
                ]
            };

            // Get total count
            const total = await ImportantInfo.countDocuments(query);

            // Get paginated data
            const importantInfo = await ImportantInfo.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('sender.userId', 'name email')
                .lean();

            // Check if user has read each message
            const messagesWithReadStatus = importantInfo.map(message => ({
                ...message,
                isRead: message.readBy.some(read => 
                    read.userId && read.userId.toString() === userId
                )
            }));

            res.json({
                success: true,
                data: messagesWithReadStatus,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(total / limit),
                    totalItems: total,
                    itemsPerPage: limit
                }
            });
        } catch (error) {
            console.error('Error fetching user important info:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching important information'
            });
        }
    }

    // Mark message as read
    static async markAsRead(req, res) {
        try {
            const { messageId } = req.params;
            const userId = req.user?.userId;
            
            // ✅ FIX: Check if userId exists
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    message: 'User ID is required'
                });
            }

            const message = await ImportantInfo.findById(messageId);
            
            if (!message) {
                return res.status(404).json({
                    success: false,
                    message: 'Message not found'
                });
            }

            // Check if already read
            const alreadyRead = message.readBy.some(read => 
                read.userId && read.userId.toString() === userId
            );

            if (!alreadyRead) {
                message.readBy.push({ userId });
                await message.save();
            }

            // Mark notification as read
            await Notification.findOneAndUpdate(
                { userId, messageId, type: 'important-info' },
                { isRead: true },
                { new: true }
            );

            // Update notification count via socket
            const io = req.app.get('io');
            io.to(`user-${userId}`).emit('notification-updated', {
                type: 'important-info',
                countDecreased: true
            });

            res.json({
                success: true,
                message: 'Message marked as read'
            });
        } catch (error) {
            console.error('Error marking message as read:', error);
            res.status(500).json({
                success: false,
                message: 'Error marking message as read'
            });
        }
    }

    // Get unread count for user
    static async getUnreadCount(req, res) {
        try {
            const userId = req.user?.userId;
            
            // ✅ FIX: Check if userId exists
            if (!userId) {
                console.warn('User ID is undefined in getUnreadCount');
                return res.json({
                    success: true,
                    count: 0
                });
            }

            // ✅ FIX: Use optional chaining and fallback for user role
            const userRole = req.user?.role || 'student';

            // Get messages where user is recipient, not deleted, and not read
            const query = {
                $and: [
                    {
                        $or: [
                            { recipients: 'all' },
                            { recipients: userRole },
                            { recipients: userId.toString() }
                        ]
                    },
                    { 'deletedFor.userId': { $ne: userId } },
                    { 'readBy.userId': { $ne: userId } }
                ]
            };

            const unreadCount = await ImportantInfo.countDocuments(query);

            res.json({
                success: true,
                count: unreadCount
            });
        } catch (error) {
            console.error('Error fetching unread count:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching unread count'
            });
        }
    }

    // Delete message for user (soft delete)
    static async deleteForUser(req, res) {
        try {
            const { messageId } = req.params;
            const userId = req.user?.userId;
            
            // ✅ FIX: Check if userId exists
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    message: 'User ID is required'
                });
            }

            const message = await ImportantInfo.findById(messageId);
            
            if (!message) {
                return res.status(404).json({
                    success: false,
                    message: 'Message not found'
                });
            }

            // Check if already deleted for this user
            const alreadyDeleted = message.deletedFor.some(deleted => 
                deleted.userId && deleted.userId.toString() === userId
            );

            if (!alreadyDeleted) {
                message.deletedFor.push({ userId });
                await message.save();
            }

            // Delete notification
            await Notification.findOneAndDelete({
                userId,
                messageId,
                type: 'important-info'
            });

            res.json({
                success: true,
                message: 'Message deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting message:', error);
            res.status(500).json({
                success: false,
                message: 'Error deleting message'
            });
        }
    }

    // Admin: Delete message permanently
    static async deletePermanently(req, res) {
        try {
            const { messageId } = req.params;

            // Delete message
            await ImportantInfo.findByIdAndDelete(messageId);

            // Delete all related notifications
            await Notification.deleteMany({ messageId, type: 'important-info' });

            res.json({
                success: true,
                message: 'Message permanently deleted'
            });
        } catch (error) {
            console.error('Error deleting message permanently:', error);
            res.status(500).json({
                success: false,
                message: 'Error deleting message'
            });
        }
    }

    // Helper method to get file type
    static getFileType(mimeType) {
        if (mimeType === 'application/pdf') {
            return 'pdf';
        } else if (mimeType.startsWith('image/')) {
            return 'image';
        } else {
            return 'document';
        }
    }
}

module.exports = ImportantInfoController;