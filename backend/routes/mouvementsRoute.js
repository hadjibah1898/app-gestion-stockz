const express = require('express');
const router = express.Router();
const mouvementController = require('../controllers/mouvementController');
const { protect, authorize } = require('../middleware/auth');

router.get('/', protect, authorize('Admin'), mouvementController.getAllMouvements);
router.post('/:id/cancel', protect, authorize('Admin'), mouvementController.cancelMouvement);

module.exports = router;