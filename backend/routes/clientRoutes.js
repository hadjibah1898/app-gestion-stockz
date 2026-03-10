const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');
const { protect } = require('../middleware/authMiddleware');

// Toutes les routes pour les clients sont protégées et nécessitent une authentification
router.use(protect);

router.get('/debt-history', clientController.getDebtHistory);

router.route('/')
    .get(clientController.getAllClients)
    .post(clientController.createClient);

router.route('/:id')
    .put(clientController.updateClient)
    .delete(clientController.deleteClient);

router.post('/:id/pay-dette', clientController.payDette);

module.exports = router;