const express = require('express');
const router = express.Router();
const caisseController = require('../controllers/caisseController');
const clientController = require('../controllers/clientController'); 
const { protect, authorize } = require('../middleware/authMiddleware');
const { checkCaisseOuverte } = require('../middleware/caisseMiddleware');
const { checkMustChangePassword } = require('../middleware/passwordMiddleware');
const { validateOuvertureCaisse, validateFermetureCaisse, validateDepense } = require('../middleware/validators');
const validateObjectId = require('../middleware/validateObjectId');

// Toutes les routes nécessitent une connexion
router.use(protect);

// Bloquer l'accès si le changement de mot de passe est requis
router.use(checkMustChangePassword);

// ==========================================
// 1. ROUTES POUR LES GÉRANTS (Gestion quotidienne)
// ==========================================

// Gérer sa propre caisse
router.post('/ouvrir', authorize('Gérant'), validateOuvertureCaisse, caisseController.ouvrirCaisse);
router.post('/fermer', authorize('Gérant', 'Admin'), checkCaisseOuverte, validateFermetureCaisse, caisseController.fermerCaisse); // L'Admin peut avoir besoin de forcer la fermeture
router.put('/correction', authorize('Gérant'), validateFermetureCaisse, caisseController.corrigerRapport);

// Consultation du statut et des statistiques (Autorisé aux serveurs pour vérifier l'ouverture)
router.get('/statut', authorize('Gérant', 'Admin', 'Serveur'), caisseController.getStatutCaisse);
router.get('/statistiques-session', authorize('Gérant', 'Admin', 'Serveur'), caisseController.getStatistiquesSession);

// Dépenses et Paiements (Liés à la caisse ouverte)
router.post('/depenses', authorize('Gérant'), checkCaisseOuverte, validateDepense, caisseController.creerDepense);
router.get('/depenses/me', authorize('Gérant'), caisseController.listerMesDepenses);

// Paiement de dette via la caisse
router.post('/pay-dette/:id', authorize('Gérant'), validateObjectId('id'), checkCaisseOuverte, clientController.payDette);

// Rapports personnels (Le gérant consulte sa liste de rapports soumis)
router.get('/rapports/me', authorize('Gérant'), caisseController.listerMesRapports);


// ==========================================
// 3. ROUTE MIXTE (Consultation des détails)
// ==========================================

// CORRECTION : L'Admin ET le Gérant ont le droit de voir le détail profond d'un rapport
// (Supprime l'erreur 403 dans CaisseView.js lors du clic sur un rapport)
router.get('/rapports/:id/details', authorize('Admin', 'Gérant'), validateObjectId('id'), caisseController.getReportDetails);


// ==========================================
// 2. ROUTES POUR LES ADMINS UNIQUEMENT (Audit et Décision)
// ==========================================

// Seul l'Admin voit la liste globale de TOUTES les boutiques
router.get('/rapports', authorize('Admin'), caisseController.listerRapports);

// Seul l'Admin peut accepter ou rejeter un rapport financier
router.put('/rapports/:id/valider', authorize('Admin'), validateObjectId('id'), caisseController.validerRapport);
router.put('/rapports/:id/rejeter', authorize('Admin'), validateObjectId('id'), caisseController.rejeterRapport);

// Tableau de bord global admin
router.get('/admin', authorize('Admin'), caisseController.getCaisseAdmin);

module.exports = router;