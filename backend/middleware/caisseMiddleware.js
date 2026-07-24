/**
 * @file caisseMiddleware.js
 * @description Middleware de vérification de l'état d'ouverture de la caisse.
 */

const mongoose = require('mongoose');
const OuvertureCaisse = require('../models/OuvertureCaisse');
const RapportCaisse = require('../models/RapportCaisse');
const asyncHandler = require('./asyncHandler'); // Importation de ton wrapper global

/**
 * @desc    Middleware de sécurité : Bloque l'action si aucune caisse n'est ouverte pour la boutique.
 * Gérant : Doit avoir ouvert sa propre caisse (responsabilité financière).
 * Serveur : Aligné dynamiquement sur la caisse ouverte de sa boutique.
 * @route   Usage sur les routes de Ventes, Dépenses, Recouvrements.
 */
const checkCaisseOuverte = asyncHandler(async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ 
            success: false, 
            message: "Utilisateur non authentifié." 
        });
    }

    const userId = req.user.id || req.user._id;
    const boutiqueId = req.user.boutique;

    // Vérification de l'existence d'une boutique rattachée
    if (!boutiqueId) {
        return res.status(403).json({ 
            success: false,
            message: "Accès refusé : Votre compte n'est rattaché à aucune boutique." 
        });
    }

    // Pipeline de base pour la recherche de session ouverte
    const query = {
        boutique: boutiqueId,
        statut: 'OUVERTE' 
    };

    // SÉCURITÉ SÉPARÉE selon le rôle :
    // - Gérant : sa propre caisse (type GERANT)
    // - Caissier : sa propre caisse (type CAISSIER)
    // - Serveur : la caisse du gérant de la boutique (type GERANT)
    if (req.user.role === 'Gérant') {
        query.gerant = userId;
        query.type = 'GERANT';
    } else if (req.user.role === 'Caissier') {
        query.gerant = userId;
        query.type = 'CAISSIER';
    } else {
        // Serveur : caisse du gérant de la boutique
        query.type = 'GERANT';
    }

    // Récupération de la session avec .lean() pour de meilleures performances (lecture seule)
    const ouverture = await OuvertureCaisse.findOne(query).lean();

    if (!ouverture) {
        const errorMsg = req.user.role === 'Serveur' 
            ? "Opération impossible : La caisse de la boutique n'est pas encore ouverte. Demandez au gérant de l'ouvrir."
            : "Opération impossible : Vous devez d'abord ouvrir votre caisse pour la journée.";
            
        return res.status(403).json({ 
            success: false,
            message: errorMsg
        });
    }

    // Injection de la session de caisse active dans l'objet request
    req.ouvertureCaisse = ouverture;
    next();
});

/**
 * @desc    Middleware de contrôle de flux : Empêche l'ouverture d'une nouvelle session 
 * si le rapport financier de la session précédente est encore en attente de validation.
 * @route   Usage strict sur la route POST d'ouverture de caisse.
 */
const checkAucunRapportEnAttente = asyncHandler(async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ 
            success: false, 
            message: "Utilisateur non authentifié." 
        });
    }

    const userId = req.user.id || req.user._id;

    // Recherche d'un rapport bloqué à l'état 'EN_ATTENTE' pour ce gérant
    const rapportEnAttente = await RapportCaisse.findOne({
        gerant: userId,
        statut: 'EN_ATTENTE'
    }).lean();

    if (rapportEnAttente) {
        return res.status(403).json({ 
            success: false,
            message: "Action bloquée : Votre rapport de caisse précédent doit être validé par l'administration avant d'ouvrir une nouvelle session." 
        });
    }

    next();
});

module.exports = {
    checkCaisseOuverte,
    checkAucunRapportEnAttente
};