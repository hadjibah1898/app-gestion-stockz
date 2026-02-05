const express = require('express');
const router = express.Router();
const venteController = require('../controllers/venteController');
const { protect, authorize } = require('../middleware/auth');

// Le test de sécurité :
if (!venteController || !venteController.effectuerVente) {
    console.log("❌ ALERTE : La fonction effectuerVente est introuvable dans le contrôleur !");
    console.log("Contenu actuel du contrôleur :", venteController);
}

// Ligne 7 :
router.post('/', protect, venteController.effectuerVente);
router.get('/historique', protect, venteController.getHistorique);

// Nouvelle route pour les logs (Admin seulement)
router.get('/logs', protect, authorize('Admin'), venteController.getLogs);

module.exports = router;