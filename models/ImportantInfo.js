// travel-tour-important-info-backend/models/ImportantInfo.js

const mongoose = require('mongoose');

const importantInfoSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    message: {
        type: String,
        required: true
    },
    attachments: [{
        filename: String,
        originalname: String,
        path: String,
        url: String,
        fileType: {
            type: String,
            enum: ['pdf', 'image', 'document']
        },
        size: Number
    }],
    sender: {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        name: String,
        email: String,
        role: String
    },
    isUrgent: {
        type: Boolean,
        default: false
    },
    recipients: {
        type: [String], // Can be 'all', 'students', 'admins', or specific user IDs
        default: ['all']
    },
    readBy: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        readAt: {
            type: Date,
            default: Date.now
        }
    }],
    deletedFor: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        deletedAt: {
            type: Date,
            default: Date.now
        }
    }],
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Indexes for better query performance
importantInfoSchema.index({ createdAt: -1 });
importantInfoSchema.index({ sender: 1, createdAt: -1 });
importantInfoSchema.index({ recipients: 1, createdAt: -1 });

module.exports = mongoose.model('ImportantInfo', importantInfoSchema);