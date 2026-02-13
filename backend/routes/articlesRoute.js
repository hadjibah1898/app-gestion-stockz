
const express = require('express');
const router = express.Router();
const articleController = require('../controllers/articlesController');
const { protect, authorize } = require('../middleware/auth');

// Tout le monde peut voir les articles, mais...
router.get('/', protect, articleController.getAllArticles);

// SEUL un Admin peut ajouter ou supprimer un article (Point 5.2/5.3)
router.post('/', protect, authorize('Admin'), articleController.addArticle);
router.delete('/:id', protect, authorize('Admin'), articleController.deleteArticle);
router.put('/:id', protect, authorize('Admin'), articleController.updateArticle);
router.post('/transfer', protect, authorize('Admin'), articleController.transferArticles);

module.exports = router;