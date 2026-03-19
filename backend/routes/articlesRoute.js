
const express = require('express');
const router = express.Router();
const articleController = require('../controllers/articlesController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { validateArticle, validateTransfert } = require('../middleware/validators');

// Route pour qu'un gérant demande une remise (notification à l'admin)
router.post('/:id/demander-remise', protect, authorize('Gérant'), articleController.demanderRemise);

// Tout le monde peut voir les articles, mais...
router.get('/', protect, articleController.getAllArticles);

// SEUL un Admin peut ajouter ou supprimer un article (Point 5.2/5.3)
router.post('/', protect, authorize('Admin'), validateArticle, articleController.addArticle);
router.delete('/:id', protect, authorize('Admin'), articleController.deleteArticle);
router.put('/:id', protect, authorize('Admin'), validateArticle, articleController.updateArticle);
router.post('/transfer', protect, authorize('Admin'), validateTransfert, articleController.transferArticles);
router.post('/restock', protect, authorize('Admin'), validateTransfert, articleController.restockFromCentral);

module.exports = router;