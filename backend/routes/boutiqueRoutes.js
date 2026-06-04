const express = require('express');
const router = express.Router();
const { createBoutique, getAllBoutiques, updateBoutique, deleteBoutique, getBoutiqueDetailsForServeur } = require('../controllers/boutiqueController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { validateBoutique } = require('../middleware/validators');
const validateObjectId = require('../middleware/validateObjectId');

// Toutes les routes ici sont protégées et réservées aux Admins
router.use(protect); // Protéger toutes les routes

router.route('/')
    .post(authorize('Admin'), validateBoutique, createBoutique)
    .get(authorize('Admin', 'Gérant', 'Serveur'), getAllBoutiques);

router.route('/:id')
    .all(validateObjectId('id'))
    .get(authorize('Admin', 'Gérant', 'Serveur'), getBoutiqueDetailsForServeur) // Nouvelle route optimisée pour le serveur
    .put(authorize('Admin'), validateBoutique, updateBoutique) // Modif : Admin uniquement
    .delete(authorize('Admin'), deleteBoutique); // Suppr : Admin uniquement

module.exports = router;