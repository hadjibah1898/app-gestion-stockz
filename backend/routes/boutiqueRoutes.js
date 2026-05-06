const express = require('express');
const router = express.Router();
const { createBoutique, getAllBoutiques, updateBoutique, deleteBoutique } = require('../controllers/boutiqueController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { validateBoutique } = require('../middleware/validators');
const validateObjectId = require('../middleware/validateObjectId');

// Toutes les routes ici sont protégées et réservées aux Admins
router.use(protect); // Protéger toutes les routes

router.route('/')
    .post(authorize('Admin'), validateBoutique, createBoutique) // Création : Admin uniquement
    .get(authorize('Admin', 'Gérant', 'Serveur'), getAllBoutiques); // Lecture : Tous les rôles

router.route('/:id')
    .all(validateObjectId('id'))
    .put(authorize('Admin'), validateBoutique, updateBoutique) // Modif : Admin uniquement
    .delete(authorize('Admin'), deleteBoutique); // Suppr : Admin uniquement

module.exports = router;