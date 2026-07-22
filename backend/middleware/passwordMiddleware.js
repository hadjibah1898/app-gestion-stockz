/**
 * @file passwordMiddleware.js
 * @description Middleware de vérification du changement obligatoire de mot de passe.
 */

const { logAction } = require('../services/auditLogService');

/**
 * Middleware pour bloquer l'accès si l'utilisateur doit changer son mot de passe.
 */
exports.checkMustChangePassword = async (req, res, next) => {
    // Si l'utilisateur est authentifié et que le flag mustChangePassword est à true
    if (req.user && req.user.mustChangePassword) {
        // Journalisation de l'accès bloqué par mesure de sécurité
        await logAction({
            req,
            user: req.user,
            action: 'ACCESS_BLOCKED_PWD_CHANGE_REQUIRED',
            entity: 'User',
            entityId: req.user._id,
            status: 'FAILURE',
            errorMessage: "Accès refusé : changement de mot de passe obligatoire non effectué.",
            details: {
                path: req.originalUrl,
                method: req.method
            }
        });

        return res.status(403).json({
            success: false,
            message: "Accès refusé : Vous devez changer votre mot de passe par défaut avant de pouvoir effectuer cette opération.",
            mustChangePassword: true
        });
    }
    next();
};