/**
 * @file boutiqueRoutes.js
 * @description boutiqueRoutes - routes
 */

const express = require('express');
const router = express.Router();
const { createBoutique, getAllBoutiques, updateBoutique, deleteBoutique, getBoutiqueDetailsForServeur } = require('../controllers/boutiqueController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { validateBoutique } = require('../middleware/validators');
const validateObjectId = require('../middleware/validateObjectId');

// Toutes les routes ici sont protégées et réservées aux Admins
router.use(protect); // Protéger toutes les routes

router.route('/')
    .post(authorize('Admin', 'AdminBar'), validateBoutique, createBoutique)
    .get(authorize('Admin', 'AdminBar', 'Gérant', 'GérantBar', 'Serveur', 'ServeurBar'), getAllBoutiques);

router.route('/:id')
    .all(validateObjectId('id'))
    .get(authorize('Admin', 'Gérant', 'Serveur', 'Caissier', 'AdminBar', 'GérantBar', 'ServeurBar', 'CaissierBar'), getBoutiqueDetailsForServeur) // Caissier autorisé pour consulter sa boutique
    .put(authorize('Admin', 'AdminBar'), validateBoutique, updateBoutique) // Modif : Admin uniquement
    .delete(authorize('Admin', 'AdminBar'), deleteBoutique); // Suppr : Admin uniquement

module.exports = router;