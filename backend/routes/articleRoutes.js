const express = require('express');
const router = express.Router();
const articlesController = require('../controllers/articlesController'); // Utilisation du bon contrôleur
const { protect, authorize } = require('../middleware/authMiddleware');
const { checkMustChangePassword } = require('../middleware/passwordMiddleware');
const validateObjectId = require('../middleware/validateObjectId');

// Toutes les routes des articles sont protégées et vérifient le changement de mot de passe
router.use(protect);
router.use(checkMustChangePassword);

// --- ROUTES STANDARDS ---
router.get('/', articlesController.getAllArticles);
router.post('/', authorize('Admin'), articlesController.addArticle);
router.put('/:id', validateObjectId('id'), articlesController.updateArticle);
router.delete('/:id', authorize('Admin'), validateObjectId('id'), articlesController.deleteArticle);

// --- LOGIQUE COMMERCIALE (REMISES & PROMOS) ---
router.post('/:id/demander-remise', authorize('Gérant'), validateObjectId('id'), articlesController.demanderRemise);
router.post('/auto-promo', authorize('Admin'), articlesController.applyAutoPromo);

// --- LOGIQUE DE STOCK ET LOGISTIQUE ---
router.post('/transfer', authorize('Admin'), articlesController.transferArticles);
router.post('/restock', authorize('Admin'), articlesController.restockFromCentral);
router.post('/transfer/:id/cancel', authorize('Admin'), validateObjectId('id'), articlesController.cancelTransfer);
router.post('/transfer/:id/remind', authorize('Admin'), validateObjectId('id'), articlesController.remindManager);

// --- ROUTES DES AJUSTEMENTS (PERTES/CASSES) ---
router.get('/adjustments', authorize('Admin', 'Gérant'), articlesController.getAdjustments);
router.post('/adjustments', authorize('Admin', 'Gérant'), articlesController.createAdjustment);
router.put('/adjustments/:id/validate', authorize('Admin'), validateObjectId('id'), articlesController.validateAdjustment);

module.exports = router;