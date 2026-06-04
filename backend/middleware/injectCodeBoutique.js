const injectCodeBoutique = (req, res, next) => {
    // Le middleware 'protect' doit avoir déjà peuplé req.user
    if (req.user) {
        // Si l'utilisateur a une boutique assignée, on injecte son codeBoutique
        if (req.user.boutique && req.user.boutique.codeBoutique) {
            req.codeBoutique = req.user.boutique.codeBoutique;
        } else if (req.user.codeBoutique) { // Fallback si la boutique n'est pas peuplée mais le code est sur l'user
            req.codeBoutique = req.user.codeBoutique;
        }
    }
    next();
};

module.exports = injectCodeBoutique;