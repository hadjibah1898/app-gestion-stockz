const errorHandler = (err, req, res, next) => {
    // On définit le status code : 500 par défaut, ou celui déjà défini
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    
    // Log de l'erreur pour les développeurs en cas d'erreur serveur
    if (statusCode === 500) {
        console.error(`[ERREUR SERVEUR] ${req.method} ${req.url} :`, err.message);
    }

    res.status(statusCode).json({
        message: err.message,
        // On n'affiche la pile d'erreur (stack) qu'en mode développement
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
};

module.exports = errorHandler;