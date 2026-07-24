/**
 * @file venteRoutes.js
 * @description Routes de création et gestion des ventes (historique, annulation, statut de groupe).
 */

const express = require('express');
const router = express.Router();
const venteController = require('../controllers/venteController');
const { protect, authorize } = require('../middleware/authMiddleware');
const injectCodeBoutique = require('../middleware/injectCodeBoutique'); // Import du nouveau middleware
const validateObjectId = require('../middleware/validateObjectId');

/**
 * ROUTES DES VENTES
 */

// Route pour lister les ventes (utilisée par le Dashboard et l'Historique)
router.get('/historique', protect, authorize('Admin', 'Gérant', 'Serveur', 'Caissier'), injectCodeBoutique, venteController.getHistorique);

// Route pour effectuer une vente ou prendre une commande
router.post('/', protect, authorize('Gérant', 'Serveur', 'Caissier'), injectCodeBoutique, venteController.createVente);

// Route for updating group status
// This route is called by VentesView.js when a Gérant updates the status of a group of sales (e.g., finalizes a table)
router.patch('/group/:orderGroupId/status', protect, authorize('Admin', 'Gérant', 'Serveur', 'Caissier'), injectCodeBoutique, venteController.updateGroupStatus);

// Route pour annuler une ligne de vente spécifique (utilisée par le bouton trash dans HistoryTab)
router.post('/:id/cancel', protect, authorize('Admin', 'Gérant', 'Serveur', 'Caissier'), injectCodeBoutique, validateObjectId('id'), venteController.cancelVente);

module.exports = router;