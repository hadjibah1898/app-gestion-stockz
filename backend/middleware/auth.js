const jwt = require('jsonwebtoken');

// Middleware pour vérifier si l'utilisateur est connecté (Token valide)
exports.protect = (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ message: "Accès refusé, aucun jeton fourni." });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // On ajoute les infos de l'utilisateur (id et rôle) à la requête
        next();
    } catch (error) {
        res.status(401).json({ message: "Jeton invalide ou expiré." });
    }
};

// Middleware pour restreindre l'accès à certains rôles (Admin uniquement par ex)
exports.authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ 
                message: `Le rôle ${req.user.role} n'est pas autorisé à accéder à cette ressource.` 
            });
        }
        next();
    };
};