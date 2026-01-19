// travel-tour-important-info-backend/middleware/auth.js

const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ 
            success: false, 
            message: 'No token, authorization denied' 
        });
    }

    try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // ✅ ADDED: Debug logging
        console.log('🔍 AUTH DEBUG - Decoded JWT:', JSON.stringify(decoded, null, 2));
        
        // ✅ FIXED: Map all possible ID fields to userId
        req.user = {
            // Check all possible ID field names
            userId: decoded.userId || decoded.id || decoded._id || decoded.user_id,
            email: decoded.email,
            role: decoded.role || 'student',
            name: decoded.name || decoded.username || 'User'
        };
        
        // ✅ ADDED: Validate we have a userId
        if (!req.user.userId) {
            console.error('❌ AUTH ERROR: No user ID found in token', decoded);
            return res.status(401).json({ 
                success: false, 
                message: 'Token missing user ID' 
            });
        }
        
        console.log('✅ AUTH SUCCESS - User:', req.user);
        
        next();
    } catch (error) {
        console.error('❌ AUTH ERROR:', error.message);
        return res.status(401).json({ 
            success: false, 
            message: 'Token is not valid' 
        });
    }
};

const adminMiddleware = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ 
            success: false, 
            message: 'Access denied. Admin only.' 
        });
    }
    next();
};

module.exports = { authMiddleware, adminMiddleware };