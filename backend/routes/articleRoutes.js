const express = require('express');
const router = express.Router();
const articleController = require('../controllers/articleController');
const { protect, checkRole } = require('../middleware/authMiddleware');

// Toutes les routes des articles sont protégées
router.use(protect);

// Routes Standards
router.get('/', articleController.getArticles);
router.post('/', checkRole('Admin'), articleController.createArticle);
router.put('/:id', articleController.updateArticle);
router.delete('/:id', checkRole('Admin'), articleController.deleteArticle);

// Routes Spécifiques (Promotions)
router.post('/auto-promo', checkRole('Admin'), articleController.applyAutoPromo);

// Routes des Ajustements (Pertes/Casses)
router.get('/adjustments', articleController.getAdjustments);
router.post('/adjustments', checkRole('Gérant', 'Admin'), articleController.createAdjustment);
router.put('/adjustments/:id/validate', checkRole('Admin'), articleController.validateAdjustment);

module.exports = router;