const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware pour vérifier si l'utilisateur est connecté (token valide)
exports.protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Récupère le token de l'en-tête 'Bearer <token>'
            token = req.headers.authorization.split(' ')[1];

            // Vérifie et décode le token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Ajoute l'utilisateur (sans le mot de passe) à l'objet de requête
            req.user = await User.findById(decoded.id).select('-password');
            next();
        } catch (error) {
            return res.status(401).json({ message: 'Non autorisé, le token a échoué.' });
        }
    }

    if (!token) {
        return res.status(401).json({ message: 'Non autorisé, aucun token fourni.' });
    }
};

// Middleware pour autoriser certains rôles (ex: 'Admin')
exports.authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: `Accès refusé. Rôle requis : ${roles.join(' ou ')}.` });
        }
        next();
    };
};