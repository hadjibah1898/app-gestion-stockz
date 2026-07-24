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

// Autorise l'Admin et le Gérant à consulter les mouvements (le contrôleur filtrera par boutique)
router.get('/', protect, authorize('Admin', 'Gérant'), mouvementController.getAllMouvements);
router.post('/:id/cancel', protect, authorize('Admin'), validateObjectId('id'), mouvementController.cancelMouvement);

// Route pour déclarer une perte/casse manuelle
router.post('/perte', protect, authorize('Admin', 'Gérant'), validatePerte, mouvementController.declarerPerte);

router.post('/:id/receive', protect, authorize('Admin', 'Gérant'), validateObjectId('id'), mouvementController.confirmerReception);

module.exports = router;