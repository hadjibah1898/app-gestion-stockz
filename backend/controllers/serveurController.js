/**
 * @file serveurController.js
 * @description Contrôleur spécifique au rôle Serveur.
 */

const User = require('../models/User');
const Vente = require('../models/Vente');
const mongoose = require('mongoose');

const asyncHandler = require('../middleware/asyncHandler');
/**
 * @desc    Obtenir les statistiques personnelles du serveur (Dashboard Waiter)
 * @route   GET /api/serveurs/stats/me
 */
exports.getServeurDashboardStats = asyncHandler(async (req, res) => {
        const userId = req.user.id;
        // Trouver la session de caisse active pour la boutique du serveur
        const OuvertureCaisse = mongoose.model('OuvertureCaisse');
        const sessionActive = await OuvertureCaisse.findOne({ 
            boutique: req.user.boutique, 
            statut: 'OUVERTE' 
        });

        if (!sessionActive) {
            return res.status(200).json({
                totalVentes: 0, totalPourboires: 0, nombreTickets: 0,
                commandesEnAttente: 0, commandesPretes: 0, message: "Caisse fermée"
            });
        }

        // On filtre les ventes UNIQUEMENT pour la session de caisse actuelle
        const stats = await Vente.aggregate([
            { 
                $match: { 
                    gerant: new mongoose.Types.ObjectId(userId),
                    ouvertureCaisse: sessionActive._id,
                    isCancelled: false
                } 
            },
            {
                $group: {
                    _id: null,
                    totalVentes: { 
                        $sum: { $cond: [{ $eq: ["$statut", "finalisee"] }, "$prixTotal", 0] } 
                    },
                    totalPourboires: { 
                        $sum: { $cond: [{ $eq: ["$statut", "finalisee"] }, "$pourboire", 0] } 
                    },
                    nombreTickets: { 
                        $sum: { $cond: [{ $eq: ["$statut", "finalisee"] }, 1, 0] } 
                    },
                    commandesEnAttente: { 
                        $sum: { $cond: [{ $eq: ["$statut", "commande"] }, 1, 0] } 
                    },
                    commandesPretes: { 
                        $sum: { $cond: [{ $eq: ["$statut", "en_preparation"] }, 1, 0] } 
                    }
                }
            }
        ]);

        const result = stats[0] || {
            totalVentes: 0,
            totalPourboires: 0,
            nombreTickets: 0,
            commandesEnAttente: 0,
            commandesPretes: 0
        };

        res.status(200).json(result); 
});

/**
 * @desc    Lister l'équipe de serveurs pour un gérant
 * @route   GET /api/serveurs/equipe
 */
exports.getMaTeam = asyncHandler(async (req, res) => {
        const boutiqueId = req.user.boutique;
        const serveurs = await User.find({ boutique: boutiqueId, role: 'Serveur' }).select('-password').lean();
        res.status(200).json(serveurs); 
});