const express = require('express');
const router = express.Router();
const venteController = require('../controllers/venteController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { checkCaisseOuverte } = require('../middleware/caisseMiddleware');
const { validateVente } = require('../middleware/validators');
const validateObjectId = require('../middleware/validateObjectId');

// Routes
router.post('/', protect, authorize('Gérant', 'Serveur'), checkCaisseOuverte, validateVente, venteController.effectuerVente); 
router.get('/historique', protect, venteController.getHistorique);
router.get('/logs', protect, authorize('Admin', 'SuperAdmin'), venteController.getLogs);

router.post('/:id/cancel', protect, validateObjectId('id'), venteController.annulerVente);
router.patch('/group/:orderGroupId/status', protect, authorize('Gérant', 'Serveur'), venteController.updateGroupStatus); 
router.patch('/:id/status', protect, authorize('Gérant', 'Serveur'), validateObjectId('id'), venteController.updateStatus);

// Route de configuration (Admin seulement)
router.patch('/settings/tips', protect, authorize('Admin', 'SuperAdmin'), venteController.updateTipPercentage);

module.exports = router;