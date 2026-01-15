// travel-tour-important-info-backend/controllers/importantInfoController.js

const ImportantInfo = require('../models/ImportantInfo');
const Notification = require('../models/Notification');
const axios = require('axios');

class ImportantInfoController {
    // Create new important information (Admin only)
    static async createImportantInfo(req, res) {
        try {
            // SAFEGUARD: Check if user exists
            if (!req.user) {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            const { title, message, isUrgent, recipients } = req.body;
            const files = req.files || [];

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

            let allUsers = [];
            try {
                const token = req.header('Authorization')?.replace('Bearer ', '');
                if (token) {
                    const response = await axios.get(`${process.env.MAIN_API_BASE_URL}/api/auth/users`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (response.data.success) {
                        allUsers = response.data.users || [];
                    }
                }
            } catch (error) {
                console.error('Error fetching users from main API:', error.message);
            }

            const notifications = [];
            const recipientIds = new Set();

            if (recipients && recipients.length > 0 && !recipients.includes('all')) {
                recipients.forEach(recipient => {
                    if (recipient !== 'students' && recipient !== 'admins') {
                        recipientIds.add(recipient);
                    }
                });
            }

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

            for (const userId of recipientIds) {
                notifications.push({
                    userId,
                    messageId: importantInfo._id,
                    type: 'important-info',
                    title: `New Important Information: ${title}`,
                    isRead: false
                });
            }

            if (notifications.length > 0) {
                await Notification.insertMany(notifications);
            }

            const io = req.app.get('io');
            notifications.forEach(notification => {
                io.to(`user-${notification.userId}`).emit('new-important-info', {
                    messageId: importantInfo._id,
                    title: importantInfo.title,
                    isUrgent: importantInfo.isUrgent,
                    notificationCount: 1
                });
            });

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

    static async getAllImportantInfo(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;

            const total = await ImportantInfo.countDocuments();
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
            res.status(500).json({ success: false, message: 'Error fetching important information' });
        }
    }

    static async getUserImportantInfo(req, res) {
        try {
            // SAFEGUARD: Verify user exists
            if (!req.user || !req.user.userId) {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            const userId = req.user.userId;
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;

            const query = {
                $and: [
                    {
                        $or: [
                            { recipients: 'all' },
                            { recipients: req.user.role },
                            { recipients: userId.toString() }
                        ]
                    },
                    { 'deletedFor.userId': { $ne: userId } }
                ]
            };

            const total = await ImportantInfo.countDocuments(query);
            const importantInfo = await ImportantInfo.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('sender.userId', 'name email')
                .lean();

            const messagesWithReadStatus = importantInfo.map(message => ({
                ...message,
                isRead: (message.readBy || []).some(read => 
                    read.userId && read.userId.toString() === userId.toString()
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
            res.status(500).json({ success: false, message: 'Error fetching important information' });
        }
    }

    static async markAsRead(req, res) {
        try {
            const { messageId } = req.params;
            if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
            
            const userId = req.user.userId;
            const message = await ImportantInfo.findById(messageId);
            
            if (!message) {
                return res.status(404).json({ success: false, message: 'Message not found' });
            }

            const alreadyRead = (message.readBy || []).some(read => 
                read.userId && read.userId.toString() === userId.toString()
            );

            if (!alreadyRead) {
                message.readBy.push({ userId });
                await message.save();
            }

            await Notification.findOneAndUpdate(
                { userId, messageId, type: 'important-info' },
                { isRead: true }
            );

            const io = req.app.get('io');
            io.to(`user-${userId}`).emit('notification-updated', {
                type: 'important-info',
                countDecreased: true
            });

            res.json({ success: true, message: 'Message marked as read' });
        } catch (error) {
            console.error('Error marking message as read:', error);
            res.status(500).json({ success: false, message: 'Error marking message as read' });
        }
    }

    static async getUnreadCount(req, res) {
        try {
            // FIXED: Added null check for req.user to prevent .toString() crash
            if (!req.user || !req.user.userId) {
                return res.status(401).json({ success: false, message: 'Unauthorized: No user session' });
            }

            const userId = req.user.userId;
            const userRole = req.user.role;

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
                message: 'Error fetching unread count',
                error: error.message
            });
        }
    }

    static async deleteForUser(req, res) {
        try {
            if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
            const { messageId } = req.params;
            const userId = req.user.userId;

            const message = await ImportantInfo.findById(messageId);
            if (!message) return res.status(404).json({ success: false, message: 'Message not found' });

            const alreadyDeleted = (message.deletedFor || []).some(deleted => 
                deleted.userId && deleted.userId.toString() === userId.toString()
            );

            if (!alreadyDeleted) {
                message.deletedFor.push({ userId });
                await message.save();
            }

            await Notification.findOneAndDelete({ userId, messageId, type: 'important-info' });

            res.json({ success: true, message: 'Message deleted successfully' });
        } catch (error) {
            console.error('Error deleting message:', error);
            res.status(500).json({ success: false, message: 'Error deleting message' });
        }
    }

    static async deletePermanently(req, res) {
        try {
            const { messageId } = req.params;
            await ImportantInfo.findByIdAndDelete(messageId);
            await Notification.deleteMany({ messageId, type: 'important-info' });
            res.json({ success: true, message: 'Message permanently deleted' });
        } catch (error) {
            console.error('Error deleting message permanently:', error);
            res.status(500).json({ success: false, message: 'Error deleting message' });
        }
    }

    static getFileType(mimeType) {
        if (!mimeType) return 'document';
        if (mimeType === 'application/pdf') return 'pdf';
        if (mimeType.startsWith('image/')) return 'image';
        return 'document';
    }
}

module.exports = ImportantInfoController;