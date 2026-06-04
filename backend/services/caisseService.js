const mongoose = require('mongoose');
const OuvertureCaisse = require('../models/OuvertureCaisse');
const Depense = require('../models/Depense');
const RapportCaisse = require('../models/RapportCaisse');
const CaisseAdmin = require('../models/CaisseAdmin');
const Boutique = require('../models/Boutique');
const Vente = require('../models/Vente');
const DebtPayment = require('../models/DebtPayment');
const DebtMovement = require('../models/DebtMovement');
const commissionService = require('./commissionService');
const venteService = require('./venteService');

// --- FONCTIONS UTILITAIRES INTERNES ---

/**
 * Convertit de manière sécurisée une valeur de la DB (Decimal128 ou autre) en nombre.
 */
const safeNum = (val) => {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseFloat(val) || 0;
  if (typeof val === 'object' && val.$numberDecimal) {
    return parseFloat(val.$numberDecimal) || 0;
  }
  return 0;
};

const calculerBilansSession = async (ouvertureCaisseId) => {
    // Extraire l'ID si c'est un objet (Document Mongoose)
    const id = (ouvertureCaisseId && typeof ouvertureCaisseId === 'object' && ouvertureCaisseId._id) 
        ? ouvertureCaisseId._id 
        : ouvertureCaisseId;

    const sessionOid = mongoose.isValidObjectId(id) 
        ? new mongoose.Types.ObjectId(id.toString())
        : null;

    if (!sessionOid) return { cashEnCaisse: 0, totalVentes: 0, totalDettesAccordees: 0, totalDepenses: 0, totalRecouvrement: 0, listeRecouvrements: [] };

    // 1. Ventes : On récupère tout pour le CA global (Règle n°2)
    const ventes = await Vente.find({ ouvertureCaisse: sessionOid, isCancelled: { $ne: true } }).lean();
    const totalVentes = Math.round(ventes.reduce((acc, v) => acc + safeNum(v.prixTotal), 0) || 0);
    
    // Filtrage des ventes réellement encaissées pour le calcul du cash physique (Règle n°1 & 2)
    const ventesFinalisees = ventes.filter(v => v.statut === 'finalisee');
    const totalVentesFinalisees = Math.round(ventesFinalisees.reduce((acc, v) => acc + safeNum(v.prixTotal), 0) || 0);

    // Règle n°2 : On ne déduit que les dettes liées à des ventes encaissées (finalisées)
    const finalizedVenteIds = ventesFinalisees.map(v => v._id);
    const dettesAccordees = await DebtMovement.find({ 
        venteAssociee: { $in: finalizedVenteIds }, 
        type: 'CREATION' 
    }).lean();
    const totalDettesAccordees = Math.round(dettesAccordees.reduce((acc, d) => acc + safeNum(d.montant), 0) || 0);

    // 3. Recouvrements (Dettes payées durant cette session)
    // Règle n°2 : Seuls les paiements VALIDEE comptent dans le cash
    const remboursements = await DebtPayment.find({ ouvertureCaisse: sessionOid, statut: 'VALIDEE' }).populate('client', 'nom').lean();
    const totalRecouvrement = Math.round(remboursements.reduce((sum, p) => sum + safeNum(p.montant), 0) || 0);

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
    // Règle n°2 : Isolation Fintech
    for (const v of ventesFinalisees) {
        if (mobileModes.includes(v.modePaiement)) {
            const detteLiee = dettesAccordees.find(d => d.venteAssociee && d.venteAssociee.toString() === v._id.toString());
            const montantDette = detteLiee ? safeNum(detteLiee.montant) : 0;
            totalMobileMoneySales += (safeNum(v.prixTotal) - montantDette);
        }
    }

    // Fintech sur les recouvrements
    const totalMobileMoneyRecoveries = Math.round(remboursements
        .filter(p => mobileModes.includes(p.modePaiement))
        .reduce((sum, p) => sum + safeNum(p.montant), 0));

    const totalMobileMoney = Math.round(totalMobileMoneySales + totalMobileMoneyRecoveries);

    // 2. Dépenses de la session
    const depenses = await Depense.find({ ouvertureCaisse: sessionOid }).lean();
    const totalDepenses = Math.round(depenses.reduce((acc, d) => acc + safeNum(d.montant), 0) || 0);

    // Formule Règle n°2 : Cash Physique = (Ventes Finalisées - Dettes - FintechSales) + (Recouv. - FintechRecouv.) - Dépenses
    const cashVentesSeul = totalVentesFinalisees - totalDettesAccordees - totalMobileMoneySales;
    const cashRecouvrementSeul = totalRecouvrement - totalMobileMoneyRecoveries;
    const cashEnCaisse = Math.round(cashVentesSeul + cashRecouvrementSeul - totalDepenses);

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

exports.fermerCaisseEtCreerRapport = async ({ 
    ouvertureCaisseId, 
    ouvertureCaisse, // Fallback pour les données provenant de preparerRapportCloture
    montantCloture, 
    soldeReel, // Fallback si le contrôleur passe soldeReel
    commentairesGérant,
    commentairesGerant, 
    gerantId,
    gérantId,
    gerant, // Fallback pour les données provenant de preparerRapportCloture
    paiementsCommissions 
}) => {
    // 0. Standardisation des entrées
    const finalGerantId = gerantId || gérantId || gerant;
    const finalCommentaires = commentairesGérant || commentairesGerant;
    const finalMontantCloture = parseFloat(montantCloture?.toString() || soldeReel?.toString()) || 0;
    const targetCaisseId = ouvertureCaisseId || ouvertureCaisse;

    // 1. Vérifier l'ouverture de caisse
    let ouverture;
    
    // Si targetCaisseId est déjà un document Mongoose (cas du middleware)
    if (targetCaisseId && typeof targetCaisseId === 'object' && targetCaisseId.statut) {
        ouverture = targetCaisseId;
    } 
    // Sinon recherche par identifiant
    else if (targetCaisseId && mongoose.isValidObjectId(targetCaisseId)) {
        ouverture = await OuvertureCaisse.findById(targetCaisseId);
    }
    // Fallback : Chercher la session ouverte actuelle pour ce gérant si l'ID est manquant
    else if (!ouverture && finalGerantId) {
        ouverture = await OuvertureCaisse.findOne({ gerant: finalGerantId, statut: 'OUVERTE' });
    }

    if (!ouverture) throw new Error("Caisse introuvable.");

    // SÉCURITÉ : Vérifier si un rapport existe déjà pour cette session (Évite l'erreur E11000)
    const rapportExistant = await RapportCaisse.findOne({ ouvertureCaisse: ouverture._id });
    if (rapportExistant) {
        console.warn(`[Caisse] Tentative de clôture d'une session (${ouverture._id}) ayant déjà un rapport.`);
        if (ouverture.statut === 'OUVERTE') {
            ouverture.statut = 'FERMEE';
            ouverture.dateFermeture = new Date();
            await ouverture.save();
        }
        return rapportExistant;
    }

    // 2. Forcer l’annulation des commandes non encaissées (Utiliser l'ID réel)
    await venteService.annulerCommandesNonEncaissees(ouverture._id);

    // 3. Traiter les commissions éventuelles
    if (paiementsCommissions && Array.isArray(paiementsCommissions)) {
        for (const p of paiementsCommissions) {
            await commissionService.processPayment({ 
                workerId: p.clientId, 
                montant: p.montant, 
                gerantId: finalGerantId, 
                boutiqueId: ouverture.boutique?._id || ouverture.boutique, 
                ouvertureCaisseId: ouverture._id 
            });
        }
    }

    // 4. Calculer le bilan de la session
    const bilan = await calculerBilansSession(ouverture._id);
    const fondInit = safeNum(ouverture.fondInitial || 0);
    const soldeTheorique = fondInit + bilan.cashEnCaisse;
    const ecart = finalMontantCloture - soldeTheorique;

    // 5. Créer le rapport de caisse
    const rapport = await RapportCaisse.create({
        ouvertureCaisse: ouverture._id,
        gerant: finalGerantId,
        boutique: ouverture.boutique?._id || ouverture.boutique,
        fondInitial: ouverture.fondInitial,
        totalVentes: bilan.totalVentes,
        totalDettes: bilan.totalDettesAccordees,
        totalMobileMoney: bilan.totalMobileMoney,
        totalMobileMoneyRecoveries: bilan.totalMobileMoneyRecoveries,
        totalRecouvrement: bilan.totalRecouvrement,
        totalDepensesApprouvees: bilan.totalDepenses,
        soldeTheorique,
        montantCloture: finalMontantCloture,
        ecart,
        commentairesGérant: finalCommentaires,
        statut: 'EN_ATTENTE'
    });

    // 6. Clôturer l’ouverture de caisse
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
exports.getStatistiquesSession = async (user) => {
    const userId = user.id || user._id;
    const boutiqueId = user.boutique?._id || user.boutique;

    // Un serveur consulte les stats de la boutique, un gérant les siennes
    const query = (user.role === 'Serveur') 
        ? { boutique: boutiqueId, statut: 'OUVERTE' }
        : { gerant: userId, statut: 'OUVERTE' };

    const ouverture = await OuvertureCaisse.findOne(query).lean();
    if (!ouverture) return { soldeTheorique: 0, totalVentes: 0, totalRecouvrement: 0 };

    const bilan = await calculerBilansSession(ouverture._id);
    const fondInitial = Math.round(parseFloat(ouverture.fondInitial?.toString()) || 0);
    const soldeTheorique = Math.round(fondInitial + bilan.cashEnCaisse);
    
    // SÉCURITÉ : Le compte de synchronisation ne doit pas être visible pour l'ADMIN
    let syncInfo = {};
    if (user.role !== 'Admin') {
        const unsyncedCount = await Vente.countDocuments({ ouvertureCaisse: ouverture._id, isSynced: { $ne: true } });
        syncInfo = { 
            ventesAttenteSynchro: unsyncedCount,
            showSyncButton: unsyncedCount > 0 
        };
    } else {
        syncInfo = { showSyncButton: false };
    }

    return {
        fondInitial: fondInitial,
        ...bilan,
        soldeTheorique: soldeTheorique,
        ...syncInfo
    };
};

exports.getStatutCaisse = async (user) => {
    const userId = user.id || user._id;
    const boutiqueId = user.boutique?._id || user.boutique;

    // Recherche par boutique pour les serveurs pour qu'ils voient la caisse ouverte par le gérant
    const query = (user.role === 'Serveur')
        ? { boutique: boutiqueId, statut: 'OUVERTE' }
        : { gerant: userId, statut: 'OUVERTE' };

    const ouverture = await OuvertureCaisse.findOne(query).populate('boutique').lean();
    if (!ouverture) return null;
    const bilan = await calculerBilansSession(ouverture._id);

    // On s'assure que le fond initial est bien lu, même en format Decimal128
    const fondInitialNum = parseFloat(ouverture.fondInitial?.toString()) || 
                           (typeof ouverture.fondInitial === 'number' ? ouverture.fondInitial : 0);

    // SÉCURITÉ : Le compte de synchronisation ne doit pas être visible pour l'ADMIN
    let syncInfo = {};
    if (user.role !== 'Admin') {
        const unsyncedCount = await Vente.countDocuments({ ouvertureCaisse: ouverture._id, isSynced: { $ne: true } });
        syncInfo = { 
            ventesAttenteSynchro: unsyncedCount,
            showSyncButton: unsyncedCount > 0 
        };
    } else {
        syncInfo = { showSyncButton: false };
    }

    return { 
        ...ouverture, 
        ...syncInfo,
        session: { 
            ...bilan, 
            cashReelActuel: Math.max(0, fondInitialNum + bilan.cashEnCaisse)
        } 
    };
};

exports.listerDepenses = async (queryFilters, user = null) => {
    try {
        const page = parseInt(queryFilters.page) || 1;
        const limit = parseInt(queryFilters.limit) || 10;

        const filters = {};

        // SÉCURITÉ MULTI-TENANT
        if (user && user.role === 'Admin') {
            const myBoutiques = await Boutique.find({ createur: user.id }).select('_id');
            const myIds = myBoutiques.map(b => b._id.toString());
            
            if (queryFilters.boutique) {
                if (!myIds.includes(queryFilters.boutique.toString())) {
                    filters.boutique = { $in: [] }; 
                } else {
                    filters.boutique = queryFilters.boutique;
                }
            } else {
                filters.boutique = { $in: myBoutiques.map(b => b._id) };
            }
        } else if (queryFilters.boutique) {
            filters.boutique = queryFilters.boutique;
        }

        // Nettoyage des filtres pour éviter les chaînes vides
        if (queryFilters.gerant) filters.gerant = queryFilters.gerant;

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

exports.listerRapports = async (queryFilters, user = null) => {
    const page = parseInt(queryFilters.page) || 1;
    const limit = parseInt(queryFilters.limit) || 10;
    const filters = {};

    // SÉCURITÉ MULTI-TENANT
    if (user && user.role === 'Admin') {
        const myBoutiques = await Boutique.find({ createur: user.id }).select('_id');
        const myIds = myBoutiques.map(b => b._id.toString());
        
        if (queryFilters.boutique) {
            if (!myIds.includes(queryFilters.boutique.toString())) {
                filters.boutique = { $in: [] }; 
            } else {
                filters.boutique = queryFilters.boutique;
            }
        } else {
            filters.boutique = { $in: myBoutiques.map(b => b._id) };
        }
    } else if (queryFilters.boutique) {
        filters.boutique = queryFilters.boutique;
    }

    // On ne construit le filtre que pour les valeurs présentes et non vides
    if (queryFilters.gerant) filters.gerant = queryFilters.gerant;

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