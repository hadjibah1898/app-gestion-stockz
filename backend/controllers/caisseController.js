// c:\Users\hp\app-gestion-stock\backend\controllers\caisseController.js
const mongoose = require('mongoose');
const caisseService = require('../services/caisseService');
const venteService = require('../services/venteService');
const RapportCaisse = require('../models/RapportCaisse');
const auditHelper = require('../utils/auditHelper');
const asyncHandler = require('../middleware/asyncHandler');

// ==========================================
// 1. GÉRANT : GESTION DE LA SESSION
// ==========================================

exports.ouvrirCaisse = asyncHandler(async (req, res) => {
    const { fondInitial } = req.body;
    if (!req.user.boutique) throw new Error("Le gérant n'est assigné à aucune boutique.");

    const ouverture = await caisseService.ouvrirCaisse({ 
        fondInitial, 
        gerantId: req.user.id, 
        boutiqueId: req.user.boutique 
    });
    
    res.status(201).json({ success: true, data: ouverture });
});

exports.fermerCaisse = asyncHandler(async (req, res) => {
    const { montantCloture, commentairesGérant, paiementsCommissions } = req.body;
    
    // On récupère la session soit du middleware, soit de l'ID passé dans le corps de la requête
    const caisseSource = req.ouvertureCaisse; // Injecté par checkCaisseOuverte
    
    console.log("[DEBUG] Contenu de req.ouvertureCaisse:", req.ouvertureCaisse);
    console.log("[DEBUG] caisseSource utilisée:", caisseSource);
    if (!caisseSource) throw new Error("Aucune session de caisse active trouvée.");

    const rapportData = await venteService.preparerRapportCloture(
        caisseSource, 
        montantCloture, 
        req.user
    );

    const rapport = await caisseService.fermerCaisseEtCreerRapport({ 
        ...rapportData,
        commentairesGérant, 
        paiementsCommissions 
    });

    res.status(201).json({ success: true, message: "Caisse fermée et rapport généré.", data: rapport });
});

exports.getStatutCaisse = asyncHandler(async (req, res) => {
    const data = await caisseService.getStatutCaisse(req.user);
    res.status(200).json({ success: true, data });
});

exports.getStatistiquesSession = asyncHandler(async (req, res) => {
    const data = await caisseService.getStatistiquesSession(req.user);
    res.status(200).json({ success: true, data });
});

// ==========================================
// 2. GÉRANT : DÉPENSES & CORRECTIONS
// ==========================================

exports.creerDepense = asyncHandler(async (req, res) => {
    console.log("[DEBUG] Contenu de req.ouvertureCaisse pour dépense:", req.ouvertureCaisse);
    if (!req.ouvertureCaisse) throw new Error("Impossible d'enregistrer une dépense : aucune caisse ouverte.");

    const depense = await caisseService.creerDepense({ 
        ...req.body,
        ouvertureCaisseId: req.ouvertureCaisse._id, 
        gerantId: req.user.id, 
        boutiqueId: req.user.boutique 
    });
    res.status(201).json({ success: true, data: depense });
});

exports.listerMesDepenses = asyncHandler(async (req, res) => {
    const data = await caisseService.listerDepenses({ ...req.query, gerant: req.user.id }, req.user);
    res.status(200).json({ success: true, data });
});

exports.corrigerRapport = asyncHandler(async (req, res) => {
    const { montantCloture, commentairesGérant } = req.body;
    const rapport = await RapportCaisse.findOne({ gerant: req.user.id }).sort({ createdAt: -1 });

    if (!rapport || rapport.statut !== 'REJETE') {
        return res.status(400).json({ success: false, message: "Aucun rapport rejeté à corriger." });
    }

    const montantNum = parseFloat(montantCloture) || 0;
    rapport.montantCloture = montantNum;
    rapport.commentairesGérant = commentairesGérant;
    rapport.ecart = montantNum - (parseFloat(rapport.soldeTheorique?.toString()) || 0);
    rapport.statut = 'EN_ATTENTE';
    await rapport.save();

    res.status(200).json({ success: true, message: "Rapport corrigé et renvoyé.", data: rapport });
});

// ==========================================
// 3. ADMIN : VALIDATION & RAPPORTS
// ==========================================

exports.listerRapports = asyncHandler(async (req, res) => {
    const data = await caisseService.listerRapports(req.query, req.user);
    res.status(200).json({ success: true, data });
});

exports.listerMesRapports = asyncHandler(async (req, res) => {
    const data = await caisseService.listerRapports({ gerant: req.user.id }, req.user);
    res.status(200).json({ success: true, data });
});

exports.validerRapport = asyncHandler(async (req, res) => {
    const { commentairesAdmin } = req.body;
    const rapport = await caisseService.validerRapport({ 
        rapportId: req.params.id, 
        adminId: req.user.id, 
        commentairesAdmin 
    });
    await auditHelper.logSuccess(req, req.user, 'VALIDATE_CASH_REPORT', 'RapportCaisse', rapport._id, { ecart: rapport.ecart });
    res.status(200).json({ success: true, data: rapport });
});

exports.rejeterRapport = asyncHandler(async (req, res) => {
    const { commentairesAdmin } = req.body;
    const rapport = await caisseService.rejeterRapport({ 
        rapportId: req.params.id, 
        adminId: req.user.id, 
        commentairesAdmin 
    });
    await auditHelper.logSuccess(req, req.user, 'REJECT_CASH_REPORT', 'RapportCaisse', rapport._id, { motif: commentairesAdmin });
    res.status(200).json({ success: true, message: "Rapport rejeté avec succès.", data: rapport });
});

exports.getReportDetails = asyncHandler(async (req, res) => {
    const details = await caisseService.getReportDetails({ rapportId: req.params.id });
    res.status(200).json({ success: true, data: details });
});

// ==========================================
// 4. ADMIN : CAISSE CENTRALE
// ==========================================

exports.getCaisseAdmin = asyncHandler(async (req, res) => {
    const caisse = await caisseService.getCaisseAdmin();
    res.status(200).json({ success: true, data: caisse });
});

// Note: S'assurer que cette fonction existe dans caisseService.js
exports.getRapportAdmin = asyncHandler(async (req, res) => {
    const rapport = await RapportCaisse.findById(req.params.id)
        .populate('gerant boutique adminValidateur')
        .lean();
    res.status(200).json({ success: true, data: rapport });
});