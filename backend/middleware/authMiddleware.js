/**
 * @file authMiddleware.js
 * @description Middleware d'authentification JWT et d'autorisation par rôle.
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware pour vérifier si l'utilisateur est connecté (token valide)
exports.protect = async (req, res, next) => {
    let token;

    // 1. Extraction et validation immédiate de la présence du token
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    }

    // Si aucun token n'est extrait, on bloque direct (évite d'entrer dans un try/catch inutile)
    if (!token) {
        return res.status(401).json({ 
            message: 'Non autorisé, aucun token fourni.', 
            redirect: '/login' 
        });
    }

    try {
        // Vérifie et décode le token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Récupère l'utilisateur (sans le mot de passe)
        req.user = await User.findById(decoded.id).select('-password');

        // SÉCURITÉ A : Vérifier si l'utilisateur existe toujours en base de données
        if (!req.user) {
            return res.status(401).json({ 
                message: 'Utilisateur introuvable ou compte supprimé.', 
                redirect: '/login' 
            });
        }
        
        // SÉCURITÉ B : Vérifier si le compte est actif et non supprimé logiquement
        if (!req.user.active || req.user.deleted) {
            return res.status(401).json({ 
                message: 'Votre compte a été suspendu. Veuillez contacter l\'administrateur.', 
                redirect: '/login' 
            });
        }
        
        // SÉCURITÉ C : Les rôles ayant besoin d'une boutique (Marchand et Bar confondus)
        const rolesBoutiqueRequis = ['Gérant', 'Caissier', 'GérantBar', 'ServeurBar'];
        if (rolesBoutiqueRequis.includes(req.user.role) && !req.user.boutique) {
            console.warn(`[SECURITY WARN] ${req.user.role} bloqué (ID: ${req.user.id}) : Pas de boutique assignée.`);
            return res.status(403).json({ 
                message: `Accès refusé : Votre compte ${req.user.role.toLowerCase()} n'est pas rattaché à une boutique.`, 
                redirect: '/login' 
            });
        }

        // OPTIMISATION SÉCURITÉ & PERFORMANCE : 
        // Injecte un flag pour savoir si l'utilisateur contourne les WebSockets.
        req.skipSocket = ['Admin', 'SuperAdmin'].includes(req.user.role);

        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                message: 'Votre session a expiré. Veuillez vous reconnecter.', 
                redirect: '/login' 
            });
        }
        return res.status(401).json({ 
            message: 'Session invalide ou corrompue.', 
            redirect: '/login' 
        });
    }
};

// Middleware pour autoriser certains rôles spécifiques (ex: 'Admin', 'SuperAdmin')
exports.authorize = (...roles) => {
    return (req, res, next) => {
        // SÉCURITÉ MAÎTRE : Le SuperAdmin passe absolument toutes les barrières de rôles
        if (req.user && req.user.role === 'SuperAdmin') {
            return next();
        }

        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ 
                message: `Accès refusé. Rôle requis : ${roles.join(' ou ')}.` 
            });
        }
        next();
    };
};