const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    userName: { // Denormalized for easier display
        type: String,
        required: true
    },
    action: {
        type: String,
        required: true,
        // Example values: 'LOGIN_SUCCESS', 'LOGIN_FAILURE', 'CREATE_USER', 'UPDATE_BOUTIQUE', 'CANCEL_SALE', etc.
    },
    entity: { // The model name that was affected
        type: String,
        required: true,
    },
    entityId: { // The ID of the document that was affected
        type: mongoose.Schema.Types.ObjectId,
    },
    details: { // Can store before/after states or any other relevant info
        type: mongoose.Schema.Types.Mixed,
    },
    status: {
        type: String,
        enum: ['SUCCESS', 'FAILURE'],
        required: true,
    },
    errorMessage: {
        type: String,
    },
    ipAddress: {
        type: String,
    }
}, { timestamps: true });

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ user: 1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ entity: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);