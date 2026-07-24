/**
 * @file fournisseursRoute.js
 * @description Routes CRUD des fournisseurs et approvisionnement.
 */

const express = require('express');
const router = express.Router();
const fournisseurController = require('../controllers/fournisseurController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { validateFournisseur } = require('../middleware/validators');
const validateObjectId = require('../middleware/validateObjectId');

// Routes CRUD
router.get('/', protect, fournisseurController.getAllFournisseurs);
router.post('/', protect, authorize('Admin', 'AdminBar'), validateFournisseur, fournisseurController.createFournisseur);
router.put('/:id', protect, authorize('Admin', 'AdminBar'), validateObjectId('id'), validateFournisseur, fournisseurController.updateFournisseur);
router.delete('/:id', protect, authorize('Admin', 'AdminBar'), validateObjectId('id'), fournisseurController.deleteFournisseur);

// Route Spéciale : Approvisionner la centrale
router.post('/approvisionner', protect, authorize('Admin', 'AdminBar'), fournisseurController.approvisionnerCentrale);

module.exports = router;