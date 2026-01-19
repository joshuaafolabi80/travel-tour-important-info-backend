// travel-tour-important-info-backend/server.js - UPDATED CORS SECTION
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

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/important-info', importantInfoRoutes);
app.use('/api/upload', uploadRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        service: 'Important Information Server',
        timestamp: new Date().toISOString()
    });
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
.then(() => console.log('MongoDB connected to travel_tour_academy database'))
.catch(err => console.error('MongoDB connection error:', err));

const PORT = process.env.PORT || 5006;

server.listen(PORT, () => {
    console.log(`Important Information Server running on port ${PORT}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Closing server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});