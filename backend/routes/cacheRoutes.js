/**
 * @file cacheRoutes.js
 * @description Routes d'administration du cache (invalidation manuelle).
 */

const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const { flushBoutiqueCacheManually } = require('../controllers/cacheController');

// Route pour vider le cache des boutiques (Admin uniquement)
// Utilise DELETE car c'est une opération d'invalidation/suppression de données (du cache)
router.delete('/boutiques', protect, authorize('Admin', 'AdminBar'), flushBoutiqueCacheManually);

module.exports = router;