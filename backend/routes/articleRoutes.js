/**
 * @file articleRoutes.js
 * @description Routes API pour la gestion des articles (CRUD, transferts, ajustements, remises).
 */

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
router.post('/', authorize('Admin', 'AdminBar'), articlesController.addArticle);
router.put('/:id', validateObjectId('id'), articlesController.updateArticle);
router.delete('/:id', authorize('Admin', 'AdminBar'), validateObjectId('id'), articlesController.deleteArticle);

// --- LOGIQUE COMMERCIALE (REMISES & PROMOS) ---
router.post('/:id/demander-remise', authorize('Gérant', 'GérantBar'), validateObjectId('id'), articlesController.demanderRemise);
router.post('/auto-promo', authorize('Admin', 'AdminBar'), articlesController.applyAutoPromo);

// --- LOGIQUE DE STOCK ET LOGISTIQUE ---
router.post('/transfer', authorize('Admin', 'AdminBar'), articlesController.transferArticles);
router.post('/restock', authorize('Admin', 'AdminBar'), articlesController.restockFromCentral);
router.post('/transfer/:id/cancel', authorize('Admin', 'AdminBar'), validateObjectId('id'), articlesController.cancelTransfer);
router.post('/transfer/:id/remind', authorize('Admin', 'AdminBar'), validateObjectId('id'), articlesController.remindManager);
router.put('/transfer/:id/correct', authorize('Admin', 'AdminBar'), validateObjectId('id'), articlesController.corrigerTransfert);

// --- ROUTES DES AJUSTEMENTS (PERTES/CASSES) ---
router.get('/adjustments', authorize('Admin', 'AdminBar', 'Gérant', 'GérantBar'), articlesController.getAdjustments);
router.post('/adjustments', authorize('Admin', 'AdminBar', 'Gérant', 'GérantBar'), articlesController.createAdjustment);
router.put('/adjustments/:id/validate', authorize('Admin', 'AdminBar'), validateObjectId('id'), articlesController.validateAdjustment);

module.exports = router;