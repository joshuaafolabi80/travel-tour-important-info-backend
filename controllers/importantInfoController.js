// travel-tour-important-info-backend/controllers/importantInfoController.js
const ImportantInfo = require('../models/ImportantInfo');
const Notification = require('../models/Notification');
const axios = require('axios');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

class ImportantInfoController {
    // Create new important information (Admin only)
    static async createImportantInfo(req, res) {
        try {
            const { title, message, isUrgent, recipients } = req.body;
            const files = req.files || [];

            console.log('🔍 CREATE - Request body:', { title, isUrgent, recipients });
            console.log('🔍 CREATE - User making request:', req.user);
            console.log('🔍 CREATE - Files received:', files.length);

            // ✅ FIX: Handle recipients properly - could be string 'all' or array
            let recipientsArray;
            if (recipients === 'all') {
                recipientsArray = ['all'];
            } else if (Array.isArray(recipients)) {
                recipientsArray = recipients;
            } else if (recipients) {
                // If it's a string (like 'students' or 'admins')
                recipientsArray = [recipients];
            } else {
                recipientsArray = ['all'];
            }

            console.log('✅ CREATE - Recipients array:', recipientsArray);

            // ✅ FIX: Handle file attachments with Cloudinary
            const attachments = [];
            
            if (files && files.length > 0) {
                for (const file of files) {
                    console.log('📁 Processing file:', {
                        filename: file.filename,
                        originalname: file.originalname,
                        mimetype: file.mimetype,
                        size: file.size,
                        path: file.path
                    });

                    let fileUrl;
                    let cloudinaryResult = null;

                    try {
                        // Upload to Cloudinary
                        cloudinaryResult = await cloudinary.uploader.upload(file.path, {
                            folder: 'important-info',
                            resource_type: 'auto',
                            allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx'],
                            use_filename: true,
                            unique_filename: true
                        });
                        
                        console.log('✅ CLOUDINARY - Upload successful:', cloudinaryResult.secure_url);
                        fileUrl = cloudinaryResult.secure_url;
                        
                        // Delete local file after successful upload
                        fs.unlinkSync(file.path);
                        console.log('✅ CLEANUP - Local file deleted');
                        
                    } catch (cloudinaryError) {
                        console.error('❌ CLOUDINARY - Upload failed:', cloudinaryError.message);
                        
                        // Fallback to local file URL
                        if (file.path) {
                            const filename = path.basename(file.filename);
                            let subfolder = 'documents/';
                            if (file.mimetype === 'application/pdf') {
                                subfolder = 'pdf/';
                            } else if (file.mimetype.startsWith('image/')) {
                                subfolder = 'images/';
                            }
                            fileUrl = `${req.protocol}://${req.get('host')}/uploads/${subfolder}${filename}`;
                        }
                    }

                    attachments.push({
                        filename: file.filename,
                        originalname: file.originalname,
                        path: file.path,
                        url: fileUrl,
                        cloudinaryId: cloudinaryResult?.public_id || null,
                        fileType: ImportantInfoController.getFileType(file.mimetype),
                        size: file.size
                    });
                }
            }

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
                isUrgent: isUrgent === 'true' || isUrgent === true,
                recipients: recipientsArray,
                attachments: attachments
            });

            await importantInfo.save();
            console.log('✅ CREATE - Message saved to DB:', importantInfo._id);

            // ✅ FIX: REMOVED blocking user fetching to prevent timeout
            // Instead, handle notifications asynchronously
            const allUsers = []; // Empty array for now
            
            // Create notifications for recipients
            const notifications = [];
            const recipientIds = new Set();

            // Determine recipient user IDs
            if (recipientsArray && recipientsArray.length > 0 && !recipientsArray.includes('all')) {
                recipientsArray.forEach(recipient => {
                    if (recipient !== 'students' && recipient !== 'admins') {
                        recipientIds.add(recipient);
                    }
                });
            }

            // If recipients is 'all', we'll handle notifications later
            if (recipientsArray.includes('all') || recipientsArray.includes('students') || recipientsArray.includes('admins')) {
                // For now, just log that it's for all users
                console.log('✅ CREATE - Message marked for all users');
                
                // Create a single notification placeholder for socket
                notifications.push({
                    userId: 'broadcast-all',
                    messageId: importantInfo._id,
                    type: 'important-info',
                    title: `New Important Information: ${title}`,
                    isRead: false
                });
                
                // Add all users from the array if we had them
                allUsers.forEach(user => {
                    if (recipientsArray.length > 0) {
                        if (recipientsArray.includes('students') && user.role === 'student') {
                            recipientIds.add(user._id);
                        } else if (recipientsArray.includes('admins') && user.role === 'admin') {
                            recipientIds.add(user._id);
                        } else if (recipientsArray.includes('all')) {
                            recipientIds.add(user._id);
                        }
                    } else {
                        recipientIds.add(user._id);
                    }
                });
            }

            console.log('✅ CREATE - Recipient user IDs count:', recipientIds.size);

            // ✅ FIX: Bulk insert notifications ONLY if we have real user IDs
            if (notifications.length > 0 && notifications[0].userId !== 'broadcast-all') {
                await Notification.insertMany(notifications);
                console.log('✅ CREATE - Created', notifications.length, 'notifications');
            } else if (notifications.length > 0) {
                console.log('✅ CREATE - Notifications will be created asynchronously');
                
                // Start async notification creation
                ImportantInfoController.createNotificationsAsync(
                    importantInfo._id,
                    title,
                    isUrgent,
                    req.header('Authorization')
                ).catch(err => {
                    console.error('❌ Async notification error:', err.message);
                });
            }

            // Emit socket event for real-time notifications
            const io = req.app.get('io');
            
            // Broadcast to all connected users
            io.emit('new-important-info', {
                messageId: importantInfo._id,
                title: importantInfo.title,
                isUrgent: importantInfo.isUrgent,
                timestamp: new Date().toISOString(),
                attachmentsCount: attachments.length
            });
            
            // Specific room for admin
            io.to('admin-room').emit('important-info-sent', {
                messageId: importantInfo._id,
                title: importantInfo.title,
                recipientCount: recipientsArray.includes('all') ? 'all users' : recipientIds.size
            });

            res.status(201).json({
                success: true,
                message: 'Important information sent successfully',
                data: importantInfo,
                notificationStatus: 'broadcasted'
            });

        } catch (error) {
            console.error('❌ Error creating important info:', error);
            console.error('❌ Error stack:', error.stack);
            res.status(500).json({
                success: false,
                message: 'Error creating important information',
                error: error.message
            });
        }
    }

    // ✅ NEW: Async method to create notifications without blocking
    static async createNotificationsAsync(messageId, title, isUrgent, authToken) {
        try {
            console.log('🔄 ASYNC - Starting notification creation for message:', messageId);
            
            // Get all users from main API with timeout
            let allUsers = [];
            try {
                const response = await axios.get(`${process.env.MAIN_API_BASE_URL || 'https://travel-tour-backend.onrender.com'}/api/auth/users`, {
                    headers: {
                        'Authorization': `Bearer ${authToken?.replace('Bearer ', '')}`
                    },
                    timeout: 30000 // 30 second timeout
                });
                
                if (response.data.success) {
                    allUsers = response.data.users || [];
                }
                console.log('✅ ASYNC - Fetched', allUsers.length, 'users from main API');
            } catch (error) {
                console.error('❌ ASYNC - Error fetching users:', error.message);
                return; // Don't fail the whole process
            }

            // Create notifications for all users
            const notifications = [];
            allUsers.forEach(user => {
                notifications.push({
                    userId: user._id,
                    messageId: messageId,
                    type: 'important-info',
                    title: `New Important Information: ${title}`,
                    isRead: false,
                    createdAt: new Date()
                });
            });

            // Bulk insert notifications
            if (notifications.length > 0) {
                await Notification.insertMany(notifications);
                console.log('✅ ASYNC - Created', notifications.length, 'notifications');
                
                // Update message with read count if needed
                await ImportantInfo.findByIdAndUpdate(
                    messageId,
                    { $set: { notificationCount: notifications.length } }
                );
            }

        } catch (error) {
            console.error('❌ ASYNC - Error in background notification creation:', error.message);
        }
    }

    // Get all important information for admin (with pagination)
    static async getAllImportantInfo(req, res) {
        try {
            console.log('🔍 GET_ALL - Request received from admin:', req.user);
            
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;

            console.log('🔍 GET_ALL - Pagination:', { page, limit, skip });

            // Get total count
            const total = await ImportantInfo.countDocuments();
            console.log('✅ GET_ALL - Total messages:', total);

            // Get paginated data
            const importantInfo = await ImportantInfo.find()
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean();

            console.log('✅ GET_ALL - Found', importantInfo.length, 'messages');

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
            console.error('❌ Error fetching important info:', error);
            console.error('❌ Error stack:', error.stack);
            res.status(500).json({
                success: false,
                message: 'Error fetching important information',
                error: error.message
            });
        }
    }

    // Get important information for a specific user (with pagination)
    static async getUserImportantInfo(req, res) {
        try {
            console.log('🔍 GET_USER - Request received for user:', req.user);
            
            const userId = req.user?.userId;
            
            if (!userId) {
                console.error('❌ GET_USER - User ID is undefined! Full user object:', req.user);
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

            const userRole = req.user?.role || 'student';

            console.log('🔍 GET_USER - Query params:', { userId, userRole, page, limit });

            // Find messages where user is recipient and not deleted
            const query = {
                $and: [
                    {
                        $or: [
                            { recipients: 'all' },
                            { recipients: { $in: ['all'] } },
                            { 'recipients.0': 'all' },
                            { recipients: userRole },
                            { recipients: { $in: [userRole] } },
                            { 'recipients.0': userRole },
                            { recipients: userId.toString() },
                            { recipients: { $in: [userId.toString()] } },
                            { 'recipients.0': userId.toString() }
                        ]
                    },
                    { 'deletedFor.userId': { $ne: userId } }
                ]
            };

            console.log('🔍 GET_USER - MongoDB query:', JSON.stringify(query, null, 2));

            // Get total count
            const total = await ImportantInfo.countDocuments(query);
            console.log('🔍 GET_USER - Total messages matching query:', total);

            // Get paginated data
            const importantInfo = await ImportantInfo.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean();

            console.log('🔍 GET_USER - Found', importantInfo.length, 'messages');
            if (importantInfo.length > 0) {
                console.log('🔍 GET_USER - First message recipients:', importantInfo[0].recipients);
            }

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
                message: 'Error fetching important information',
                error: error.message
            });
        }
    }

    // Get unread count for user
    static async getUnreadCount(req, res) {
        try {
            console.log('🔍 UNREAD_COUNT - Request received for user:', req.user);
            
            const userId = req.user?.userId;
            
            if (!userId) {
                console.warn('❌ UNREAD_COUNT - User ID is undefined');
                return res.json({
                    success: true,
                    count: 0
                });
            }

            const userRole = req.user?.role || 'student';

            const query = {
                $and: [
                    {
                        $or: [
                            { recipients: 'all' },
                            { recipients: { $in: ['all'] } },
                            { 'recipients.0': 'all' },
                            { recipients: userRole },
                            { recipients: { $in: [userRole] } },
                            { 'recipients.0': userRole },
                            { recipients: userId.toString() },
                            { recipients: { $in: [userId.toString()] } },
                            { 'recipients.0': userId.toString() }
                        ]
                    },
                    { 'deletedFor.userId': { $ne: userId } },
                    { 'readBy.userId': { $ne: userId } }
                ]
            };

            console.log('🔍 UNREAD_COUNT - Query:', JSON.stringify(query, null, 2));
            
            const unreadCount = await ImportantInfo.countDocuments(query);
            console.log('🔍 UNREAD_COUNT - Result:', unreadCount);

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

    // Mark message as read
    static async markAsRead(req, res) {
        try {
            const { messageId } = req.params;
            const userId = req.user?.userId;
            
            if (!userId) {
                console.error('❌ MARK_READ - User ID is undefined');
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

    // Delete message for user (soft delete)
    static async deleteForUser(req, res) {
        try {
            const { messageId } = req.params;
            const userId = req.user?.userId;
            
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
            const message = await ImportantInfo.findById(messageId);
            
            if (!message) {
                return res.status(404).json({
                    success: false,
                    message: 'Message not found'
                });
            }

            // Delete files from Cloudinary if they exist
            if (message.attachments && message.attachments.length > 0) {
                for (const attachment of message.attachments) {
                    if (attachment.cloudinaryId) {
                        try {
                            await cloudinary.uploader.destroy(attachment.cloudinaryId);
                            console.log('✅ CLOUDINARY - Deleted file:', attachment.cloudinaryId);
                        } catch (cloudinaryError) {
                            console.error('❌ CLOUDINARY - Error deleting file:', cloudinaryError.message);
                        }
                    }
                }
            }

            // Delete message from database
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

    // ✅ FIX: Make getFileType a static method
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

// Export the class normally
module.exports = ImportantInfoController;