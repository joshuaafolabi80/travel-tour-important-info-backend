// travel-tour-important-info-backend/routes/importantInfoRoutes.js
const express = require('express');
const router = express.Router();
const ImportantInfoController = require('../controllers/importantInfoController');
const NotificationController = require('../controllers/notificationController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

// ✅ DEBUG ROUTE - Add this first
router.get('/debug/user-info', 
    authMiddleware,
    (req, res) => {
        console.log('🔍 DEBUG - User info received:', {
            userId: req.user?.userId,
            role: req.user?.role,
            email: req.user?.email,
            name: req.user?.name,
            fullUser: req.user
        });
        
        // Check JWT token
        const token = req.header('Authorization')?.replace('Bearer ', '');
        console.log('🔍 DEBUG - Token present:', !!token);
        
        res.json({
            success: true,
            user: {
                userId: req.user?.userId,
                role: req.user?.role,
                email: req.user?.email,
                name: req.user?.name
            },
            timestamp: new Date().toISOString()
        });
    }
);

// Admin routes
router.post('/create', 
    authMiddleware, 
    adminMiddleware, 
    upload.array('attachments', 5),
    ImportantInfoController.createImportantInfo
);

router.get('/admin/all', 
    authMiddleware, 
    adminMiddleware,
    ImportantInfoController.getAllImportantInfo
);

router.delete('/admin/:messageId', 
    authMiddleware, 
    adminMiddleware,
    ImportantInfoController.deletePermanently
);

// ✅ DEBUG ROUTE - Test user access
router.get('/debug/test-user-access',
    authMiddleware,
    async (req, res) => {
        try {
            const userId = req.user?.userId;
            const userRole = req.user?.role || 'student';
            
            console.log('🔍 DEBUG - Testing user access:', { userId, userRole });
            
            // Test the exact query that getUserImportantInfo uses
            const ImportantInfo = require('../models/ImportantInfo');
            
            const query = {
                $and: [
                    {
                        $or: [
                            { recipients: 'all' },
                            { recipients: userRole },
                            { recipients: userId?.toString() || 'invalid-user-id' }
                        ]
                    },
                    { 'deletedFor.userId': { $ne: userId } }
                ]
            };
            
            console.log('🔍 DEBUG - Query being used:', JSON.stringify(query, null, 2));
            
            // Count total messages in database
            const totalMessages = await ImportantInfo.countDocuments({});
            
            // Count messages that should be visible to this user
            const userVisibleMessages = await ImportantInfo.countDocuments(query);
            
            // Get a sample of messages
            const sampleMessages = await ImportantInfo.find({})
                .limit(3)
                .select('title recipients createdAt')
                .lean();
            
            res.json({
                success: true,
                debug: {
                    userId,
                    userRole,
                    queryUsed: query,
                    totalMessagesInDatabase: totalMessages,
                    messagesVisibleToUser: userVisibleMessages,
                    sampleMessages: sampleMessages.map(msg => ({
                        title: msg.title,
                        recipients: msg.recipients,
                        createdAt: msg.createdAt
                    }))
                },
                message: userId ? 
                    `User ${userId} (${userRole}) can see ${userVisibleMessages} out of ${totalMessages} messages` :
                    'User ID is undefined! Check authentication.'
            });
        } catch (error) {
            console.error('🔍 DEBUG - Error testing user access:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                stack: error.stack
            });
        }
    }
);

// User routes
router.get('/user/all', 
    authMiddleware,
    ImportantInfoController.getUserImportantInfo
);

router.put('/read/:messageId', 
    authMiddleware,
    ImportantInfoController.markAsRead
);

router.get('/unread-count', 
    authMiddleware,
    ImportantInfoController.getUnreadCount
);

router.delete('/user/:messageId', 
    authMiddleware,
    ImportantInfoController.deleteForUser
);

// Notification routes
router.get('/notifications', 
    authMiddleware,
    NotificationController.getUserNotifications
);

router.put('/notifications/mark-all-read', 
    authMiddleware,
    NotificationController.markAllAsRead
);

router.delete('/notifications/clear-all', 
    authMiddleware,
    NotificationController.clearAllNotifications
);

// ✅ DEBUG ROUTE - Check all messages in database
router.get('/debug/all-messages',
    authMiddleware,
    adminMiddleware,
    async (req, res) => {
        try {
            const ImportantInfo = require('../models/ImportantInfo');
            
            const allMessages = await ImportantInfo.find({})
                .select('title recipients sender isUrgent createdAt readBy')
                .lean();
            
            res.json({
                success: true,
                totalCount: allMessages.length,
                messages: allMessages.map(msg => ({
                    id: msg._id,
                    title: msg.title,
                    recipients: msg.recipients,
                    sender: msg.sender,
                    isUrgent: msg.isUrgent,
                    createdAt: msg.createdAt,
                    readCount: msg.readBy?.length || 0
                }))
            });
        } catch (error) {
            console.error('DEBUG - Error fetching all messages:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

// ✅ DEBUG: Test JWT token
router.get('/debug/jwt-test',
    authMiddleware,
    (req, res) => {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        console.log('🔍 JWT DEBUG - Raw token (first 50 chars):', token?.substring(0, 50) + '...');
        console.log('🔍 JWT DEBUG - Full user object from auth middleware:', req.user);
        
        res.json({
            success: true,
            tokenInfo: {
                hasToken: !!token,
                tokenLength: token?.length,
                userFromMiddleware: req.user,
                headersReceived: {
                    authorization: !!req.header('Authorization'),
                    contentType: req.header('Content-Type'),
                    origin: req.header('Origin')
                }
            },
            message: 'JWT test completed'
        });
    }
);

// ✅ DEBUG: Check current user authentication
router.get('/debug/check-auth',
    authMiddleware,
    (req, res) => {
        console.log('🔍 CHECK_AUTH - User authenticated:', req.user);
        
        res.json({
            success: true,
            authenticated: true,
            user: req.user,
            timestamp: new Date().toISOString(),
            message: req.user.userId ? 
                `User ${req.user.userId} (${req.user.email}) is authenticated` :
                'User authenticated but missing userId!'
        });
    }
);

// ✅ DEBUG: Direct database query test
router.get('/debug/test-query',
    authMiddleware,
    async (req, res) => {
        try {
            const userId = req.user?.userId;
            const userRole = req.user?.role || 'student';
            
            console.log('🔍 TEST_QUERY - User:', { userId, userRole });
            
            // Test 1: Count all messages
            const totalMessages = await ImportantInfo.countDocuments({});
            
            // Test 2: Check what recipients look like in existing messages
            const sampleMessages = await ImportantInfo.find({})
                .limit(3)
                .select('title recipients createdAt')
                .lean();
            
            // Test 3: Test the exact query
            const query = {
                $and: [
                    {
                        $or: [
                            { recipients: 'all' },
                            { recipients: userRole },
                            { recipients: userId?.toString() }
                        ]
                    },
                    { 'deletedFor.userId': { $ne: userId } }
                ]
            };
            
            const matchingMessages = await ImportantInfo.countDocuments(query);
            
            res.json({
                success: true,
                debug: {
                    userId,
                    userRole,
                    totalMessagesInDB: totalMessages,
                    sampleMessages: sampleMessages.map(msg => ({
                        title: msg.title,
                        recipients: msg.recipients,
                        recipientsType: typeof msg.recipients,
                        recipientsLength: msg.recipients?.length,
                        createdAt: msg.createdAt
                    })),
                    queryUsed: query,
                    messagesMatchingQuery: matchingMessages
                },
                message: `User ${userId || 'undefined'} can see ${matchingMessages} out of ${totalMessages} messages`
            });
        } catch (error) {
            console.error('❌ TEST_QUERY - Error:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                stack: error.stack
            });
        }
    }
);

module.exports = router;