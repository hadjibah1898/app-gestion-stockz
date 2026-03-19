const express = require('express');
const router = express.Router();
const venteController = require('../controllers/venteController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { checkCaisseOuverte } = require('../middleware/caisseMiddleware');
const { validateVente } = require('../middleware/validators');

// Routes
router.post('/', protect, authorize('Gérant'), checkCaisseOuverte, validateVente, venteController.effectuerVente); // Seul un gérant avec une caisse ouverte peut vendre
router.get('/historique', protect, venteController.getHistorique);
router.get('/logs', protect, authorize('Admin'), venteController.getLogs);

router.post('/:id/cancel', protect, venteController.annulerVente);

module.exports = router;