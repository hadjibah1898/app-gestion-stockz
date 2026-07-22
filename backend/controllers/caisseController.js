/**
 * @file caisseController.js
 * @description Contrôleur caisse : ouverture, fermeture, dépenses, rapports financiers.
 */

const mongoose = require('mongoose');
const caisseService = require('../services/caisseService');
const venteService = require('../services/venteService');
const RapportCaisse = require('../models/RapportCaisse');
const auditHelper = require('../utils/auditHelper');  
const asyncHandler = require('../middleware/asyncHandler');
const OuvertureCaisse = require('../models/OuvertureCaisse');
const notificationService = require('../services/notificationService');
const { safeNum } = require('../services/caisseService');

// ==========================================
// 1. GÉRANT : GESTION DE LA SESSION
// ==========================================

exports.ouvrirCaisse = asyncHandler(async (req, res) => {
    const { fondInitial } = req.body;
    const userId = req.user._id;
    const boutiqueId = req.user.boutique;
    const userRole = req.user.role;

    if (!boutiqueId) throw new Error("L'utilisateur n'est assigné à aucune boutique.");

    // --- NOUVEAU : GESTION CAISSIER ---
    // Si c'est un caissier, il peut ouvrir sa propre caisse (pas de restriction de boutique)
    if (userRole === 'Caissier') {
        // Vérifier si le caissier a déjà une session ouverte
        const existingSession = await OuvertureCaisse.findOne({
            gerant: userId,
            statut: 'OUVERTE'
        });

        if (existingSession) {
            return res.status(200).json({
                success: true,
                message: "Vous avez déjà une caisse ouverte. Reprise de la session en cours.",
                data: existingSession
            });
        }

        // Créer une nouvelle session pour le caissier (type CAISSIER pour isolation d'avec la caisse du gérant)
        const nouvelleSession = await caisseService.ouvrirCaisse({ fondInitial, gerantId: userId, boutiqueId, type: 'CAISSIER' });
        
        // Notifier le gérant de la boutique
        try {
            await notificationService.notifierOuvertureCaisseCaissier(nouvelleSession, req.user);
        } catch (err) {
            console.error("Erreur notification ouverture caisse:", err);
        }

        return res.status(201).json({ 
            success: true, 
            message: "Votre caisse a été ouverte avec succès. Le gérant a été notifié.",
            data: nouvelleSession 
        });
    }

    // --- GESTION GÉRANT (EXISTANT) ---
    // Check if a GERANT session is already open for THIS BOUTIQUE.
    // On filtre par type: 'GERANT' pour ne pas bloquer les caisses des caissiers (type: 'CAISSIER')
    const existingSessionForBoutique = await OuvertureCaisse.findOne({
        boutique: boutiqueId,
        statut: 'OUVERTE',
        type: 'GERANT'
    });

    if (existingSessionForBoutique) {
        // If the session was opened by the same user, simply return it.
        if (existingSessionForBoutique.gerant.toString() === userId.toString()) {
            return res.status(200).json({
                success: true,
                message: "Une session est déjà ouverte pour vous. Reprise de la session en cours.",
                data: existingSessionForBoutique
            });
        } else {
            // If another user has the cash drawer open for this shop.
            return res.status(400).json({
                success: false,
                message: "Action impossible : La caisse de cette boutique est déjà ouverte par un autre utilisateur."
            });
        }
    }

    // 2. If no open session exists for the boutique, proceed with creation.
    const nouvelleSession = await caisseService.ouvrirCaisse({ fondInitial, gerantId: userId, boutiqueId });
    res.status(201).json({ success: true, data: nouvelleSession });
});

exports.fermerCaisse = asyncHandler(async (req, res) => {
    const { montantCloture, commentairesGérant, paiementsCommissions } = req.body;
    const userRole = req.user.role;

    // On récupère la session soit du middleware, soit de l'ID passé dans le corps de la requête
    const caisseSource = req.ouvertureCaisse;

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

    // --- NOUVEAU : NOTIFICATION AU GÉRANT SI CAISSIER ---
    if (userRole === 'Caissier') {
        try {
            await notificationService.notifierRapportCaissier(rapport, req.user);
        } catch (err) {
            console.error("Erreur notification rapport caissier:", err);
        }
    }

    res.status(201).json({ 
        success: true, 
        message: userRole === 'Caissier' 
            ? "Votre rapport a été soumis au gérant pour validation." 
            : "Caisse fermée et rapport généré.", 
        data: rapport 
    });
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
    const adminId = req.user.id || req.user._id;
    const caisse = await caisseService.getCaisseAdmin(adminId);
    res.status(200).json({ success: true, data: caisse });
});

// Note: S'assurer que cette fonction existe dans caisseService.js
exports.getRapportAdmin = asyncHandler(async (req, res) => {
    const rapport = await RapportCaisse.findById(req.params.id)
        .populate('gerant boutique adminValidateur')
        .lean();
    res.status(200).json({ success: true, data: rapport });
});

// ==========================================
// 5. GÉRANT : VALIDATION RAPPORTS CAISSIERS
// ==========================================

exports.validerRapportCaissier = asyncHandler(async (req, res) => {
    const { commentairesGérant } = req.body;
    const rapportId = req.params.id;
    const gerantId = req.user.id;

    // Vérifier que le gérant a sa caisse ouverte avant de pouvoir valider
    const caisseOuverte = await OuvertureCaisse.findOne({
        gerant: gerantId,
        statut: 'OUVERTE',
        type: 'GERANT'
    });
    if (!caisseOuverte) {
        return res.status(400).json({ 
            success: false, 
            message: "Vous devez ouvrir votre caisse avant de pouvoir valider un rapport de caissier.",
            code: 'CAISSE_FERMEE'
        });
    }

    // Récupérer le rapport
    const rapport = await RapportCaisse.findById(rapportId)
        .populate('gerant', 'nom role')
        .populate('boutique', 'nom');

    if (!rapport) {
        return res.status(404).json({ success: false, message: "Rapport introuvable." });
    }

    // Vérifier que c'est bien un rapport d'un caissier de sa boutique
    const caissier = await User.findById(rapport.gerant);
    if (!caissier || caissier.role !== 'Caissier') {
        return res.status(403).json({ success: false, message: "Ce rapport n'appartient pas à un caissier." });
    }

    if (caissier.boutique?.toString() !== req.user.boutique?.toString()) {
        return res.status(403).json({ success: false, message: "Ce caissier n'appartient pas à votre boutique." });
    }

    if (rapport.statut !== 'EN_ATTENTE') {
        return res.status(400).json({ success: false, message: `Ce rapport est déjà ${rapport.statut.toLowerCase()}.` });
    }

    // Valider le rapport
    rapport.statut = 'VALIDE_PAR_GERANT';
    rapport.commentairesGérant = commentairesGérant;
    rapport.dateValidationGerant = new Date();
    rapport.gerantValidateur = gerantId;
    await rapport.save();

    // NOUVEAU : Ajouter le montant du rapport à la caisse ouverte du gérant
    try {
        const montantRapport = safeNum(rapport.montantCloture);
        if (montantRapport > 0) {
            await caisseService.ajouterMontantCaisseGerant({
                gerantId: gerantId,
                montant: montantRapport,
                rapportId: rapport._id
            });
            console.log(`[Caisse] Montant de ${montantRapport} GNF ajouté à la caisse du gérant ${gerantId} suite à la validation du rapport ${rapportId}`);
        }
    } catch (err) {
        console.error("Erreur lors de l'ajout du montant à la caisse du gérant:", err);
        // On ne bloque pas la validation si l'ajout échoue, mais on log l'erreur
    }

    // Notifier le caissier
    try {
        await notificationService.notifierValidationRapportCaissier(rapport, req.user);
    } catch (err) {
        console.error("Erreur notification validation rapport:", err);
    }

    res.status(200).json({ 
        success: true, 
        message: "Rapport du caissier validé avec succès. Le montant a été ajouté à votre caisse ouverte.",
        data: rapport 
    });
});

exports.rejeterRapportCaissier = asyncHandler(async (req, res) => {
    const { commentairesGérant } = req.body;
    const rapportId = req.params.id;
    const gerantId = req.user.id;

    // Vérifier que le gérant a sa caisse ouverte avant de pouvoir rejeter
    const caisseOuverte = await OuvertureCaisse.findOne({
        gerant: gerantId,
        statut: 'OUVERTE',
        type: 'GERANT'
    });
    if (!caisseOuverte) {
        return res.status(400).json({ 
            success: false, 
            message: "Vous devez ouvrir votre caisse avant de pouvoir rejeter un rapport de caissier.",
            code: 'CAISSE_FERMEE'
        });
    }

    const rapport = await RapportCaisse.findById(rapportId)
        .populate('gerant', 'nom role');

    if (!rapport) {
        return res.status(404).json({ success: false, message: "Rapport introuvable." });
    }

    const caissier = await User.findById(rapport.gerant);
    if (!caissier || caissier.role !== 'Caissier') {
        return res.status(403).json({ success: false, message: "Ce rapport n'appartient pas à un caissier." });
    }

    if (caissier.boutique?.toString() !== req.user.boutique?.toString()) {
        return res.status(403).json({ success: false, message: "Ce caissier n'appartient pas à votre boutique." });
    }

    if (rapport.statut !== 'EN_ATTENTE') {
        return res.status(400).json({ success: false, message: `Ce rapport est déjà ${rapport.statut.toLowerCase()}.` });
    }

    // Rejeter le rapport
    rapport.statut = 'REJETE_PAR_GERANT';
    rapport.commentairesGérant = commentairesGérant;
    rapport.dateValidationGerant = new Date();
    rapport.gerantValidateur = gerantId;
    await rapport.save();

    // Notifier le caissier
    try {
        await notificationService.notifierRejetRapportCaissier(rapport, req.user);
    } catch (err) {
        console.error("Erreur notification rejet rapport:", err);
    }

    res.status(200).json({ 
        success: true, 
        message: "Rapport du caissier rejeté. Il pourra le corriger et le renvoyer.",
        data: rapport 
    });
});

// ==========================================
// 6. GÉRANT : LISTE RAPPORTS CAISSIERS
// ==========================================

exports.listerRapportsCaissiers = asyncHandler(async (req, res) => {
    const gerantId = req.user.id;
    const boutiqueId = req.user.boutique;

    // Récupérer tous les caissiers de la boutique du gérant
    const caissiers = await User.find({ 
        boutique: boutiqueId, 
        role: 'Caissier',
        active: true 
    }).select('_id nom');

    const caissierIds = caissiers.map(c => c._id);

    // Récupérer les rapports de ces caissiers
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filters = {
        gerant: { $in: caissierIds },
        statut: { $in: ['EN_ATTENTE', 'VALIDE_PAR_GERANT', 'REJETE_PAR_GERANT'] }
    };

    // Filtres optionnels
    if (req.query.statut) {
        filters.statut = req.query.statut;
    }
    if (req.query.caissierId) {
        filters.gerant = req.query.caissierId;
    }
    if (req.query.startDate || req.query.endDate) {
        const dateFilter = {};
        if (req.query.startDate) {
            const start = new Date(req.query.startDate);
            if (!isNaN(start)) dateFilter.$gte = start;
        }
        if (req.query.endDate) {
            const end = new Date(req.query.endDate);
            if (!isNaN(end)) {
                end.setHours(23, 59, 59, 999);
                dateFilter.$lte = end;
            }
        }
        if (Object.keys(dateFilter).length > 0) filters.createdAt = dateFilter;
    }

    const totalCount = await RapportCaisse.countDocuments(filters);
    const rapports = await RapportCaisse.find(filters)
        .populate('gerant', 'nom email')
        .populate('boutique', 'nom')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

    // Formater les montants
    const formattedRapports = rapports.map(r => ({
        ...r,
        fondInitial: safeNum(r.fondInitial),
        totalVentes: safeNum(r.totalVentes),
        totalDettes: safeNum(r.totalDettes),
        totalMobileMoney: safeNum(r.totalMobileMoney),
        totalRecouvrement: safeNum(r.totalRecouvrement),
        totalDepensesApprouvees: safeNum(r.totalDepensesApprouvees),
        soldeTheorique: safeNum(r.soldeTheorique),
        montantCloture: safeNum(r.montantCloture),
        ecart: safeNum(r.ecart)
    }));

    res.status(200).json({
        success: true,
        data: formattedRapports,
        pagination: {
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
            currentPage: page
        }
    });
});

// Importer User pour les validations
const User = require('../models/User');