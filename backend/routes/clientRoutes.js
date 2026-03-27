const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { validateClient, validateCommission } = require('../middleware/validators');
const validateObjectId = require('../middleware/validateObjectId');

/**
 * ROUTES CLIENTS
 * Toutes les routes ci-dessous nécessitent une authentification
 */
router.use(protect);

// --- Gestion des Créances & Statistiques ---
router.get('/debts', clientController.getDebts);
router.get('/debt-evolution', clientController.getDebtEvolution);
router.get('/debt-history', clientController.getDebtHistory);

// --- Validation des Paiements (Administration) ---
router.get('/debt-payments/pending', clientController.getPendingDebtPayments);
router.put('/debt-payments/:id/validate', authorize('Admin'), validateObjectId('id'), clientController.validateDebtPayment);
router.put('/debt-payments/:id/reject', authorize('Admin'), validateObjectId('id'), clientController.rejectDebtPayment);

// --- Actions Spécifiques ---
// Note : Placées avant /:id pour éviter les conflits de capture
router.post('/pay-commission', authorize('Gérant'), validateCommission, clientController.payCommission);

// --- CRUD Standard ---
router.route('/')
    .get(clientController.getAllClients)
    .post(validateClient, clientController.createClient);

router.route('/:id')
    .all(validateObjectId('id'))
    .get(clientController.getClient)
    .put(validateClient, clientController.updateClient)
    .delete(authorize('Admin'), clientController.deleteClient);

// --- Paiement Direct ---
router.post('/:id/pay-dette', validateObjectId('id'), clientController.payDette);

module.exports = router;
