/**
 * @file mouvementsRoute.js
 * @description Routes de consultation et annulation des mouvements de stock.
 */

const express = require('express');
const router = express.Router();
const mouvementController = require('../controllers/mouvementController'); // Déclaration déplacée en haut
const { protect, authorize } = require('../middleware/authMiddleware');
const { validatePerte } = require('../middleware/mouvementValidators'); // Import du nouveau middleware
const validateObjectId = require('../middleware/validateObjectId');

// Autorise l'Admin, AdminBar, Gérant et GérantBar à consulter les mouvements
router.get('/', protect, authorize('Admin', 'AdminBar', 'Gérant', 'GérantBar'), mouvementController.getAllMouvements);

// Routes FIXES (statiques) AVANT les routes paramétrées
router.post('/perte', protect, authorize('Admin', 'AdminBar', 'Gérant', 'GérantBar'), validatePerte, mouvementController.declarerPerte);

// Routes PARAMÉTRÉES
router.post('/:id/cancel', protect, authorize('Admin', 'AdminBar', 'Gérant', 'GérantBar'), validateObjectId('id'), mouvementController.cancelMouvement);
router.post('/:id/receive', protect, authorize('Admin', 'AdminBar', 'Gérant', 'GérantBar'), validateObjectId('id'), mouvementController.confirmerReception);

module.exports = router;