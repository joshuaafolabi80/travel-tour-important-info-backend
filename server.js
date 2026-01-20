// travel-tour-important-info-backend/server.js - UPDATED WITH IMPROVED STATIC FILE SERVING
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config();

// Create upload directories if they don't exist
const uploadDirs = ['./uploads/pdf', './uploads/images', './uploads/documents'];
uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Import routes
const importantInfoRoutes = require('./routes/importantInfoRoutes');
const uploadRoutes = require('./routes/uploadRoutes');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// ✅ FIXED: Enhanced CORS configuration
app.use(cors({
    origin: [
        'https://the-conclave-academy.netlify.app',
        'http://localhost:3000',
        'http://localhost:5173'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Handle preflight requests
app.options('*', cors());

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ IMPROVED: Serve uploaded files statically with proper headers
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    maxAge: '1d', // Cache for 1 day
    setHeaders: (res, filePath) => {
        // Set appropriate content-type headers for different file types
        const ext = path.extname(filePath).toLowerCase();
        
        switch (ext) {
            case '.pdf':
                res.set('Content-Type', 'application/pdf');
                res.set('Content-Disposition', 'inline; filename="document.pdf"');
                break;
            case '.doc':
                res.set('Content-Type', 'application/msword');
                res.set('Content-Disposition', 'attachment');
                break;
            case '.docx':
                res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
                res.set('Content-Disposition', 'attachment');
                break;
            case '.jpg':
            case '.jpeg':
                res.set('Content-Type', 'image/jpeg');
                res.set('Content-Disposition', 'inline');
                break;
            case '.png':
                res.set('Content-Type', 'image/png');
                res.set('Content-Disposition', 'inline');
                break;
            case '.gif':
                res.set('Content-Type', 'image/gif');
                res.set('Content-Disposition', 'inline');
                break;
            default:
                res.set('Content-Type', 'application/octet-stream');
                res.set('Content-Disposition', 'attachment');
        }
        
        // Add security headers
        res.set('X-Content-Type-Options', 'nosniff');
        res.set('Cache-Control', 'public, max-age=86400'); // 24 hours cache
    }
}));

// ✅ ADDED: Health check middleware for debugging
app.use((req, res, next) => {
    console.log(`📥 ${req.method} ${req.url} - ${new Date().toISOString()}`);
    next();
});

// Routes
app.use('/api/important-info', importantInfoRoutes);
app.use('/api/upload', uploadRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        service: 'Important Information Server',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version
    });
});

// ✅ ADDED: Debug endpoint to check if files are accessible
app.get('/api/debug/files', (req, res) => {
    try {
        const files = {
            pdf: [],
            images: [],
            documents: []
        };
        
        // Check each upload directory
        ['pdf', 'images', 'documents'].forEach(folder => {
            const folderPath = path.join(__dirname, 'uploads', folder);
            if (fs.existsSync(folderPath)) {
                files[folder] = fs.readdirSync(folderPath);
            }
        });
        
        res.json({
            success: true,
            files: files,
            uploadsPath: path.join(__dirname, 'uploads'),
            exists: fs.existsSync(path.join(__dirname, 'uploads'))
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ✅ ADDED: Direct file access endpoint (fallback for Cloudinary issues)
app.get('/api/file/:folder/:filename', (req, res) => {
    try {
        const { folder, filename } = req.params;
        const validFolders = ['pdf', 'images', 'documents'];
        
        if (!validFolders.includes(folder)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid folder. Must be one of: pdf, images, documents'
            });
        }
        
        const filePath = path.join(__dirname, 'uploads', folder, filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'File not found',
                path: filePath
            });
        }
        
        // Determine content type
        const ext = path.extname(filename).toLowerCase();
        let contentType = 'application/octet-stream';
        
        switch (ext) {
            case '.pdf': contentType = 'application/pdf'; break;
            case '.doc': contentType = 'application/msword'; break;
            case '.docx': contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; break;
            case '.jpg': case '.jpeg': contentType = 'image/jpeg'; break;
            case '.png': contentType = 'image/png'; break;
            case '.gif': contentType = 'image/gif'; break;
        }
        
        res.set('Content-Type', contentType);
        res.set('Content-Disposition', `inline; filename="${filename}"`);
        res.sendFile(filePath);
        
    } catch (error) {
        console.error('Error serving file:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Socket.IO setup with CORS
const io = socketIO(server, {
    cors: {
        origin: [
            'https://the-conclave-academy.netlify.app',
            'http://localhost:3000',
            'http://localhost:5173'
        ],
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // Join user to their room
    socket.on('join-user', (userId) => {
        socket.join(`user-${userId}`);
        console.log(`User ${userId} joined their room`);
    });

    // Join admin to admin room
    socket.on('join-admin', (adminId) => {
        socket.join('admin-room');
        console.log(`Admin ${adminId} joined admin room`);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Make io available in routes
app.set('io', io);

// ✅ FIXED: Connect to correct MongoDB database
mongoose.connect(process.env.MONGODB_URI.replace('/travel_tour_important_info', '/travel_tour_academy'), {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => {
    console.log('✅ MongoDB connected to travel_tour_academy database');
    console.log('✅ Database collections:', mongoose.connection.collections);
})
.catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1); // Exit if MongoDB connection fails
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('🔥 Global error handler:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

const PORT = process.env.PORT || 5006;

server.listen(PORT, () => {
    console.log(`✅ Important Information Server running on port ${PORT}`);
    console.log(`✅ Health check: http://localhost:${PORT}/api/health`);
    console.log(`✅ File debug: http://localhost:${PORT}/api/debug/files`);
    console.log(`✅ Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Closing server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('🔥 UNCAUGHT EXCEPTION:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 UNHANDLED REJECTION at:', promise, 'reason:', reason);
});