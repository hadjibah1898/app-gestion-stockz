const express = require('express');
const router = express.Router();
const caisseController = require('../controllers/caisseController');
const clientController = require('../controllers/clientController'); // Import nécessaire pour payDette
const { protect, authorize } = require('../middleware/authMiddleware');
const { checkCaisseOuverte } = require('../middleware/caisseMiddleware');
const { validateOuvertureCaisse, validateFermetureCaisse, validateDepense } = require('../middleware/validators');
const validateObjectId = require('../middleware/validateObjectId');

// Toutes les routes nécessitent une connexion
router.use(protect); 

// --- Routes pour les Gérants ---

// Gérer sa propre caisse
router.post('/ouvrir', authorize('Gérant'), validateOuvertureCaisse, caisseController.ouvrirCaisse);
router.post('/fermer', authorize('Gérant'), checkCaisseOuverte, validateFermetureCaisse, caisseController.fermerCaisse);
router.put('/correction', authorize('Gérant'), validateFermetureCaisse, caisseController.corrigerRapport);
router.get('/statut', authorize('Gérant'), caisseController.getStatutCaisse);
router.get('/statistiques-session', authorize('Gérant'), checkCaisseOuverte, caisseController.getStatistiquesSession);

// Dépenses et Paiements (Liés à la caisse ouverte)
router.post('/depenses', authorize('Gérant'), checkCaisseOuverte, validateDepense, caisseController.creerDepense);
router.get('/depenses/me', authorize('Gérant'), caisseController.listerMesDepenses);

// Paiement de dette via la caisse
// CORRECTION : Utilise protect, validateObjectId et le bon contrôleur
router.post('/pay-dette/:id', authorize('Gérant'), validateObjectId('id'), checkCaisseOuverte, clientController.payDette);

// Rapports personnels
router.get('/rapports/me', authorize('Gérant'), caisseController.listerMesRapports);


// --- Routes pour les Admins ---

router.get('/rapports', authorize('Admin'), caisseController.listerRapports);
router.put('/rapports/:id/valider', authorize('Admin'), validateObjectId('id'), caisseController.validerRapport);
router.put('/rapports/:id/rejeter', authorize('Admin'), validateObjectId('id'), caisseController.rejeterRapport);
router.get('/rapports/:id/details', authorize('Admin'), validateObjectId('id'), caisseController.getReportDetails);

router.get('/admin', authorize('Admin'), caisseController.getCaisseAdmin);

module.exports = router;