/**
 * Article Controller
 * Gère les interactions API pour les articles, remises et ajustements.
 * Délègue la logique métier à articleService.
 */
const articleService = require('../services/articleService');
const notificationService = require('../services/notificationService');
const auditHelper = require('../utils/auditHelper');
const asyncHandler = require('../middleware/asyncHandler');
const Article = require('../models/Article');

// Demande de remise par le gérant (stocke la demande et notifie les admins)
exports.demanderRemise = asyncHandler(async (req, res) => {
    const { remise, clientNom } = req.body;
    const article = await articleService.modifierArticle(req.params.id, {
        remiseEnAttente: {
            valeur: remise,
            clientNom: clientNom || '',
            gerant: req.user.id,
            dateDemande: new Date()
        }
    }, req.user, req);

    await notificationService.sendRemiseRequestToAdmins(article, remise, req.user, clientNom);
    await auditHelper.logSuccess(req, req.user, 'REQUEST_DISCOUNT', 'Article', article._id, { remise, clientNom });

    res.status(200).json({ success: true, message: "Demande de remise envoyée à l'administrateur pour validation." });
});

exports.getAllArticles = asyncHandler(async (req, res) => {
    const result = await articleService.listerArticles(req.query, req.query.page, req.query.limit, req.user);
    res.status(200).json({ success: true, data: result });
});

exports.addArticle = asyncHandler(async (req, res) => {
    const article = await Article.create({ ...req.body, createur: req.user.id });
    await auditHelper.logSuccess(req, req.user, 'CREATE_ARTICLE', 'Article', article._id);
    res.status(201).json({ success: true, data: article });
});

exports.deleteArticle = asyncHandler(async (req, res) => {
    await articleService.supprimerArticle(req.params.id, req.user);
    await auditHelper.logSuccess(req, req.user, 'DELETE_ARTICLE', 'Article', req.params.id);
    res.status(200).json({ success: true, message: "Article supprimé avec succès" });
});

exports.updateArticle = asyncHandler(async (req, res) => {
    const article = await articleService.modifierArticle(req.params.id, req.body, req.user, req);
    res.status(200).json({ success: true, data: article });
});

exports.transferArticles = asyncHandler(async (req, res) => {
    const { sourceId, targetId, articles, details, nomTransporteur } = req.body;
    if (!sourceId || !targetId) {
        return res.status(400).json({ success: false, message: "Les boutiques source et destination sont requises." });
    }
    const result = await articleService.transfererStock(sourceId, targetId, articles, req.user, details, nomTransporteur);
    const movement = await result.populate('boutiqueSource boutiqueDestination operateur');

    await auditHelper.logSuccess(req, req.user, 'TRANSFER_STOCK', 'Article', null, { 
        sourceId, 
        targetId, 
        articlesCount: articles.length, 
        details 
    });

    res.status(200).json({ success: true, message: "Articles transférés avec succès.", data: movement });
});

/**
 * --- LOGIQUE DES AJUSTEMENTS (CORRECTIONS & ÉCARTS) ---
 */

exports.getAdjustments = asyncHandler(async (req, res) => {
    const adjustments = await articleService.listerAjustements(req.query, req.user);
    res.status(200).json({ success: true, data: adjustments });
});

exports.createAdjustment = asyncHandler(async (req, res) => {
    console.log('[DEBUG AJUSTEMENT] createAdjustment appelé - body:', JSON.stringify(req.body), '- user._id:', req.user._id, '- role:', req.user.role, '- boutique:', req.user.boutique);
    const adjustment = await articleService.demanderAjustement(req.body, req.user);
    console.log('[DEBUG AJUSTEMENT] Ajustement créé avec succès - id:', adjustment._id, '- gerant:', adjustment.gerant);
    res.status(201).json({ success: true, data: adjustment });
});

exports.validateAdjustment = asyncHandler(async (req, res) => {
    const { decision, commentaire } = req.body;
    const adjustment = await articleService.validerAjustement(req.params.id, decision, commentaire, req.user.id);
    res.status(200).json({ success: true, data: adjustment });
});

/**
 * @desc    Réapprovisionner une boutique secondaire depuis la boutique centrale
 * @route   POST /api/articles/restock
 * @access  Private/Admin
 */
exports.restockFromCentral = asyncHandler(async (req, res) => {
    const { targetId, articles, nomTransporteur } = req.body;
    const result = await articleService.effectuerReapprovisionnement(targetId, articles, req.user, nomTransporteur);
    const movement = await result.populate('boutiqueSource boutiqueDestination operateur');

    await auditHelper.logSuccess(req, req.user, 'RESTOCK_SHOP', 'Article', null, { 
        targetId, 
        articlesCount: articles.length,
        nomTransporteur
    });

    res.status(200).json({ success: true, message: "Articles réapprovisionnés avec succès.", data: movement });
});

exports.cancelTransfer = asyncHandler(async (req, res) => {
    const result = await articleService.annulerTransfert(req.params.id, req.user);
    res.status(200).json({ success: true, message: "Transfert annulé.", data: result });
});

exports.corrigerTransfert = asyncHandler(async (req, res) => {
    const { articles } = req.body;
    if (!articles || !Array.isArray(articles) || articles.length === 0) {
        return res.status(400).json({ success: false, message: "Liste d'articles requise." });
    }
    const result = await articleService.corrigerTransfert(req.params.id, articles, req.user);
    res.status(200).json({ success: true, message: result.message, data: result.data });
});

exports.remindManager = asyncHandler(async (req, res) => {
    const result = await articleService.relancerGerantTransfert(req.params.id, req.user);
    res.status(200).json({ success: true, data: result });
});

/**
 * Applique une promotion automatique sur les articles proches de la péremption
 */
exports.applyAutoPromo = asyncHandler(async (req, res) => {
    const { jours, pourcentage } = req.body;
    const result = await articleService.appliquerPromoPeremption(jours, pourcentage);
    
    await auditHelper.logSuccess(req, req.user, 'APPLY_AUTO_PROMO', 'Article', null, { jours, pourcentage, modifiedCount: result.modifiedCount });
    
    res.status(200).json({ 
        success: true,
        message: `${result.modifiedCount} articles ont été mis en promotion.`,
        modifiedCount: result.modifiedCount 
    });
});