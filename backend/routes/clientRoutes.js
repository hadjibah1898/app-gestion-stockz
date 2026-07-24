/**
 * @file clientRoutes.js
 * @description Routes CRUD des clients et gestion des dettes/créances.
 */

const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { checkCaisseOuverte } = require('../middleware/caisseMiddleware'); // Ajouté pour la sécurité caisse
const { validateClient, validateCommission } = require('../middleware/validators');
const validateObjectId = require('../middleware/validateObjectId');

/**
 * ROUTES CLIENTS
 * Toutes les routes nécessitent une authentification
 */
router.use(protect);

// --- 1. Gestion des Créances & Statistiques (Routes Statiques) ---
// Doivent être avant les routes avec :id
router.get('/debts', clientController.getDebts);
router.get('/debt-evolution', clientController.getDebtEvolution);
router.get('/debt-history', clientController.getDebtHistory);

// --- 2. Actions Spécifiques ---
router.post('/pay-commission', authorize('Gérant'), validateCommission, clientController.payCommission);

// --- 3. CRUD Standard ---
router.route('/')
    .get(clientController.getAllClients)
    .post(validateClient, clientController.createClient);

router.route('/:id')
    .all(validateObjectId('id'))
    .get(clientController.getClient)
    .put(validateClient, clientController.updateClient)
    .delete(authorize('Admin', 'AdminBar'), clientController.deleteClient);

// --- 4. Paiement Direct (CORRIGÉ) ---
// On utilise 'protect' (déjà actif via router.use) et 'checkCaisseOuverte'
router.post(
    '/:id/pay-dette', 
    validateObjectId('id'), 
    checkCaisseOuverte, 
    clientController.payDette
);

module.exports = router;
