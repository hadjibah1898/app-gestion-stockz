const express = require('express');
const router = express.Router();
const venteController = require('../controllers/venteController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Vérification de sécurité pour le debug
if (!venteController.getPendingSales) {
    console.error("ERREUR: getPendingSales est introuvable dans le contrôleur !");
}

// Routes
router.post('/', protect, venteController.effectuerVente);
router.get('/historique', protect, venteController.getHistorique);
router.get('/pending', protect, venteController.getPendingSales); // <-- L'erreur venait souvent d'ici
router.get('/logs', protect, authorize('Admin'), venteController.getLogs);

router.post('/:id/cancel', protect, venteController.annulerVente);
router.post('/:id/validate-remise', protect, authorize('Admin'), venteController.validateRemise);
router.post('/:id/reject-remise', protect, authorize('Admin'), venteController.rejectRemise);

module.exports = router;