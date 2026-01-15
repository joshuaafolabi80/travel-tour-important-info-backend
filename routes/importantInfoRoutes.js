// travel-tour-important-info-backend/routes/importantInfoRoutes.js

const express = require('express');
const router = express.Router();
const ImportantInfoController = require('../controllers/importantInfoController');
const NotificationController = require('../controllers/notificationController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

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

module.exports = router;