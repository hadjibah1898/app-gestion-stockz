const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Toutes les routes pour les clients sont protégées et nécessitent une authentification
router.use(protect);

// Nouvelles routes pour la gestion des créances
router.get('/debts', clientController.getDebts);
router.get('/debt-payments/pending', authorize('Admin'), clientController.getPendingDebtPayments);
router.put('/debt-payments/:id/validate', authorize('Admin'), clientController.validateDebtPayment);
router.get('/debt-evolution', clientController.getDebtEvolution);

router.get('/debt-history', clientController.getDebtHistory);

router.route('/')
    .get(clientController.getAllClients)
    .post(clientController.createClient);

router.route('/:id')
    .put(clientController.updateClient)
    .delete(clientController.deleteClient);

router.post('/:id/pay-dette', clientController.payDette);

module.exports = router;