const express = require('express');
const router = express.Router();
const mouvementController = require('../controllers/mouvementController');
const { protect, authorize } = require('../middleware/authMiddleware');
const validateObjectId = require('../middleware/validateObjectId');

// Autorise l'Admin et le Gérant à consulter les mouvements (le contrôleur filtrera par boutique)
router.get('/', protect, authorize('Admin', 'Gérant'), mouvementController.getAllMouvements);
router.post('/:id/cancel', protect, authorize('Admin'), validateObjectId('id'), mouvementController.cancelMouvement);

router.post('/:id/receive', protect, authorize('Admin', 'Gérant'), validateObjectId('id'), mouvementController.confirmerReception);

module.exports = router;