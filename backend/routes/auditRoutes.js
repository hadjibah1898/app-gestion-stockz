/**
 * @file auditRoutes.js
 * @description Routes d'accès au journal d'audit (logs).
 */

const express = require('express');
const router = express.Router();
const auditController = require('../controllers/auditController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Cette route ne doit être accessible qu'aux administrateurs
router.get('/', protect, authorize('Admin', 'AdminBar'), auditController.getLogs);

module.exports = router;