const articleService = require('../services/articleService');

exports.getArticles = async (req, res) => {
    try {
        const result = await articleService.listerArticles(req.query, req.query.page, req.query.limit, req.user);
        res.status(200).json(result);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.createArticle = async (req, res) => {
    try {
        // Note: La création simple pourrait être dans un repository ou directement ici
        // Mais pour la cohérence, on suit la structure du projet
        const Article = require('../models/Article');
        const article = await Article.create({ ...req.body, createur: req.user.id });
        res.status(201).json(article);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.updateArticle = async (req, res) => {
    try {
        const article = await articleService.modifierArticle(req.params.id, req.body, req.user, req);
        res.status(200).json(article);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.deleteArticle = async (req, res) => {
    try {
        await articleService.supprimerArticle(req.params.id, req.user);
        res.status(200).json({ message: "Article supprimé avec succès" });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

/**
 * --- LOGIQUE DES AJUSTEMENTS (CORRECTIONS & ÉCARTS) ---
 */

exports.getAdjustments = async (req, res) => {
    try {
        const adjustments = await articleService.listerAjustements(req.query, req.user);
        res.status(200).json(adjustments);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.createAdjustment = async (req, res) => {
    try {
        const adjustment = await articleService.demanderAjustement(req.body, req.user);
        res.status(201).json(adjustment);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.validateAdjustment = async (req, res) => {
    try {
        const { decision, commentaire } = req.body;
        const adjustment = await articleService.validerAjustement(req.params.id, decision, commentaire, req.user.id);
        res.status(200).json(adjustment);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.applyAutoPromo = async (req, res) => {
    try {
        const { jours, pourcentage } = req.body;
        const result = await articleService.appliquerPromoPeremption(jours, pourcentage);
        res.status(200).json({ 
            message: `${result.modifiedCount} articles ont été mis en promotion.`,
            modifiedCount: result.modifiedCount 
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};