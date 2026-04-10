const notificationService = require('../services/notificationService');
const { logAction } = require('../services/auditLogService'); // Assurez-vous que l'import est présent
// Demande de remise par le gérant (stocke la demande et notifie les admins)
exports.demanderRemise = async (req, res) => {
    try {
        if (req.user.role !== 'Gérant') {
            return res.status(403).json({ message: "Seul un gérant peut demander une remise." });
        }
        const articleId = req.params.id;
        const { remise, clientNom } = req.body;
        if (!remise || remise <= 0) {
            return res.status(400).json({ message: "La remise demandée doit être supérieure à 0%." });
        }
        // Stocker la demande dans le champ remiseEnAttente
        const article = await articleService.modifierArticle(articleId, {
            remiseEnAttente: {
                valeur: remise,
                clientNom: clientNom || '',
                gerant: req.user.id || req.user._id,
                dateDemande: new Date()
            }
        });
        // Notifier les admins
        await notificationService.sendRemiseRequestToAdmins(article, remise, req.user, clientNom);

        await logAction({
            req,
            user: req.user,
            action: 'REQUEST_DISCOUNT',
            entity: 'Article',
            entityId: article._id,
            details: { article: article.nom, remise: remise, client: clientNom },
            status: 'SUCCESS'
        });

        res.status(200).json({ message: "Demande de remise envoyée à l'administrateur pour validation." });
    } catch (error) {
        console.error("Erreur demande remise:", error);
        res.status(500).json({ message: "Erreur lors de la demande de remise." });
    }
};
const articleService = require('../services/articleService');

//  Nom synchronisé avec ton fichier de routes (articlesRoute.js)
// Mis à jour pour filtrer par rôle
exports.getAllArticles = async (req, res) => {
    try {
        const { page, limit, search, boutique, fournisseur, sort, order } = req.query;
        const filter = {};

        // Filtre de recherche (Nom ou Code)
        if (search) {
            filter.$or = [
                { nom: { $regex: search, $options: 'i' } },
                { code: { $regex: search, $options: 'i' } }
            ];
        }

        // Filtre par boutique (Admin filter param)
        if (boutique) {
            filter.boutique = boutique;
        }

        // Filtre par fournisseur
        if (fournisseur) {
            filter.fournisseur = fournisseur;
        }

        if (sort) {
            filter.sort = sort;
        }
        if (order) {
            filter.order = order;
        }

        // Si l'utilisateur connecté est un Gérant (info venant du token JWT via le middleware 'protect')
        if (req.user.role === 'Gérant') {
            // S'il n'a pas de boutique assignée, il ne voit aucun article.
            if (!req.user.boutique) {
                return res.status(200).json(page ? { data: [], totalPages: 0 } : []);
            }
            // On ajoute un filtre pour ne retourner que les articles de sa boutique.
            filter.boutique = req.user.boutique;
        }

        const articles = await articleService.listerArticles(filter, parseInt(page), parseInt(limit));
        res.status(200).json(articles);
    } catch (error) {
        console.error("Erreur getAllArticles:", error);
        res.status(500).json({ message: "Impossible de récupérer les articles" });
    }
};

//  Une seule version de addArticle (Gestion des articles 
exports.addArticle = async (req, res) => {
    // Action désactivée pour forcer l'utilisation du module d'approvisionnement
    return res.status(403).json({ message: "La création manuelle d'article est désactivée. Veuillez utiliser le module d'approvisionnement." });
};

//  Ajoute l'export pour la suppression 
exports.deleteArticle = async (req, res) => {
    try {
        const { data: articlesFound } = await articleService.listerArticles({ _id: req.params.id });
        await articleService.supprimerArticle(req.params.id);

        await logAction({
            req,
            user: req.user,
            action: 'DELETE_ARTICLE',
            entity: 'Article',
            entityId: req.params.id,
            details: { deletedArticle: articlesFound[0] },
            status: 'SUCCESS'
        });
        res.status(200).json({ message: "Article supprimé avec succès" });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateArticle = async (req, res) => {
    try {
        const articleId = req.params.id;
        const articleData = req.body;

        const articleModifie = await articleService.modifierArticle(articleId, articleData, req.user, req);

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

exports.transferArticles = async (req, res) => {
    try {
        const { sourceId, targetId, articles, details } = req.body;
        if (!sourceId || !targetId) {
            return res.status(400).json({ message: "Les boutiques source et destination sont requises." });
        }
        const result = await articleService.transfererStock(sourceId, targetId, articles, req.user, details);
        const movement = await result.populate('boutiqueSource boutiqueDestination operateur');

        await logAction({
            req,
            user: req.user,
            action: 'TRANSFER_STOCK',
            entity: 'Article',
            details: { sourceId, targetId, articles, details },
            status: 'SUCCESS'
        });

        res.status(200).json({ message: "Articles transférés avec succès.", movement });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Réapprovisionner une boutique secondaire depuis la boutique centrale
 * @route   POST /api/articles/restock
 * @access  Private/Admin
 */
exports.restockFromCentral = async (req, res) => {
    try {
        const { targetId, articles, details } = req.body;
        const result = await articleService.effectuerReapprovisionnement(targetId, articles, req.user, details);
        const movement = await result.populate('boutiqueSource boutiqueDestination operateur');

        await logAction({
            req,
            user: req.user,
            action: 'RESTOCK_SHOP',
            entity: 'Article',
            details: { targetId, articles, details },
            status: 'SUCCESS'
        });

        res.status(200).json({ message: "Articles réapprovisionnés avec succès.", movement });
    } catch (error) {
        res.status(error.statusCode || 500).json({ message: error.message });
    }
};