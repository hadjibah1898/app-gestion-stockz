const express = require('express');
const router = express.Router();
const { createBoutique, getAllBoutiques, updateBoutique, deleteBoutique } = require('../controllers/boutiqueController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Toutes les routes ici sont protégées et réservées aux Admins
router.use(protect, authorize('Admin'));

router.route('/')
    .post(createBoutique)
    .get(getAllBoutiques);

router.route('/:id').put(updateBoutique).delete(deleteBoutique);

module.exports = router;