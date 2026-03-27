const express = require('express');
const router = express.Router();
const { createBoutique, getAllBoutiques, updateBoutique, deleteBoutique } = require('../controllers/boutiqueController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { validateBoutique } = require('../middleware/validators');
const validateObjectId = require('../middleware/validateObjectId');

// Toutes les routes ici sont protégées et réservées aux Admins
router.use(protect, authorize('Admin'));

router.route('/')
    .post(validateBoutique, createBoutique)
    .get(getAllBoutiques);

router.route('/:id')
    .all(validateObjectId('id'))
    .put(validateBoutique, updateBoutique)
    .delete(deleteBoutique);

module.exports = router;