/**
 * Middleware pour supprimer le besoin de try-catch dans les contrôleurs.
 * Il résout les promesses et transmet les erreurs éventuelles au middleware next().
 */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
        // Log optionnel pour le monitoring
        console.error(`[API Error] ${req.method} ${req.originalUrl} :`, err.message);
        next(err);
    });
};

module.exports = asyncHandler;