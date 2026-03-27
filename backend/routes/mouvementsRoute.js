const express = require('express');
const router = express.Router();
const mouvementController = require('../controllers/mouvementController');
const { protect, authorize } = require('../middleware/authMiddleware');
const validateObjectId = require('../middleware/validateObjectId');

router.get('/', protect, authorize('Admin'), mouvementController.getAllMouvements);
router.post('/:id/cancel', protect, authorize('Admin'), validateObjectId('id'), mouvementController.cancelMouvement);

module.exports = router;