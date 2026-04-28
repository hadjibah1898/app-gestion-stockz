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

            // SÉCURITÉ : Vérifier si l'utilisateur existe toujours
            if (!req.user) {
                return res.status(401).json({ message: 'Utilisateur introuvable ou compte supprimé.', redirect: '/login' });
            }
            
            // SÉCURITÉ CRITIQUE : Un Gérant ou un Serveur doit être rattaché à une boutique
            if (['Gérant', 'Serveur'].includes(req.user.role) && !req.user.boutique) {
                console.warn(`${req.user.role} bloqué (ID: ${req.user.id}) : Pas de boutique assignée.`);
                return res.status(403).json({ message: `Accès refusé : Votre compte ${req.user.role.toLowerCase()} n'est pas rattaché à une boutique.`, redirect: '/login' });
            }
            next();
        } catch (error) {
            return res.status(401).json({ message: 'Non autorisé, le token a échoué.', redirect: '/login' });
        }
    }

    if (!token) {
        return res.status(401).json({ message: 'Non autorisé, aucun token fourni.', redirect: '/login' });
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