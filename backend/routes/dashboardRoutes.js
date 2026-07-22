/**
 * @file dashboardRoutes.js
 * @description Route API pour les statistiques du tableau de bord global.
 */

const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Route principale pour récupérer toutes les stats du dashboard central (Admin uniquement)
router.get('/stats', protect, authorize('Admin', 'Gérant', 'Serveur', 'Caissier','AdminBar', 'GérantBar', 'ServeurBar', 'CaissierBar'), dashboardController.getDashboardStats);

module.exports = router;