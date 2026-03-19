const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { validateClient } = require('../middleware/validators');

// Toutes les routes pour les clients sont protégées et nécessitent une authentification
router.use(protect);

// Nouvelles routes pour la gestion des créances
router.get('/debts', clientController.getDebts);
router.get('/debt-payments/pending', protect, clientController.getPendingDebtPayments);
router.put('/debt-payments/:id/validate', authorize('Admin'), clientController.validateDebtPayment);
router.put('/debt-payments/:id/reject', authorize('Admin'), clientController.rejectDebtPayment);
router.get('/debt-evolution', clientController.getDebtEvolution);

router.get('/debt-history', clientController.getDebtHistory);

// Cette route doit être AVANT router.route('/:id') pour ne pas être interceptée
router.post('/pay-commission', clientController.payCommission);

router.route('/')
    .get(clientController.getAllClients)
    .post(validateClient, clientController.createClient);

router.route('/:id')
    .put(validateClient, clientController.updateClient)
    .delete(clientController.deleteClient);

router.post('/:id/pay-dette', clientController.payDette);

module.exports = router;