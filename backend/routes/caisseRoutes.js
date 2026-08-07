/**
 * @file caisseRoutes.js
 * @description Routes de gestion des caisses (ouverture, fermeture, dépenses, rapports).
 */

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
// IMPORTANT: Pas de checkCaisseOuverte sur /ouvrir car c'est justement pour ouvrir la caisse !
router.post('/ouvrir', authorize('Gérant', 'GérantBar', 'Caissier'), validateOuvertureCaisse, caisseController.ouvrirCaisse);
router.post('/fermer', authorize('Gérant', 'GérantBar', 'Admin', 'AdminBar', 'Caissier'), checkCaisseOuverte, validateFermetureCaisse, caisseController.fermerCaisse);
router.put('/correction', authorize('Gérant', 'GérantBar', 'Caissier'), checkCaisseOuverte, validateFermetureCaisse, caisseController.corrigerRapport);

// Consultation du statut et des statistiques
router.get('/statut', authorize('Gérant', 'GérantBar', 'Admin', 'AdminBar', 'Serveur', 'ServeurBar', 'Caissier'), caisseController.getStatutCaisse);
router.get('/statistiques-session', authorize('Gérant', 'GérantBar', 'Admin', 'AdminBar', 'Serveur', 'ServeurBar', 'Caissier'), caisseController.getStatistiquesSession);

// Dépenses et Paiements (Liés à la caisse ouverte)
router.post('/depenses', authorize('Gérant', 'GérantBar', 'Caissier'), checkCaisseOuverte, validateDepense, caisseController.creerDepense);
router.get('/depenses/me', authorize('Gérant', 'GérantBar', 'Caissier'), caisseController.listerMesDepenses);

// Paiement de dette via la caisse
router.post('/pay-dette/:id', authorize('Gérant', 'GérantBar', 'Caissier'), validateObjectId('id'), checkCaisseOuverte, clientController.payDette);

// Rapports personnels
router.get('/rapports/me', authorize('Gérant', 'GérantBar', 'Caissier'), caisseController.listerMesRapports);

// ==========================================
// ROUTES POUR CAISSIER (Nouveau workflow)
// ==========================================

// Le caissier peut soumettre son rapport (déjà couvert par /fermer)
// Routes spécifiques pour le workflow caissier
router.get('/rapports/caissier/me', authorize('Caissier'), caisseController.listerMesRapports);
router.put('/rapports/caissier/:id/corriger', authorize('Caissier'), caisseController.corrigerRapport);


// ==========================================
// 3. ROUTE MIXTE (Consultation des détails)
// ==========================================

// CORRECTION : L'Admin ET le Gérant ont le droit de voir le détail profond d'un rapport
// (Supprime l'erreur 403 dans CaisseView.js lors du clic sur un rapport)
router.get('/rapports/:id/details', authorize('Admin', 'AdminBar', 'Gérant', 'GérantBar'), validateObjectId('id'), caisseController.getReportDetails);


// ==========================================
// 2. ROUTES POUR LES GÉRANTS (Validation rapports caissiers)
// ==========================================

router.get('/rapports/caissiers', authorize('Gérant'), caisseController.listerRapportsCaissiers);
router.get('/rapports/caissiers/:id/details', authorize('Gérant'), validateObjectId('id'), caisseController.getReportDetails);
router.put('/rapports/caissiers/:id/valider', authorize('Gérant'), validateObjectId('id'), caisseController.validerRapportCaissier);
router.put('/rapports/caissiers/:id/rejeter', authorize('Gérant'), validateObjectId('id'), caisseController.rejeterRapportCaissier);

// ==========================================
// 3. ROUTES POUR LES ADMINS UNIQUEMENT (Audit et Décision)
// ==========================================

// Seul l'Admin voit la liste globale de TOUTES les boutiques
router.get('/rapports', authorize('Admin'), caisseController.listerRapports);

// Seul l'Admin peut accepter ou rejeter un rapport financier
router.put('/rapports/:id/valider', authorize('Admin'), validateObjectId('id'), caisseController.validerRapport);
router.put('/rapports/:id/rejeter', authorize('Admin'), validateObjectId('id'), caisseController.rejeterRapport);

// Tableau de bord global admin
router.get('/admin', authorize('Admin'), caisseController.getCaisseAdmin);

module.exports = router;