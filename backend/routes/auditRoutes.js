const express = require('express');
const router = express.Router();
const auditController = require('../controllers/auditController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Cette route ne doit être accessible qu'aux administrateurs
router.get('/', protect, authorize('Admin'), auditController.getLogs);

module.exports = router;