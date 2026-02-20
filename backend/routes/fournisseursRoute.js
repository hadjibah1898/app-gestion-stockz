const express = require('express');
const router = express.Router();
const fournisseurController = require('../controllers/fournisseurController');
const { protect, authorize } = require('../middleware/auth');

// Routes CRUD
router.get('/', protect, fournisseurController.getAllFournisseurs);
router.post('/', protect, authorize('Admin'), fournisseurController.createFournisseur);
router.put('/:id', protect, authorize('Admin'), fournisseurController.updateFournisseur);
router.delete('/:id', protect, authorize('Admin'), fournisseurController.deleteFournisseur);

// Route Spéciale : Approvisionner la centrale
router.post('/approvisionner', protect, authorize('Admin'), fournisseurController.approvisionnerCentrale);

module.exports = router;