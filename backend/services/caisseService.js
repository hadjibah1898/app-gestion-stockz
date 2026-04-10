const OuvertureCaisse = require('../models/OuvertureCaisse');
const Depense = require('../models/Depense');
const RapportCaisse = require('../models/RapportCaisse');
const CaisseAdmin = require('../models/CaisseAdmin');
const Vente = require('../models/Vente');
const DebtPayment = require('../models/DebtPayment');
const User = require('../models/User');
const Client = require('../models/Client');
const DebtMovement = require('../models/DebtMovement');
const notificationService = require('./notificationService');
const commissionService = require('./commissionService');

// --- GESTION OUVERTURE / FERMETURE ---

exports.ouvrirCaisse = async ({ fondInitial, gerantId, boutiqueId }) => {
    // La vérification de caisse déjà ouverte et de rapport en attente est faite par le middleware
    const nouvelleOuverture = new OuvertureCaisse({
        fondInitial,
        gerant: gerantId,
        boutique: boutiqueId,
    });
    await nouvelleOuverture.save();
    return nouvelleOuverture;
};

exports.fermerCaisseEtCreerRapport = async ({ ouvertureCaisseId, montantCloture, commentairesGérant, gerantId, paiementsCommissions }) => {
    const ouverture = await OuvertureCaisse.findById(ouvertureCaisseId).populate('boutique');
    if (!ouverture || ouverture.gerant.toString() !== gerantId) {
        throw new Error("Ouverture de caisse introuvable ou non autorisée.");
    }
    if (ouverture.statut === 'FERMEE') {
        throw new Error("Cette caisse est déjà fermée.");
    }

    // --- GESTION PAIEMENT COMMISSIONS ---
    if (paiementsCommissions && Array.isArray(paiementsCommissions)) {
        for (const paiement of paiementsCommissions) {
            const { clientId, montant } = paiement;

            // Utilisation du service centralisé
            await commissionService.processPayment({
                workerId: clientId,
                montant,
                gerantId,
                boutiqueId: ouverture.boutique._id,
                ouvertureCaisseId
            }).catch(err => {
                console.error(`Erreur commission lors de la clôture: ${err.message}`);
                throw err; // On propage pour garantir l'intégrité du rapport
            });
        }
    }

    // 1. Calculer le total des ventes pour cette session
    const ventes = await Vente.find({ ouvertureCaisse: ouvertureCaisseId, isCancelled: false });
    const totalVentes = ventes.reduce((acc, vente) => acc + vente.prixTotal, 0);

    // 1.1 Calculer les dettes accordées durant cette session (Argent non encaissé)
    const venteIds = ventes.map(v => v._id);
    const dettes = await DebtMovement.find({ venteAssociee: { $in: venteIds }, type: 'CREATION' });
    const totalDettes = dettes.reduce((acc, d) => acc + d.montant, 0);

    // 2. Calculer le total des dépenses pour cette session (elles sont toutes validées à la création)
    const depenses = await Depense.find({ ouvertureCaisse: ouvertureCaisseId });
    const totalDepenses = depenses.reduce((acc, depense) => acc + depense.montant, 0);

    // 3. Calculer le solde théorique et l'écart
    const soldeTheorique = (ouverture.fondInitial + totalVentes - totalDettes) - totalDepenses;
    const ecart = montantCloture - soldeTheorique;

    // 4. Vérifier si une justification est obligatoire pour l'écart
    if (ecart !== 0 && (!commentairesGérant || commentairesGérant.trim() === '')) {
        throw new Error("Une justification est obligatoire pour justifier l'écart détecté.");
    }

    // 5. Créer le rapport
    const rapport = new RapportCaisse({
        ouvertureCaisse: ouvertureCaisseId,
        gerant: gerantId,
        boutique: ouverture.boutique._id,
        fondInitial: ouverture.fondInitial,
        totalVentes,
        totalDettes,
        totalDepensesApprouvees: totalDepenses, // Renommé pour garder la cohérence du modèle Rapport
        soldeTheorique,
        montantCloture,
        ecart,
        commentairesGérant,
    });
    await rapport.save();

    // 6. Mettre à jour l'ouverture de caisse
    ouverture.statut = 'FERMEE';
    ouverture.dateFermeture = new Date();
    ouverture.rapportGenere = true;
    await ouverture.save();

    // 7. Réinitialiser les ventes de la session pour la prochaine ouverture
    // Option 1: Supprimer les ventes associées à cette session (si elles ne sont pas nécessaires pour l'historique global)
    // await Vente.deleteMany({ ouvertureCaisse: ouvertureCaisseId, isCancelled: false });

    // Option 2: Marquer les ventes comme "archivées" pour la session (recommandé pour garder l'historique)
    // On peut ajouter un champ "sessionArchived" ou simplement les laisser car elles sont liées à l'ouverture fermée.
    // Le frontend affichera 0 car il ne trouvera plus d'ouverture OUVERTE pour le gérant.
    
    // Notifier les admins
    await notificationService.sendNewReportAlert(rapport);

    return rapport;
};

exports.getStatutCaisse = async (gerantId) => {
    try {
        const ouverture = await OuvertureCaisse.findOne({ gerant: gerantId, statut: 'OUVERTE' })
            .populate('boutique', 'nom')
            .lean();
        
        if (!ouverture) return null;

        // Agréger les données de la session en cours
        const ventes = await Vente.find({ ouvertureCaisse: ouverture._id, isCancelled: false });
        const totalVentes = ventes.reduce((acc, v) => acc + v.prixTotal, 0);

        const venteIds = ventes.map(v => v._id);
        const dettes = await DebtMovement.find({ venteAssociee: { $in: venteIds }, type: 'CREATION' });
        const totalDettes = dettes.reduce((acc, d) => acc + d.montant, 0);

        const depenses = await Depense.find({ ouvertureCaisse: ouverture._id });
        const totalDepenses = depenses.reduce((acc, d) => acc + d.montant, 0);

        return {
            ...ouverture,
            session: {
                totalVentes,
                totalEncaisse: totalVentes - totalDettes, // Affiche uniquement le montant encaissé (Cash)
                nombreVentes: ventes.length,
                totalDepenses,
                nombreDepenses: depenses.length,
                totalDettes, // Ajout pour le frontend
            }
        };
    } catch (error) {
        console.error("Erreur dans getStatutCaisse:", error);
        throw error; // Propager l'erreur pour qu'elle soit vue par le contrôleur
    }
};

exports.getStatistiquesSession = async (gerantId) => {
    const ouverture = await OuvertureCaisse.findOne({ gerant: gerantId, statut: 'OUVERTE' })
        .populate('boutique', 'nom')
        .lean();
    
    if (!ouverture) {
        throw new Error("Aucune caisse ouverte pour ce gérant.");
    }

    // Agréger les données de la session en cours
    const ventes = await Vente.find({ ouvertureCaisse: ouverture._id, isCancelled: false });
    const totalVentes = ventes.reduce((acc, v) => acc + v.prixTotal, 0);

    const venteIds = ventes.map(v => v._id);
    const dettes = await DebtMovement.find({ venteAssociee: { $in: venteIds }, type: 'CREATION' });
    const totalDettes = dettes.reduce((acc, d) => acc + d.montant, 0);

    const depenses = await Depense.find({ ouvertureCaisse: ouverture._id });
    const totalDepenses = depenses.reduce((acc, d) => acc + d.montant, 0);

    return {
        ...ouverture,
        session: {
            totalVentes,
            totalEncaisse: totalVentes - totalDettes, // Affiche uniquement le montant encaissé (Cash)
            nombreVentes: ventes.length,
            totalDepenses,
            nombreDepenses: depenses.length,
            totalDettes, // Ajout pour le frontend
        }
    };
};

// --- GESTION DÉPENSES ---

exports.creerDepense = async ({ montant, motif, justificatif, ouvertureCaisseId, gerantId, boutiqueId }) => {
    const montantDepense = parseFloat(montant);
    if (isNaN(montantDepense) || montantDepense <= 0) {
        throw new Error("Le montant de la dépense doit être un nombre positif.");
    }

    // 1. Récupérer l'état actuel de la caisse
    const ouverture = await OuvertureCaisse.findById(ouvertureCaisseId);
    if (!ouverture) {
        throw new Error("Session de caisse introuvable.");
    }

    const ventes = await Vente.find({ ouvertureCaisse: ouvertureCaisseId, isCancelled: false });
    const totalVentes = ventes.reduce((acc, v) => acc + v.prixTotal, 0);

    const venteIds = ventes.map(v => v._id);
    const dettes = await DebtMovement.find({ venteAssociee: { $in: venteIds }, type: 'CREATION' });
    const totalDettes = dettes.reduce((acc, d) => acc + d.montant, 0);

    const depensesAnterieures = await Depense.find({ ouvertureCaisse: ouvertureCaisseId });
    const totalDepensesAnterieures = depensesAnterieures.reduce((acc, d) => acc + d.montant, 0);

    // 2. Vérifier si les fonds sont suffisants (Argent réel = Fond + Ventes Cash - Dépenses)
    const cashDisponible = (ouverture.fondInitial + totalVentes - totalDettes) - totalDepensesAnterieures;

    if (montantDepense > cashDisponible) {
        throw new Error(`Dépense refusée. Fonds insuffisants en caisse. Disponible: ${cashDisponible.toLocaleString()} GNF, Dépense: ${montantDepense.toLocaleString()} GNF.`);
    }

    // 3. Créer la dépense (elle est validée par défaut)
    const depense = new Depense({
        montant: montantDepense,
        motif,
        justificatif,
        ouvertureCaisse: ouvertureCaisseId,
        gerant: gerantId,
        boutique: boutiqueId,
        // Le statut est 'VALIDEE' par défaut dans le modèle maintenant
    });
    await depense.save();
    return depense;
};

exports.listerDepenses = async (filters) => {
    const query = {};
    if (filters.gerant) query.gerant = filters.gerant;
    if (filters.statut) query.statut = filters.statut;
    if (filters.boutique) query.boutique = filters.boutique;

    if (filters.startDate || filters.endDate) {
        query.createdAt = {};
        if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
        if (filters.endDate) {
            const end = new Date(filters.endDate);
            end.setHours(23, 59, 59, 999);
            query.createdAt.$lte = end;
        }
    }

    return await Depense.find(query).populate('gerant', 'nom').populate('boutique', 'nom').sort({ createdAt: -1 });
};


// --- GESTION RAPPORTS (ADMIN) ---

exports.validerRapport = async ({ rapportId, adminId, commentairesAdmin }) => {
    const rapport = await RapportCaisse.findById(rapportId).populate('gerant boutique');
    if (!rapport) throw new Error("Rapport introuvable.");
    if (rapport.statut !== 'EN_ATTENTE') throw new Error("Ce rapport a déjà été traité.");

    // 1. Mettre à jour le rapport
    rapport.statut = 'VALIDE';
    rapport.adminValidateur = adminId;
    rapport.dateValidation = new Date();
    rapport.commentairesAdmin = commentairesAdmin;
    await rapport.save();

    // 2. Mettre à jour la caisse admin
    const caisseAdmin = await CaisseAdmin.getInstance();
    const admin = await User.findById(adminId);

    caisseAdmin.soldeActuel += rapport.soldeTheorique;
    caisseAdmin.historique.push({
        rapport: rapport._id,
        description: `Validation du rapport de caisse #${rapport._id.toString().slice(-6)}`,
        montant: rapport.soldeTheorique,
        dateValidation: rapport.dateValidation,
        gerant: rapport.gerant?.nom || 'Gérant supprimé',
        boutique: rapport.boutique?.nom || 'Boutique supprimée',
        admin: admin.nom,
    });
    await caisseAdmin.save();

    // Notifier le gérant de la validation
    if (admin) {
        notificationService.sendReportValidatedAlert(rapport, admin, commentairesAdmin)
            .catch(err => console.error("Erreur lors de la notification de validation de rapport :", err));
    }

    return rapport;
};

exports.listerRapports = async (filters) => {
    const query = {};
    if (filters.gerant) query.gerant = filters.gerant;
    if (filters.statut) query.statut = filters.statut;
    if (filters.boutique) query.boutique = filters.boutique;

    if (filters.startDate || filters.endDate) {
        query.createdAt = {};
        if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
        if (filters.endDate) {
            const end = new Date(filters.endDate);
            end.setHours(23, 59, 59, 999);
            query.createdAt.$lte = end;
        }
    }

    return await RapportCaisse.find(query).populate('gerant', 'nom').populate('boutique', 'nom').sort({ createdAt: -1 });
};

exports.rejeterRapport = async ({ rapportId, adminId, commentairesAdmin }) => {
    const rapport = await RapportCaisse.findById(rapportId).populate('boutique');
    if (!rapport) throw new Error("Rapport introuvable.");
    if (rapport.statut !== 'EN_ATTENTE') throw new Error("Ce rapport a déjà été traité.");
    if (!commentairesAdmin || commentairesAdmin.trim() === '') {
        throw new Error("Un commentaire est obligatoire pour rejeter un rapport.");
    }

    // 1. Mettre à jour le rapport
    rapport.statut = 'REJETE';
    rapport.adminValidateur = adminId;
    rapport.dateValidation = new Date(); // date de traitement
    rapport.commentairesAdmin = commentairesAdmin;
    await rapport.save();

    // 2. Notifier le gérant
    const admin = await User.findById(adminId);
    if (admin) {
        notificationService.sendReportRejectedAlert(rapport, admin, commentairesAdmin)
            .catch(err => console.error("Erreur lors de la notification de rejet de rapport :", err));
    }
    return rapport;
};

exports.getReportDetails = async ({ rapportId }) => {
    const rapport = await RapportCaisse.findById(rapportId)
        .populate('gerant', 'nom')
        .populate('boutique', 'nom')
        .lean();

    if (!rapport) {
        throw new Error("Rapport introuvable.");
    }

    const ouvertureCaisseId = rapport.ouvertureCaisse;

    // On ne prend que les ventes non annulées
    const ventes = await Vente.find({ ouvertureCaisse: ouvertureCaisseId, isCancelled: false })
        .populate('article', 'nom code')
        .sort({ createdAt: -1 })
        .lean();

    const depenses = await Depense.find({ ouvertureCaisse: ouvertureCaisseId })
        .sort({ createdAt: -1 })
        .lean();

    return { rapport, ventes, depenses };
};

// --- GESTION CAISSE ADMIN ---

exports.getCaisseAdmin = async () => {
    const caisse = await CaisseAdmin.getInstance();
    // On peut vouloir peupler les détails du rapport si nécessaire
    await caisse.populate('historique.rapport');
    return caisse;
};