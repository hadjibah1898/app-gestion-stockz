const express = require('express');
const router = express.Router();
const caisseController = require('../controllers/caisseController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { checkCaisseOuverte, checkAucunRapportEnAttente } = require('../middleware/caisseMiddleware');

// --- Routes pour les Gérants ---
router.use(protect); // Toutes les routes suivantes nécessitent une connexion

// Gérer sa propre caisse
router.post('/ouvrir', authorize('Gérant'), checkAucunRapportEnAttente, caisseController.ouvrirCaisse);
router.post('/fermer', authorize('Gérant'), checkCaisseOuverte, caisseController.fermerCaisse);
router.get('/statut', authorize('Gérant'), caisseController.getStatutCaisse);
router.get('/statistiques-session', authorize('Gérant'), checkCaisseOuverte, caisseController.getStatistiquesSession);

// Gérer ses propres dépenses
router.post('/depenses', authorize('Gérant'), checkCaisseOuverte, caisseController.creerDepense);
router.get('/depenses/me', authorize('Gérant'), caisseController.listerMesDepenses);

// Gérer ses propres rapports
router.get('/rapports/me', authorize('Gérant'), caisseController.listerMesRapports);


// --- Routes pour les Admins ---

// Gérer tous les rapports
router.get('/rapports', authorize('Admin'), caisseController.listerRapports);
router.put('/rapports/:id/valider', authorize('Admin'), caisseController.validerRapport);
router.put('/rapports/:id/rejeter', authorize('Admin'), caisseController.rejeterRapport);
router.get('/rapports/:id/details', authorize('Admin'), caisseController.getReportDetails);

// Gérer la caisse centrale
router.get('/admin', authorize('Admin'), caisseController.getCaisseAdmin);

module.exports = router;