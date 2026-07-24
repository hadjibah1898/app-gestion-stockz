/**
 * @file serveurRoutes.js
 * @description Routes spécifiques au rôle Serveur.
 */

const express = require('express');
const router = express.Router();
const serveurController = require('../controllers/serveurController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect); // Toutes les routes sont protégées

// Route pour les stats personnelles du serveur
router.get('/stats/me', authorize('Serveur'), serveurController.getServeurDashboardStats);

// Route pour que le gérant voie ses serveurs
router.get('/equipe', authorize('Gérant', 'Admin'), serveurController.getMaTeam);

module.exports = router;

