const express = require('express');
const router = express.Router();
const venteController = require('../controllers/venteController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { checkCaisseOuverte } = require('../middleware/caisseMiddleware');

// Vérification de sécurité pour le debug
if (!venteController.getPendingSales) {
    console.error("ERREUR: getPendingSales est introuvable dans le contrôleur !");
}

// Routes
router.post('/', protect, authorize('Gérant'), checkCaisseOuverte, venteController.effectuerVente); // Seul un gérant avec une caisse ouverte peut vendre
router.get('/historique', protect, venteController.getHistorique);
router.get('/pending', protect, venteController.getPendingSales); // <-- L'erreur venait souvent d'ici
router.get('/logs', protect, authorize('Admin'), venteController.getLogs);

router.post('/:id/cancel', protect, venteController.annulerVente);
router.post('/:id/validate-remise', protect, authorize('Admin'), venteController.validateRemise);
router.post('/:id/reject-remise', protect, authorize('Admin'), venteController.rejectRemise);

module.exports = router;