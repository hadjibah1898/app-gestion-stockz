const mongoose = require('mongoose');
const OuvertureCaisse = require('../models/OuvertureCaisse');
const Depense = require('../models/Depense');
const RapportCaisse = require('../models/RapportCaisse');
const CaisseAdmin = require('../models/CaisseAdmin');
const Vente = require('../models/Vente');
const DebtPayment = require('../models/DebtPayment');
const DebtMovement = require('../models/DebtMovement');
const commissionService = require('./commissionService');

// --- FONCTIONS UTILITAIRES INTERNES ---

/**
 * Convertit de manière sécurisée une valeur de la DB (Decimal128 ou autre) en nombre.
 */
const safeNum = (val) => {
    if (!val) return 0;
    // Gestion du format lean de MongoDB Decimal128
    const s = val.$numberDecimal ? val.$numberDecimal : val.toString();
    return parseFloat(s) || 0;
};

const calculerBilansSession = async (ouvertureCaisseId) => {
    // On s'assure d'avoir un ObjectId valide pour la requête
    const sessionOid = mongoose.isValidObjectId(ouvertureCaisseId) 
        ? new mongoose.Types.ObjectId(ouvertureCaisseId.toString())
        : null;

    if (!sessionOid) return { cashEnCaisse: 0, totalVentes: 0, totalDettesAccordees: 0, totalDepenses: 0, totalRecouvrement: 0, listeRecouvrements: [] };

    // 1. Ventes (Uniquement ce qui est payé cash au moment de la vente)
    const ventes = await Vente.find({ ouvertureCaisse: sessionOid, isCancelled: { $ne: true } }).lean();
    const totalVentes = Math.round(ventes.reduce((acc, v) => acc + safeNum(v.prixTotal), 0));
    const venteIds = ventes.map(v => v._id);
    const dettesAccordees = await DebtMovement.find({ venteAssociee: { $in: venteIds }, type: 'CREATION' }).lean();
    const totalDettesAccordees = Math.round(dettesAccordees.reduce((acc, d) => acc + safeNum(d.montant), 0));

    // 3. Recouvrements (Dettes payées durant cette session)
    // On ajoute populate('client', 'nom') pour récupérer le nom réel du client au lieu de son ID
    const remboursements = await DebtPayment.find({ ouvertureCaisse: sessionOid, statut: 'VALIDEE' }).populate('client', 'nom').lean();
    const totalRecouvrement = Math.round(remboursements.reduce((sum, p) => sum + safeNum(p.montant), 0));

    // Regroupement par client (Fusionner les montants si un client a payé plusieurs fois dans la session)
    const listeRecouvrementsGroupée = Object.values(remboursements.reduce((acc, curr) => {
        const clientId = curr.client?._id?.toString() || 'inconnu';
        if (!acc[clientId]) {
            acc[clientId] = { 
                client: { nom: curr.client?.nom || 'Client Inconnu' }, 
                montant: 0 
            };
        }
        acc[clientId].montant += safeNum(curr.montant);
        return acc;
    }, {}));

    // Calcul du total Mobile Money (Numérique RÉELLEMENT encaissé)
    const mobileModes = ['Orange Money', 'MobiCash', 'PayCard', 'Virement'];
    
    // Fintech sur les ventes (CA Net encaissé en Fintech)
    let totalMobileMoneySales = 0;
    ventes.forEach(v => {
        if (mobileModes.includes(v.modePaiement)) {
            const detteLiee = dettesAccordees.find(d => d.venteAssociee?.toString() === v._id.toString());
            totalMobileMoneySales += (safeNum(v.prixTotal) - (detteLiee ? safeNum(detteLiee.montant) : 0));
        }
    });

    // Fintech sur les recouvrements
    const totalMobileMoneyRecoveries = Math.round(remboursements
        .filter(p => mobileModes.includes(p.modePaiement))
        .reduce((sum, p) => sum + safeNum(p.montant), 0));

    const totalMobileMoney = Math.round(totalMobileMoneySales + totalMobileMoneyRecoveries);

    // 2. Dépenses de la session
    const depenses = await Depense.find({ ouvertureCaisse: sessionOid }).lean();
    const totalDepenses = Math.round(depenses.reduce((acc, d) => acc + safeNum(d.montant), 0));

    // Logique : Le Cash en Caisse (Physique) exclut le Mobile Money et les dettes
    const cashVentesSeul = totalVentes - totalDettesAccordees - totalMobileMoneySales;
    const cashRecouvrementSeul = totalRecouvrement - totalMobileMoneyRecoveries;
    const cashEnCaisse = cashVentesSeul + cashRecouvrementSeul - totalDepenses;

    console.log(`[DEBUG SESSION ${ouvertureCaisseId}] Brut: ${totalVentes} | Crédits: ${totalDettesAccordees} | Recouv: ${totalRecouvrement} | Dép: ${totalDepenses} | NET: ${cashEnCaisse}`);

    return {
        totalVentes,
        totalVentesCash: Math.round(cashVentesSeul),
        totalMobileMoney: totalMobileMoney,
        totalMobileMoneySales: totalMobileMoneySales,
        totalMobileMoneyRecoveries: totalMobileMoneyRecoveries,
        totalDettesAccordees,
        totalDepenses,
        totalRecouvrement,
        listeRecouvrements: listeRecouvrementsGroupée,
        nombreVentes: ventes.length,
        cashEnCaisse: cashEnCaisse
    };
};

// --- EXPORTS ---

exports.ouvrirCaisse = async ({ fondInitial, gerantId, boutiqueId }) => {
    // Nettoyage rigoureux du fond initial
    const cleanFond = typeof fondInitial === 'string' 
        ? fondInitial.replace(/[^0-9.]+/g, "") 
        : fondInitial;
    
    return await OuvertureCaisse.create({ 
        fondInitial: parseFloat(cleanFond) || 0, 
        gerant: gerantId, 
        boutique: boutiqueId 
    });
};

exports.fermerCaisseEtCreerRapport = async ({ ouvertureCaisseId, montantCloture, commentairesGérant, gerantId, paiementsCommissions }) => {
    const ouverture = await OuvertureCaisse.findById(ouvertureCaisseId);
    if (!ouverture) throw new Error("Caisse introuvable.");

    // Traitement des commissions si présentes
    if (paiementsCommissions && Array.isArray(paiementsCommissions)) {
        for (const p of paiementsCommissions) {
            await commissionService.processPayment({ 
                workerId: p.clientId, 
                montant: p.montant, 
                gerantId, 
                boutiqueId: ouverture.boutique, 
                ouvertureCaisseId 
            });
        }
    }

    const bilan = await calculerBilansSession(ouvertureCaisseId);
    const fondInit = safeNum(ouverture.fondInitial);
    
    const soldeTheorique = fondInit + bilan.cashEnCaisse;
    const ecart = (parseFloat(montantCloture?.toString()) || 0) - soldeTheorique;

    const rapport = await RapportCaisse.create({
        ouvertureCaisse: ouvertureCaisseId,
        gerant: gerantId,
        boutique: ouverture.boutique,
        fondInitial: ouverture.fondInitial,
        totalVentes: bilan.totalVentes,
        totalDettes: bilan.totalDettesAccordees,
        totalMobileMoney: bilan.totalMobileMoney,
        totalMobileMoneyRecoveries: bilan.totalMobileMoneyRecoveries,
        totalRecouvrement: bilan.totalRecouvrement, // Correspond maintenant au schéma
        totalDepensesApprouvees: bilan.totalDepenses, // Correspond maintenant au schéma
        soldeTheorique,
        montantCloture,
        ecart,
        commentairesGérant,
        statut: 'EN_ATTENTE' // Assurer le statut initial pour la validation
    });

    ouverture.statut = 'FERMEE';
    ouverture.dateFermeture = new Date();
    await ouverture.save();

    return rapport;
};

exports.validerRapport = async ({ rapportId, adminId, commentairesAdmin }) => {
    try {
        const rapport = await RapportCaisse.findById(rapportId).populate('gerant boutique');
        if (!rapport) {
            throw new Error("Rapport introuvable.");
        }
        if (rapport.statut !== 'EN_ATTENTE') {
            throw new Error(`Opération impossible : Ce rapport est déjà ${rapport.statut.toLowerCase()}.`);
        }

        const boutiqueNom = rapport.boutique?.nom || "Boutique inconnue";
        const gerantNom = rapport.gerant?.nom || "Gérant inconnu";

        // 1. Mise à jour du rapport
        rapport.statut = 'VALIDE'; // Cohérence avec le frontend qui attend 'VALIDE'
        rapport.adminValidateur = adminId;
        rapport.commentairesAdmin = commentairesAdmin;
        rapport.dateValidation = new Date();
        await rapport.save();

        // 2. Transfert vers la Caisse Centrale (On transfère le montant RÉEL déclaré par le gérant)
        const caisseAdmin = await CaisseAdmin.getInstance();
        await caisseAdmin.ajouterMouvement({
            rapport: rapport._id,
            montant: rapport.montantCloture,
            description: `Validation rapport : ${boutiqueNom} - Gérant: ${gerantNom}`,
            typeMouvement: 'ENTREE',
            gerant: rapport.gerant._id,
            boutique: rapport.boutique._id,
            admin: adminId
        });

        return rapport;
    } catch (error) {
        throw error;
    }
};

exports.rejeterRapport = async ({ rapportId, adminId, commentairesAdmin }) => {
    return await RapportCaisse.findByIdAndUpdate(
        rapportId,
        { 
            statut: 'REJETE', 
            adminValidateur: adminId, 
            commentairesAdmin,
            dateValidation: new Date()
        },
        { new: true }
    );
};

exports.getCaisseAdmin = async () => {
    const caisseAdmin = await CaisseAdmin.getInstance();
    console.log('getCaisseAdmin - Solde Actuel de la Caisse Admin:', caisseAdmin.soldeActuel);
    return caisseAdmin;
};

exports.getReportDetails = async ({ rapportId }) => {
    const rapport = await RapportCaisse.findById(rapportId)
        .populate('gerant', 'nom')
        .populate('boutique', 'nom adresse telephone')
        .populate('adminValidateur', 'nom')
        .lean();

    if (!rapport) throw new Error("Rapport introuvable.");

    // S'assurer que l'ID d'ouverture de caisse est valide avant de l'utiliser dans les requêtes
    if (!rapport.ouvertureCaisse || !mongoose.isValidObjectId(rapport.ouvertureCaisse)) {
        console.error(`ID d'ouverture de caisse invalide ou manquant pour le rapport ${rapportId}: ${rapport.ouvertureCaisse}`);
        throw new Error("ID d'ouverture de caisse invalide ou manquant pour ce rapport.");
    }

    // Récupérer les détails granulaires pour le PDF
    // Utilisation de { $ne: true } pour la cohérence avec le calcul du bilan
    try {
        const [ventes, depenses, remboursements] = await Promise.all([
            Vente.find({ ouvertureCaisse: rapport.ouvertureCaisse, isCancelled: { $ne: true } }).populate('article', 'nom code').lean(),
            Depense.find({ ouvertureCaisse: rapport.ouvertureCaisse }).lean(),
            DebtPayment.find({ ouvertureCaisse: rapport.ouvertureCaisse, statut: 'VALIDEE' }).populate('client', 'nom').lean()
        ]);

        // Récupérer les dettes accordées (crédits) lors des ventes de cette session
        const venteIds = ventes.map(v => v._id);
        const dettesAccordees = await DebtMovement.find({ 
            venteAssociee: { $in: venteIds }, 
            type: 'CREATION' 
        }).populate('client', 'nom').lean();

        // Nettoyage des montants pour éviter les objets Decimal128 dans le frontend
        const rapportNettoye = {
            ...rapport,
            fondInitial: safeNum(rapport.fondInitial),
            totalVentes: safeNum(rapport.totalVentes),
            totalDettes: safeNum(rapport.totalDettes),
            totalMobileMoney: safeNum(rapport.totalMobileMoney),
            totalRecouvrement: safeNum(rapport.totalRecouvrement),
            totalDepensesApprouvees: safeNum(rapport.totalDepensesApprouvees),
            soldeTheorique: safeNum(rapport.soldeTheorique),
            montantCloture: safeNum(rapport.montantCloture),
            ecart: safeNum(rapport.ecart)
        };

        return { rapport: rapportNettoye, ventes, depenses, remboursements, dettesAccordees };
    } catch (error) {
        console.error(`Erreur lors de la récupération des détails du rapport ${rapportId}:`, error);
        throw new Error(`Erreur lors de la récupération des détails du rapport: ${error.message}`);
    }
};

/**
 * Statistiques en temps réel pour la modale de clôture
 */
exports.getStatistiquesSession = async (gerantId) => {
    const ouverture = await OuvertureCaisse.findOne({ gerant: gerantId, statut: 'OUVERTE' }).lean();
    if (!ouverture) return { soldeTheorique: 0, totalVentes: 0, totalRecouvrement: 0 };

    const bilan = await calculerBilansSession(ouverture._id);
    const fondInitial = Math.round(parseFloat(ouverture.fondInitial?.toString()) || 0);
    const soldeTheorique = Math.round(fondInitial + bilan.cashEnCaisse);
    
    return {
        fondInitial: fondInitial,
        ...bilan,
        soldeTheorique: soldeTheorique
    };
};

exports.getStatutCaisse = async (gerantId) => {
    const ouverture = await OuvertureCaisse.findOne({ gerant: gerantId, statut: 'OUVERTE' }).populate('boutique').lean();
    if (!ouverture) return null;
    const bilan = await calculerBilansSession(ouverture._id);

    // On s'assure que le fond initial est bien lu, même en format Decimal128
    const fondInitialNum = parseFloat(ouverture.fondInitial?.toString()) || 
                           (typeof ouverture.fondInitial === 'number' ? ouverture.fondInitial : 0);

    return { 
        ...ouverture, 
        session: { 
            ...bilan, 
            cashReelActuel: Math.max(0, fondInitialNum + bilan.cashEnCaisse)
        } 
    };
};

exports.listerDepenses = async (queryFilters) => {
    try {
        const page = parseInt(queryFilters.page) || 1;
        const limit = parseInt(queryFilters.limit) || 10;

        const filters = {};
        // Nettoyage des filtres pour éviter les chaînes vides
        if (queryFilters.gerant) filters.gerant = queryFilters.gerant;
        if (queryFilters.boutique) filters.boutique = queryFilters.boutique;

        const totalCount = await Depense.countDocuments(filters);
        const data = await Depense.find(filters)
            .populate('gerant boutique')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        return { data, totalPages: Math.ceil(totalCount / limit), currentPage: page, totalCount };
    } catch (error) {
        console.error("Erreur lors de la récupération des dépenses:", error);
        throw new Error("Impossible de lister les dépenses.");
    }
};

exports.listerRapports = async (queryFilters) => {
    const page = parseInt(queryFilters.page) || 1;
    const limit = parseInt(queryFilters.limit) || 10;
    const filters = {};

    // On ne construit le filtre que pour les valeurs présentes et non vides
    if (queryFilters.gerant) filters.gerant = queryFilters.gerant;
    if (queryFilters.boutique) filters.boutique = queryFilters.boutique;

    if (queryFilters.startDate || queryFilters.endDate) {
        const dateFilter = {};
        if (queryFilters.startDate) {
            const start = new Date(queryFilters.startDate);
            if (!isNaN(start)) dateFilter.$gte = start;
        }
        if (queryFilters.endDate) {
            const end = new Date(queryFilters.endDate);
            if (!isNaN(end)) {
                end.setHours(23, 59, 59, 999);
                dateFilter.$lte = end;
            }
        }
        if (Object.keys(dateFilter).length > 0) filters.createdAt = dateFilter;
    }

    const totalCount = await RapportCaisse.countDocuments(filters);
    const rapportsRaw = await RapportCaisse.find(filters)
        .populate('gerant boutique')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
    
    const formattedRapports = rapportsRaw.map(r => ({
        ...r,
        fondInitial: safeNum(r.fondInitial),
        totalVentes: safeNum(r.totalVentes),
        totalDettes: safeNum(r.totalDettes),
        totalMobileMoney: safeNum(r.totalMobileMoney),
        totalMobileMoneyRecoveries: safeNum(r.totalMobileMoneyRecoveries || 0),
        totalRecouvrement: safeNum(r.totalRecouvrement),
        totalDepensesApprouvees: safeNum(r.totalDepensesApprouvees),
        soldeTheorique: safeNum(r.soldeTheorique),
        montantCloture: safeNum(r.montantCloture),
        ecart: safeNum(r.ecart)
    }));

    return {
        data: formattedRapports,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        totalCount
    };
};

exports.creerDepense = async ({ montant, motif, justificatif, ouvertureCaisseId, gerantId, boutiqueId }) => {
    const montantDepense = parseFloat(montant);
    if (isNaN(montantDepense) || montantDepense <= 0) {
        throw new Error("Le montant de la dépense doit être un nombre positif.");
    }

    const bilan = await calculerBilansSession(ouvertureCaisseId);
    const ouverture = await OuvertureCaisse.findById(ouvertureCaisseId).lean();
    if (!ouverture) throw new Error("Session de caisse introuvable.");

    // Forcer la conversion du fond initial
    const fondInit = parseFloat(ouverture.fondInitial?.toString() || ouverture.fondInitial) || 0;
    const dispo = fondInit + bilan.cashEnCaisse;

    if (montantDepense > dispo) {
        throw new Error(`Fonds insuffisants. Disponible: ${Math.floor(dispo).toLocaleString()} GNF (Fond: ${fondInit}, Cash Session: ${bilan.cashEnCaisse})`);
    }

    return await Depense.create({ 
        montant: montantDepense, motif, justificatif, 
        ouvertureCaisse: ouvertureCaisseId, 
        gerant: gerantId, 
        boutique: boutiqueId, 
        statut: 'VALIDEE' 
    });
};