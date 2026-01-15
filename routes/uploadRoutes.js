// travel-tour-important-info-backend/routes/uploadRoutes.js

const express = require('express');
const router = express.Router();
const { upload } = require('../middleware/upload');
const { authMiddleware } = require('../middleware/auth');

// Upload endpoint (protected)
router.post('/', authMiddleware, upload.array('files', 5), (req, res) => {
    try {
        const files = req.files;
        
        if (!files || files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No files uploaded'
            });
        }

        // Process uploaded files
        const uploadedFiles = files.map(file => ({
            filename: file.filename,
            originalname: file.originalname,
            path: file.path,
            url: `${req.protocol}://${req.get('host')}/${file.path}`,
            mimetype: file.mimetype,
            size: file.size
        }));

        res.json({
            success: true,
            message: 'Files uploaded successfully',
            files: uploadedFiles
        });
    } catch (error) {
        console.error('Error uploading files:', error);
        res.status(500).json({
            success: false,
            message: 'Error uploading files',
            error: error.message
        });
    }
});

module.exports = router;