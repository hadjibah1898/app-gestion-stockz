const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { protect, authorize } = require('../middleware/auth');

// Route principale pour récupérer toutes les stats du dashboard central (Admin uniquement)
router.get('/stats', protect, authorize('Admin'), dashboardController.getDashboardStats);

module.exports = router;