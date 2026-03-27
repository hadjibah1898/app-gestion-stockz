const caisseService = require('../services/caisseService');
const RapportCaisse = require('../models/RapportCaisse');
const notificationService = require('../services/notificationService');
const { logAction } = require('../services/auditLogService');

// --- Gérant: Ouverture / Fermeture / Statut ---

exports.ouvrirCaisse = async (req, res) => {
    try {
        const { fondInitial } = req.body;
        const gerantId = req.user.id;
        const boutiqueId = req.user.boutique;

        if (fondInitial === undefined || fondInitial < 0) {
            return res.status(400).json({ message: "Le fond de caisse initial est requis et doit être positif." });
        }
        if (!boutiqueId) {
            return res.status(400).json({ message: "Le gérant n'est assigné à aucune boutique." });
        }

        const ouverture = await caisseService.ouvrirCaisse({ fondInitial, gerantId, boutiqueId });
        res.status(201).json(ouverture);
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de l'ouverture de la caisse.", error: error.message });
    }
};

exports.fermerCaisse = async (req, res) => {
    try {
        const { montantCloture, commentairesGérant, paiementsCommissions } = req.body;
        const ouvertureCaisseId = req.ouvertureCaisse._id; // Fourni par le middleware checkCaisseOuverte
        const gerantId = req.user.id;

        if (montantCloture === undefined || montantCloture < 0) {
            return res.status(400).json({ message: "Le montant de clôture est requis." });
        }

        const rapport = await caisseService.fermerCaisseEtCreerRapport({ ouvertureCaisseId, montantCloture, commentairesGérant, gerantId, paiementsCommissions });
        res.status(201).json({ message: "Caisse fermée et rapport généré avec succès.", rapport });
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la fermeture de la caisse.", error: error.message });
    }
};

exports.corrigerRapport = async (req, res) => {
    try {
        const { montantCloture, commentairesGérant } = req.body;
        const gerantId = req.user.id;

        // Trouver le dernier rapport du gérant
        const rapport = await RapportCaisse.findOne({ gerant: gerantId }).sort({ createdAt: -1 });

        if (!rapport) {
            return res.status(404).json({ message: "Aucun rapport trouvé." });
        }

        if (rapport.statut !== 'REJETE') {
            return res.status(400).json({ message: "Le dernier rapport n'est pas rejeté." });
        }

        // Mise à jour des informations
        rapport.montantCloture = montantCloture;
        rapport.commentairesGérant = commentairesGérant;
        rapport.ecart = montantCloture - rapport.soldeTheorique;
        rapport.statut = 'EN_ATTENTE'; // On repasse en attente de validation
        await rapport.save();

        // Notifier les admins de la correction
        await notificationService.sendNewReportAlert(rapport);

        res.status(200).json({ message: "Rapport corrigé et renvoyé pour validation.", rapport });
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la correction du rapport.", error: error.message });
    }
};

exports.getStatutCaisse = async (req, res) => {
    try {
        const statut = await caisseService.getStatutCaisse(req.user.id);
        res.status(200).json(statut);
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la récupération du statut de la caisse.", error: error.message });
    }
};

exports.getStatistiquesSession = async (req, res) => {
    try {
        const statistiques = await caisseService.getStatistiquesSession(req.user.id);
        res.status(200).json(statistiques);
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la récupération des statistiques de la session.", error: error.message });
    }
};

// --- Gérant: Dépenses ---

exports.creerDepense = async (req, res) => {
    try {
        const { montant, motif, justificatif } = req.body;
        const ouvertureCaisseId = req.ouvertureCaisse._id;
        const gerantId = req.user.id;
        const boutiqueId = req.user.boutique;

        const depense = await caisseService.creerDepense({ montant, motif, justificatif, ouvertureCaisseId, gerantId, boutiqueId });
        res.status(201).json(depense);
    } catch (error) {
        // Si l'erreur est une erreur métier (fonds insuffisants), renvoyer une 400
        if (error.message.includes('Dépense refusée')) {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: "Erreur lors de la création de la dépense.", error: error.message });
    }
};

exports.listerMesDepenses = async (req, res) => {
    try {
        const depenses = await caisseService.listerDepenses({ gerant: req.user.id });
        res.status(200).json(depenses);
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la récupération de vos dépenses.", error: error.message });
    }
};

// --- Admin: Rapports ---

exports.listerRapports = async (req, res) => {
    try {
        const rapports = await caisseService.listerRapports(req.query);
        res.status(200).json(rapports);
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la récupération des rapports.", error: error.message });
    }
};

exports.validerRapport = async (req, res) => {
    try {
        const { commentairesAdmin } = req.body;
        const rapport = await caisseService.validerRapport({ rapportId: req.params.id, adminId: req.user.id, commentairesAdmin });

        await logAction({
            req,
            user: req.user,
            action: 'VALIDATE_CASH_REPORT',
            entity: 'RapportCaisse',
            entityId: rapport._id,
            details: { gerant: rapport.gerant.nom, boutique: rapport.boutique.nom, ecart: rapport.ecart },
            status: 'SUCCESS'
        });

        res.status(200).json({ message: "Rapport validé et caisse centrale mise à jour.", rapport });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.rejeterRapport = async (req, res) => {
    try {
        const { commentairesAdmin } = req.body;
        const rapport = await caisseService.rejeterRapport({ rapportId: req.params.id, adminId: req.user.id, commentairesAdmin });

        await logAction({
            req,
            user: req.user,
            action: 'REJECT_CASH_REPORT',
            entity: 'RapportCaisse',
            entityId: rapport._id,
            details: { gerant: rapport.gerant.nom, boutique: rapport.boutique.nom, motif: commentairesAdmin },
            status: 'SUCCESS'
        });

        res.status(200).json({ message: "Rapport rejeté avec succès.", rapport });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.getReportDetails = async (req, res) => {
    try {
        const details = await caisseService.getReportDetails({ rapportId: req.params.id });
        res.status(200).json(details);
    } catch (error) {
        res.status(404).json({ message: error.message });
    }
};

// --- Gérant: Rapports ---
exports.listerMesRapports = async (req, res) => {
    try {
        const filters = { gerant: req.user.id };
        // SÉCURITÉ & LOGIQUE : Un gérant ne doit voir que les rapports de sa boutique actuelle.
        if (req.user.boutique) {
            filters.boutique = req.user.boutique;
        }

        const rapports = await caisseService.listerRapports(filters);
        res.status(200).json(rapports);
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la récupération de vos rapports.", error: error.message });
    }
};

// --- Admin: Caisse Centrale ---

exports.getCaisseAdmin = async (req, res) => {
    try {
        const caisse = await caisseService.getCaisseAdmin();
        res.status(200).json(caisse);
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la récupération de la caisse centrale.", error: error.message });
    }
};