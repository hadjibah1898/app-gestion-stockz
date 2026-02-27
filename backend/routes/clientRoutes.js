const express = require('express');
const router = express.Router();
const { createClient, getClients, updateClient, deleteClient } = require('../controllers/clientController');
const { protect, authorize } = require('../middleware/authMiddleware');
const validateObjectId = require('../middleware/validateObjectId');

// Toutes les routes ici sont protégées et accessibles par Admin et Gérant
router.use(protect, authorize('Admin', 'Gérant'));


// Seul un Gérant peut créer un client
router.route('/')
    .get(getClients)
    .post(authorize('Gérant'), createClient);

router.route('/:id')
    .put(validateObjectId, updateClient)
    .delete(validateObjectId, deleteClient);

module.exports = router;