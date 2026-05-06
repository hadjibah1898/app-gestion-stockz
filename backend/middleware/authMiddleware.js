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

            // 1. SÉCURITÉ : Vérifier si l'utilisateur existe toujours
            if (!req.user) {
                return res.status(401).json({ message: 'Utilisateur introuvable ou compte supprimé.', redirect: '/login' });
            }
            
            // 2. SÉCURITÉ : Vérifier si le compte est actif
            if (!req.user.active || req.user.deleted) {
                return res.status(401).json({ message: 'Votre compte a été suspendu. Veuillez contacter l\'administrateur.', redirect: '/login' });
            }
            
            // 3. SÉCURITÉ CRITIQUE : Un Gérant ou un Serveur doit être rattaché à une boutique
            // Le SuperAdmin et l'Admin principal ne sont pas soumis à cette restriction
            if (['Gérant', 'Serveur'].includes(req.user.role) && !req.user.boutique && req.user.role !== 'SuperAdmin') {
                console.warn(`${req.user.role} bloqué (ID: ${req.user.id}) : Pas de boutique assignée.`);
                return res.status(403).json({ message: `Accès refusé : Votre compte ${req.user.role.toLowerCase()} n'est pas rattaché à une boutique.`, redirect: '/login' });
            }
            next();
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({ message: 'Votre session a expiré. Veuillez vous reconnecter.', redirect: '/login' });
            }
            return res.status(401).json({ message: 'Session invalide ou corrompue.', redirect: '/login' });
        }
    }

    if (!token) {
        return res.status(401).json({ message: 'Non autorisé, aucun token fourni.', redirect: '/login' });
    }
};

// Middleware pour autoriser certains rôles (ex: 'Admin')
exports.authorize = (...roles) => {
    return (req, res, next) => {
        // SÉCURITÉ : Le SuperAdmin a un accès illimité et bypass toutes les restrictions de rôle
        if (req.user && req.user.role === 'SuperAdmin') {
            return next();
        }

        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: `Accès refusé. Rôle requis : ${roles.join(' ou ')}.` });
        }
        next();
    };
};