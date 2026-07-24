/**
 * @file mouvementService.js
 * @description Service de gestion des mouvements de stock.
 */

const Mouvement = require('../models/Mouvement');
const Boutique = require('../models/Boutique');
const Article = require('../models/Article');

exports.listerMouvements = async (filter = {}, user = null) => {
    const { page, limit, statutTransfert, type, boutiqueSource, boutiqueDestination, boutiqueDestinationType, startDate, endDate, ...restFilters } = filter;
    const query = {};

    // Nettoyer les filtres additionnels pour ignorer les chaînes vides (évite l'erreur Cast to ObjectId)
    Object.keys(restFilters).forEach(key => {
        if (restFilters[key] && restFilters[key] !== '') {
            query[key] = restFilters[key];
        }
    });

    // SÉCURITÉ MULTI-TENANT
    if (user) {
        if (user.role === 'Admin') {
            const myBoutiques = await Boutique.find({ createur: user.id }).select('_id');
            const myBoutiqueIds = myBoutiques.map(b => b._id.toString());

            // If a specific boutique is requested, ensure it belongs to the admin
            if (boutiqueSource && boutiqueSource !== '' && !myBoutiqueIds.includes(boutiqueSource.toString())) {
                throw new Error("Accès refusé : La boutique source ne vous appartient pas.");
            }
            if (boutiqueDestination && boutiqueDestination !== '' && !myBoutiqueIds.includes(boutiqueDestination.toString())) {
                throw new Error("Accès refusé : La boutique destination ne vous appartient pas.");
            }

            // If no specific boutique filter, restrict to admin's boutiques
            if (!boutiqueSource && !boutiqueDestination) {
                query.$or = [
                    { boutiqueSource: { $in: myBoutiques.map(b => b._id) } },
                    { boutiqueDestination: { $in: myBoutiques.map(b => b._id) } }
                ];
            } else {
                if (boutiqueSource && boutiqueSource !== '') query.boutiqueSource = boutiqueSource;
                if (boutiqueDestination && boutiqueDestination !== '') query.boutiqueDestination = boutiqueDestination;
            }
        } else if (['Gérant', 'Serveur', 'Caissier'].includes(user.role)) {
            // Gérants/Serveurs only see movements related to their assigned boutique
            const userBoutiqueId = user.boutique?._id || user.boutique;
            if (!userBoutiqueId) {
                query._id = { $in: [] }; // Pas de boutique rattachée, aucun résultat (Sécurité multi-tenant)
            } else {
                query.$or = [
                    { boutiqueSource: userBoutiqueId },
                    { boutiqueDestination: userBoutiqueId }
                ];
            }
        }
    }

    // Filtrage par date
    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) {
            query.createdAt.$gte = new Date(startDate);
        }
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            query.createdAt.$lte = end;
        }
    }

    if (statutTransfert) query.statutTransfert = statutTransfert;
    if (type) query.type = type; // Add this filter to handle the 'type' parameter

    // Handle boutiqueDestinationType filter (requires population)
    // Only apply if boutiqueDestination is not already set (to avoid overwriting specific boutique filter)
    if (boutiqueDestinationType && !boutiqueDestination) {
        let destinationBoutiquesQuery = { type: boutiqueDestinationType };
        // If user is Admin, ensure destination boutiques belong to them
        if (user && user.role === 'Admin') {
            const myBoutiques = await Boutique.find({ createur: user.id }).select('_id');
            destinationBoutiquesQuery._id = { $in: myBoutiques.map(b => b._id) };
        }
        const destinationBoutiques = await Boutique.find(destinationBoutiquesQuery).select('_id');
        query.boutiqueDestination = { $in: destinationBoutiques.map(b => b._id) };
    }

    const limitNum = limit !== undefined ? parseInt(limit) : 15;
    const pageNum = parseInt(page) || 1;
    const skip = (pageNum - 1) * (limitNum || 0);

    const totalCount = await Mouvement.countDocuments(query);
    let mouvementsQuery = Mouvement.find(query)
        .populate('boutiqueSource', 'nom type createur')
        .populate('boutiqueDestination', 'nom type createur')
        .populate('fournisseur', 'nom')
        .populate('operateur', 'nom')
        .sort({ createdAt: -1 });

    if (limitNum > 0) {
        mouvementsQuery = mouvementsQuery.skip(skip).limit(limitNum);
    }

    const mouvements = await mouvementsQuery;

    return {
        data: mouvements,
        totalCount,
        totalPages: limitNum > 0 ? Math.ceil(totalCount / limitNum) : 1,
        currentPage: pageNum
    };
};

/**
 * Déclare une perte ou casse de stock manuellement
 */
exports.declarerPerte = async (data, user) => {
    const { articleId, quantite, raison, details } = data;
    
    // 1. Récupérer l'article
    const article = await Article.findById(articleId);
    if (!article) throw new Error("Article introuvable.");

    // 2. Vérification de sécurité (Multi-tenant)
    const userBoutiqueId = (user.boutique?._id || user.boutique || '').toString();
    if (user.role !== 'Admin' && article.boutique.toString() !== userBoutiqueId) {
        throw new Error("Accès refusé : vous ne pouvez gérer que le stock de votre propre boutique.");
    }

    const qtePerdue = parseFloat(quantite);
    if (isNaN(qtePerdue) || qtePerdue <= 0) throw new Error("Quantité de perte invalide.");

    if (article.quantite < qtePerdue) {
        throw new Error(`Stock insuffisant pour déclarer une perte de ${qtePerdue} unités. (Stock actuel: ${article.quantite})`);
    }

    // 3. Décrémenter le stock local
    article.quantite -= qtePerdue;
    await article.save();

    // 4. Enregistrer le mouvement de type 'Perte' pour la traçabilité
    const mouvement = await Mouvement.create({
        type: 'Perte', 
        boutiqueSource: article.boutique,
        articles: [{ 
            articleId: article._id, 
            nomArticle: article.nom, 
            quantite: qtePerdue,
            prixAchatUnitaire: article.prixAchat
        }],
        operateur: user.id,
        details: `Déclaration manuelle : ${raison}${details ? ` - ${details}` : ''}`
    });

    return mouvement;
};