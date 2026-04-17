const mongoose = require('mongoose');
const caisseService = require('../services/caisseService');
const RapportCaisse = require('../models/RapportCaisse');
const notificationService = require('../services/notificationService');
const { logAction } = require('../services/auditLogService');
const DebtPayment = require('../models/DebtPayment');

// ==========================================
// 1. GÉRANT : GESTION DE LA SESSION
// ==========================================

exports.ouvrirCaisse = async (req, res) => {
    try {
        let { fondInitial } = req.body;
        const gerantId = req.user.id;
        const boutiqueId = req.user.boutique;

        // Nettoyage de l'entrée au cas où le frontend envoie des espaces ou symboles
        const cleanedFond = typeof fondInitial === 'string' ? fondInitial.replace(/[^0-9.]+/g, "") : fondInitial;
        
        const fondInitialNum = parseFloat(cleanedFond);
        if (isNaN(fondInitialNum) || fondInitialNum < 0) {
            return res.status(400).json({ message: "Un fond de caisse initial valide est requis." });
        }
        if (!boutiqueId) {
            return res.status(400).json({ message: "Le gérant n'est assigné à aucune boutique." });
        }

        const ouverture = await caisseService.ouvrirCaisse({ fondInitial: fondInitialNum, gerantId, boutiqueId });
        res.status(201).json(ouverture);
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de l'ouverture.", error: error.message });
    }
};

exports.fermerCaisse = async (req, res) => {
    try {
        const { montantCloture, commentairesGérant, paiementsCommissions } = req.body;
        
        if (!req.ouvertureCaisse) {
            return res.status(403).json({ message: "Action impossible : Aucune session de caisse active trouvée." });
        }

        const ouvertureCaisseId = req.ouvertureCaisse._id; 
        const gerantId = req.user.id;

        const montantClotureNum = parseFloat(montantCloture);
        if (isNaN(montantClotureNum) || montantClotureNum < 0) {
            return res.status(400).json({ message: "Un montant de clôture valide est requis." });
        }

        const rapport = await caisseService.fermerCaisseEtCreerRapport({ 
            ouvertureCaisseId, 
            montantCloture: montantClotureNum, 
            commentairesGérant, 
            gerantId, 
            paiementsCommissions 
        });

        res.status(201).json({ message: "Caisse fermée et rapport généré.", rapport });
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la fermeture.", error: error.message });
    }
};

exports.getStatutCaisse = async (req, res) => {
    try {
        const statut = await caisseService.getStatutCaisse(req.user.id);
        res.status(200).json(statut);
    } catch (error) {
        res.status(500).json({ message: "Erreur statut caisse.", error: error.message });
    }
};

exports.getStatistiquesSession = async (req, res) => {
    try {
        const statistiques = await caisseService.getStatistiquesSession(req.user.id);
        res.status(200).json(statistiques);
    } catch (error) {
        res.status(500).json({ message: "Erreur stats session.", error: error.message });
    }
};

// ==========================================
// 2. GÉRANT : DÉPENSES & CORRECTIONS
// ==========================================

exports.creerDepense = async (req, res) => {
    try {
        const { montant, motif, justificatif } = req.body;
        const montantNum = parseFloat(montant);

        if (isNaN(montantNum) || montantNum <= 0) {
            return res.status(400).json({ message: "Un montant valide est requis." });
        }

        const depense = await caisseService.creerDepense({ 
            montant: montantNum, motif, justificatif, 
            ouvertureCaisseId: req.ouvertureCaisse._id, 
            gerantId: req.user.id, 
            boutiqueId: req.user.boutique 
        });
        res.status(201).json(depense);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.listerMesDepenses = async (req, res) => {
    try {
        const depenses = await caisseService.listerDepenses({ gerant: req.user.id });
        res.status(200).json(depenses);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.corrigerRapport = async (req, res) => {
    try {
        const { montantCloture, commentairesGérant } = req.body;
        const rapport = await RapportCaisse.findOne({ gerant: req.user.id }).sort({ createdAt: -1 });

        if (!rapport || rapport.statut !== 'REJETE') {
            return res.status(400).json({ message: "Aucun rapport rejeté à corriger." });
        }

        rapport.montantCloture = montantCloture;
        rapport.commentairesGérant = commentairesGérant;
        rapport.ecart = montantCloture - rapport.soldeTheorique;
        rapport.statut = 'EN_ATTENTE'; // Correct, correspond au check du service
        await rapport.save();

        await notificationService.sendNewReportAlert(rapport);
        res.status(200).json({ message: "Rapport renvoyé.", rapport });
    } catch (error) {
        res.status(500).json({ message: "Erreur correction.", error: error.message });
    }
};

// ==========================================
// 3. ADMIN : VALIDATION & RAPPORTS
// ==========================================

exports.listerRapports = async (req, res) => {
    try {
        const rapports = await caisseService.listerRapports(req.query);
        res.status(200).json(rapports);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.listerMesRapports = async (req, res) => {
    try {
        const rapports = await caisseService.listerRapports({ gerant: req.user.id });
        res.status(200).json(rapports);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.validerRapport = async (req, res) => {
    try {
        const { commentairesAdmin } = req.body;
        const rapport = await caisseService.validerRapport({ 
            rapportId: req.params.id, 
            adminId: req.user.id, 
            commentairesAdmin 
        });

        await logAction({
            req, user: req.user, action: 'VALIDATE_CASH_REPORT',
            entity: 'RapportCaisse', entityId: rapport._id,
            details: { boutique: rapport.boutique?.nom, ecart: rapport.ecart },
            status: 'SUCCESS'
        });

        res.status(200).json({ message: "Rapport validé.", rapport });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.rejeterRapport = async (req, res) => {
    try {
        const { commentairesAdmin } = req.body;
        const rapport = await caisseService.rejeterRapport({ 
            rapportId: req.params.id, 
            adminId: req.user.id, 
            commentairesAdmin 
        });
        res.status(200).json({ message: "Rapport rejeté.", rapport });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.getReportDetails = async (req, res) => {
    try {
        const details = await caisseService.getReportDetails({ rapportId: req.params.id });
        // Note: Le service renvoie déjà { rapport, ventes, depenses, remboursements }
        res.status(200).json(details);
    } catch (error) {
        res.status(404).json({ message: error.message });
    }
};

// ==========================================
// 4. ADMIN : CAISSE CENTRALE
// ==========================================

exports.getCaisseAdmin = async (req, res) => {
    try {
        const caisse = await caisseService.getCaisseAdmin();
        res.status(200).json(caisse);
    } catch (error) {
        res.status(500).json({ message: "Erreur caisse centrale.", error: error.message });
    }
};

exports.getRapportAdmin = async (req, res) => {
    try {
        const rapport = await caisseService.getRapportAdmin(req.params.id);
        res.status(200).json(rapport);
    } catch (error) {
        res.status(500).json({ message: "Erreur rapport.", error: error.message });
    }
};