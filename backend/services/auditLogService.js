const AuditLog = require('../models/AuditLog');

/**
 * Logs a critical user action.
 * @param {object} options - The log options.
 * @param {object} options.req - The Express request object to get IP.
 * @param {object} options.user - The user object performing the action.
 * @param {string} options.action - A descriptive action key (e.g., 'CREATE_BOUTIQUE').
 * @param {string} options.entity - The name of the Mongoose model being affected (e.g., 'Boutique').
 * @param {mongoose.Types.ObjectId} [options.entityId] - The ID of the document being affected.
 * @param {object} [options.details] - Additional details (e.g., { before: {}, after: {} }).
 * @param {'SUCCESS'|'FAILURE'} options.status - The status of the action.
 * @param {string} [options.errorMessage] - The error message if the action failed.
 */
const logAction = async ({ req, user, action, entity, entityId, details, status, errorMessage }) => {
    try {
        if (!user || !user._id) {
            console.warn('[AuditLog] Attempted to log an action without a valid user.');
            return;
        }

        await AuditLog.create({
            user: user._id,
            userName: user.nom,
            action,
            entity,
            entityId,
            details,
            status,
            errorMessage,
            ipAddress: req.ip || req.connection?.remoteAddress,
        });
    } catch (error) {
        console.error('CRITICAL: Failed to write to audit log.', error);
    }
};

module.exports = { logAction };