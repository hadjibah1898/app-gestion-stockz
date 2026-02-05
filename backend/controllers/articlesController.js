const articleService = require('../services/articleService');

// ✅ Nom synchronisé avec ton fichier de routes (articlesRoute.js)
exports.getAllArticles = async (req, res) => {
    try {
        const articles = await articleService.listerArticles();
        res.status(200).json(articles);
    } catch (error) {
        res.status(500).json({ message: "Impossible de récupérer les articles" });
    }
};

// ✅ Une seule version de addArticle (Gestion des articles - Point 5.4 [cite: 40, 41])
exports.addArticle = async (req, res) => {
    try {
        // Le service gère la logique (Prix d'achat/vente - Point 5.4 [cite: 45])
        const article = await articleService.creerArticle(req.body);
        res.status(201).json(article);
    } catch (error) {
        console.error("❌ Erreur ArticleController:", error.message);
        // Si c'est une erreur de validation métier, renvoyer une erreur 400 (Bad Request)
        if (error.message.includes("prix de vente")) {
            return res.status(400).json({ message: error.message });
        }
        // Pour les autres erreurs, une erreur 500 générique est plus sûre
        res.status(500).json({ message: "Une erreur interne est survenue lors de la création de l'article." });
    }
};

// ✅ Ajoute l'export pour la suppression (Point 5.4 [cite: 43])
exports.deleteArticle = async (req, res) => {
    try {
        await articleService.supprimerArticle(req.params.id);
        res.status(200).json({ message: "Article supprimé avec succès" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateArticle = async (req, res) => {
    try {
        const articleId = req.params.id;
        const articleData = req.body;

        const articleModifie = await articleService.modifierArticle(articleId, articleData);

        res.status(200).json(articleModifie);
    } catch (error) {
        console.error("❌ Erreur ArticleController (update):", error.message);
        if (error.message.includes("prix de vente") || error.message.includes("Données de mise à jour vides")) {
            return res.status(400).json({ message: error.message });
        }
        if (error.message.includes("introuvable")) {
            return res.status(404).json({ message: error.message });
        }
        res.status(500).json({ message: "Une erreur interne est survenue lors de la modification de l'article." });
    }
};