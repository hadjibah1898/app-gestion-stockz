/**
 * @file caisseService.js
 * @description Service de gestion des sessions de caisse (ouverture, fermeture, rapports).
 */

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
const User = require('../models/User');
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

exports.safeNum = safeNum;

const calculerBilansSession = async (ouvertureCaisseId) => {
    const id = (ouvertureCaisseId && typeof ouvertureCaisseId === 'object' && ouvertureCaisseId._id) 
        ? ouvertureCaisseId._id 
        : ouvertureCaisseId;

    const sessionOid = mongoose.isValidObjectId(id) 
        ? new mongoose.Types.ObjectId(id.toString())
        : null;

    if (!sessionOid) return { cashEnCaisse: 0, totalVentes: 0, totalDettesAccordees: 0, totalDepenses: 0, totalRecouvrement: 0, listeRecouvrements: [] };

    const ventes = await Vente.find({ ouvertureCaisse: sessionOid, isCancelled: { $ne: true } }).lean();
    const totalVentes = Math.round(ventes.reduce((acc, v) => acc + safeNum(v.prixTotal), 0) || 0);
    
    const ventesFinalisees = ventes.filter(v => v.statut === 'finalisee');
    const totalVentesFinalisees = Math.round(ventesFinalisees.reduce((acc, v) => acc + safeNum(v.prixTotal), 0) || 0);

    const finalizedVenteIds = ventesFinalisees.map(v => v._id);
    const dettesAccordees = await DebtMovement.find({ 
        venteAssociee: { $in: finalizedVenteIds }, 
        type: 'CREATION' 
    }).lean();
    const totalDettesAccordees = Math.round(dettesAccordees.reduce((acc, d) => acc + safeNum(d.montant), 0) || 0);

    const remboursements = await DebtPayment.find({ ouvertureCaisse: sessionOid, statut: 'VALIDEE' }).populate('client', 'nom').lean();
    const totalRecouvrement = Math.round(remboursements.reduce((sum, p) => sum + safeNum(p.montant), 0) || 0);

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

    const mobileModes = ['Orange Money', 'MobiCash', 'PayCard', 'Virement'];
    
    let totalMobileMoneySales = 0;
    for (const v of ventesFinalisees) {
        if (mobileModes.includes(v.modePaiement)) {
            const detteLiee = dettesAccordees.find(d => d.venteAssociee && d.venteAssociee.toString() === v._id.toString());
            const montantDette = detteLiee ? safeNum(detteLiee.montant) : 0;
            totalMobileMoneySales += (safeNum(v.prixTotal) - montantDette);
        }
    }

    const totalMobileMoneyRecoveries = Math.round(remboursements
        .filter(p => mobileModes.includes(p.modePaiement))
        .reduce((sum, p) => sum + safeNum(p.montant), 0));

    const totalMobileMoney = Math.round(totalMobileMoneySales + totalMobileMoneyRecoveries);

    const depenses = await Depense.find({ ouvertureCaisse: sessionOid }).lean();
    const totalDepenses = Math.round(depenses.reduce((acc, d) => acc + safeNum(d.montant), 0) || 0);

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

exports.ouvrirCaisse = async ({ fondInitial, gerantId, boutiqueId, type = 'GERANT' }) => {
    const cleanFond = typeof fondInitial === 'string' 
        ? fondInitial.replace(/[^0-9.]+/g, "") 
        : fondInitial;
    
    return await OuvertureCaisse.create({ 
        fondInitial: parseFloat(cleanFond) || 0, 
        gerant: gerantId, 
        boutique: boutiqueId,
        type 
    });
};

exports.fermerCaisseEtCreerRapport = async ({ 
    ouvertureCaisseId, 
    ouvertureCaisse,
    montantCloture, 
    soldeReel,
    commentairesGérant,
    commentairesGerant, 
    gerantId,
    gérantId,
    gerant,
    paiementsCommissions 
}) => {
    const finalGerantId = gerantId || gérantId || gerant;
    const finalCommentaires = commentairesGérant || commentairesGerant;
    const finalMontantCloture = parseFloat(montantCloture?.toString() || soldeReel?.toString()) || 0;
    const targetCaisseId = ouvertureCaisseId || ouvertureCaisse;

    let ouverture;
    
    if (targetCaisseId && typeof targetCaisseId === 'object' && targetCaisseId.statut) {
        ouverture = targetCaisseId;
    } 
    else if (targetCaisseId && mongoose.isValidObjectId(targetCaisseId)) {
        ouverture = await OuvertureCaisse.findById(targetCaisseId);
    }
    else if (!ouverture && finalGerantId) {
        ouverture = await OuvertureCaisse.findOne({ gerant: finalGerantId, statut: 'OUVERTE' });
    }

    if (!ouverture) throw new Error("Caisse introuvable.");

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

    await venteService.annulerCommandesNonEncaissees(ouverture._id);

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
    const totalRapports = safeNum(ouverture.totalRapportsValides || 0);
    const soldeTheorique = fondInit + bilan.cashEnCaisse + totalRapports;
    const ecart = finalMontantCloture - soldeTheorique;

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

        rapport.statut = 'VALIDE';
        rapport.adminValidateur = adminId;
        rapport.commentairesAdmin = commentairesAdmin;
        rapport.dateValidation = new Date();
        await rapport.save();

        const caisseAdmin = await CaisseAdmin.getOrCreateForAdmin(adminId);
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

exports.getCaisseAdmin = async (adminId) => {
    const caisseAdmin = await CaisseAdmin.getOrCreateForAdmin(adminId);
    console.log('getCaisseAdmin - Solde Actuel de la Caisse Admin (' + adminId + '):', caisseAdmin.soldeActuel);
    return caisseAdmin;
};

exports.getReportDetails = async ({ rapportId }) => {
    const rapport = await RapportCaisse.findById(rapportId)
        .populate('gerant', 'nom')
        .populate('boutique', 'nom adresse telephone')
        .populate('adminValidateur', 'nom')
        .lean();

    if (!rapport) throw new Error("Rapport introuvable.");

    if (!rapport.ouvertureCaisse || !mongoose.isValidObjectId(rapport.ouvertureCaisse)) {
        console.error(`ID d'ouverture de caisse invalide ou manquant pour le rapport ${rapportId}: ${rapport.ouvertureCaisse}`);
        throw new Error("ID d'ouverture de caisse invalide ou manquant pour ce rapport.");
    }

    try {
        const [ventes, depenses, remboursements] = await Promise.all([
            Vente.find({ ouvertureCaisse: rapport.ouvertureCaisse, isCancelled: { $ne: true } }).populate('article', 'nom code').lean(),
            Depense.find({ ouvertureCaisse: rapport.ouvertureCaisse }).lean(),
            DebtPayment.find({ ouvertureCaisse: rapport.ouvertureCaisse, statut: 'VALIDEE' }).populate('client', 'nom').lean()
        ]);

        const venteIds = ventes.map(v => v._id);
        const dettesAccordees = await DebtMovement.find({ 
            venteAssociee: { $in: venteIds }, 
            type: 'CREATION' 
        }).populate('client', 'nom').lean();

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

    let query;
    if (user.role === 'Serveur') {
        query = { boutique: boutiqueId, statut: 'OUVERTE', type: 'GERANT' };
    } else if (user.role === 'Caissier') {
        query = { gerant: userId, statut: 'OUVERTE', type: 'CAISSIER' };
    } else {
        query = { gerant: userId, statut: 'OUVERTE', type: 'GERANT' };
    }

    const ouverture = await OuvertureCaisse.findOne(query).lean();
    if (!ouverture) return { soldeTheorique: 0, totalVentes: 0, totalRecouvrement: 0 };

    const bilan = await calculerBilansSession(ouverture._id);
    const fondInitial = Math.round(parseFloat(ouverture.fondInitial?.toString()) || 0);
    const totalRapports = Math.round(parseFloat(ouverture.totalRapportsValides?.toString()) || 0);
    const soldeTheorique = Math.round(fondInitial + bilan.cashEnCaisse + totalRapports);
    
    // Récupérer la liste détaillée des rapports caissiers validés
    let rapportsCaissiersValides = [];
    if (totalRapports > 0) {
        rapportsCaissiersValides = await RapportCaisse.find({
            boutique: boutiqueId,
            gerantValidateur: userId,
            statut: 'VALIDE_PAR_GERANT'
        })
        .populate('gerant', 'nom role')
        .select('fondInitial totalVentes totalMobileMoney totalDettes montantCloture ecart commentairesGérant createdAt')
        .sort({ createdAt: -1 })
        .lean();

        rapportsCaissiersValides = rapportsCaissiersValides.map(r => ({
            _id: r._id,
            caissierNom: r.gerant?.nom || 'Caissier inconnu',
            fondInitial: safeNum(r.fondInitial),
            totalVentes: safeNum(r.totalVentes),
            totalMobileMoney: safeNum(r.totalMobileMoney),
            totalDettes: safeNum(r.totalDettes),
            montantCloture: safeNum(r.montantCloture),
            ecart: safeNum(r.ecart),
            commentairesGérant: r.commentairesGérant,
            date: r.createdAt
        }));
    }
    
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
        totalRapportsValides: totalRapports,
        rapportsCaissiersValides,
        ...syncInfo
    };
};

exports.getStatutCaisse = async (user) => {
    const userId = user.id || user._id;
    const boutiqueId = user.boutique?._id || user.boutique;

    let query;
    if (user.role === 'Serveur') {
        query = { boutique: boutiqueId, statut: 'OUVERTE', type: 'GERANT' };
    } else if (user.role === 'Caissier') {
        query = { gerant: userId, statut: 'OUVERTE', type: 'CAISSIER' };
    } else {
        query = { gerant: userId, statut: 'OUVERTE', type: 'GERANT' };
    }

    const ouverture = await OuvertureCaisse.findOne(query).populate('boutique').lean();
    if (!ouverture) return null;
    const bilan = await calculerBilansSession(ouverture._id);

    const fondInitialNum = parseFloat(ouverture.fondInitial?.toString()) || 
                           (typeof ouverture.fondInitial === 'number' ? ouverture.fondInitial : 0);
    const totalRapports = Math.round(parseFloat(ouverture.totalRapportsValides?.toString()) || 0);

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
            cashReelActuel: Math.max(0, fondInitialNum + bilan.cashEnCaisse + totalRapports),
            totalRapportsValides: totalRapports
        } 
    };
};

exports.listerDepenses = async (queryFilters, user = null) => {
    try {
        const page = parseInt(queryFilters.page) || 1;
        const limit = parseInt(queryFilters.limit) || 10;

        const filters = {};

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

        // L'Admin ne voit QUE les rapports des gérants (pas ceux des caissiers)
        // Sauf s'il filtre déjà par un gérant spécifique
        if (queryFilters.gerant) {
            filters.gerant = queryFilters.gerant;
        } else {
            const gerantsIds = await User.find({ 
                role: 'Gérant', 
                boutique: { $in: myBoutiques.map(b => b._id) } 
            }).select('_id');
            if (gerantsIds.length > 0) {
                filters.gerant = { $in: gerantsIds.map(g => g._id) };
            } else {
                filters.gerant = { $in: [] };
            }
        }
    } else if (queryFilters.boutique) {
        filters.boutique = queryFilters.boutique;
        if (queryFilters.gerant) filters.gerant = queryFilters.gerant;
    } else {
        if (queryFilters.gerant) filters.gerant = queryFilters.gerant;
    }

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

    const fondInit = parseFloat(ouverture.fondInitial?.toString() || ouverture.fondInitial) || 0;
    const totalRapports = parseFloat(ouverture.totalRapportsValides?.toString() || 0) || 0;
    const dispo = fondInit + bilan.cashEnCaisse + totalRapports;

    if (montantDepense > dispo) {
        throw new Error(`Fonds insuffisants. Disponible: ${Math.floor(dispo).toLocaleString()} GNF (Fond: ${fondInit}, Cash Session: ${bilan.cashEnCaisse}, Rapports Caissiers: ${totalRapports})`);
    }

    return await Depense.create({ 
        montant: montantDepense, motif, justificatif, 
        ouvertureCaisse: ouvertureCaisseId, 
        gerant: gerantId, 
        boutique: boutiqueId, 
        statut: 'VALIDEE' 
    });
};

// ==========================================
// NOUVEAU : GESTION VALIDATION RAPPORTS CAISSIERS
// ==========================================

/**
 * Ajoute le montant d'un rapport de caissier validé à la caisse ouverte du gérant
 * Le montant est stocké dans totalRapportsValides (champ séparé du fondInitial)
 * pour préserver l'intégrité du fond de caisse initial.
 * 
 * @param {Object} params - Paramètres
 * @param {String} params.gerantId - ID du gérant qui valide
 * @param {Number} params.montant - Montant à ajouter
 * @param {String} params.rapportId - ID du rapport validé
 * @returns {Object} - L'ouverture de caisse mise à jour
 */
exports.ajouterMontantCaisseGerant = async ({ gerantId, montant, rapportId }) => {
    const ouvertureGerant = await OuvertureCaisse.findOne({
        gerant: gerantId,
        statut: 'OUVERTE',
        type: 'GERANT'
    });

    if (!ouvertureGerant) {
        throw new Error("Aucune caisse ouverte trouvée pour le gérant. Impossible d'ajouter le montant.");
    }

    const montantNum = parseFloat(montant) || 0;
    if (montantNum <= 0) {
        throw new Error("Le montant à ajouter doit être positif.");
    }

    // Stocker dans totalRapportsValides (champ séparé, ne corrompt PAS fondInitial)
    ouvertureGerant.totalRapportsValides = (ouvertureGerant.totalRapportsValides || 0) + montantNum;
    
    await ouvertureGerant.save();

    console.log(`[Caisse] Montant de ${montantNum} GNF ajouté au cumul rapports caissiers du gérant ${gerantId}. Total cumulé: ${ouvertureGerant.totalRapportsValides} GNF`);

    return ouvertureGerant;
};