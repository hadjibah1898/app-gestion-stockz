const Vente = require('../models/vente');
const Article = require('../models/Article');

exports.traiterVente = async (articleId, quantite, userId, boutiqueId) => {
    try {
        // 1. Récupérer l'article
        const article = await Article.findById(articleId);
        if (!article) throw new Error("Article introuvable");

        // 2. Vérifier le stock
        if (article.quantite < quantite) {
            throw new Error(`Stock insuffisant. Disponible: ${article.quantite}`);
        }

        // 3. Calculer le total et préparer la vente
        const prixTotal = article.prixVente * quantite;
        const vente = new Vente({
            article: articleId,
            quantite,
            prixTotal,
            gerant: userId,
            boutique: boutiqueId
        });

        // 4. Mettre à jour le stock de l'article
        article.quantite -= quantite;
        
        await article.save();
        const savedVente = await vente.save();

        return savedVente;

    } catch (error) {
        throw error; // Renvoyer l'erreur au contrôleur
    }
};

// Nouvelle méthode pour traiter tout un panier en une seule transaction atomique
exports.traiterPanier = async (items, userId, boutiqueId) => {
    try {
        const resultats = [];

        for (const item of items) {
            // Correction pour correspondre aux données envoyées par le frontend (`article` et `quantite`)
            const { article: articleId, quantite } = item;

            // 1. Récupérer l'article
            const article = await Article.findById(articleId);
            if (!article) {
                throw new Error(`Article introuvable (ID: ${articleId})`);
            }

            // 2. Vérifier le stock
            if (article.quantite < quantite) {
                throw new Error(`Stock insuffisant pour l'article "${article.nom}". Disponible: ${article.quantite}, demandé: ${quantite}.`);
            }

            // 3. Mettre à jour le stock de l'article
            article.quantite -= quantite;
            await article.save();

            // 4. Créer l'enregistrement de la vente
            const prixTotal = article.prixVente * quantite;
            const vente = new Vente({
                article: articleId,
                quantite: quantite,
                prixTotal,
                gerant: userId,
                boutique: boutiqueId
            });
            // Sauvegarde simple sans transaction
            const savedVente = await vente.save();
            
            resultats.push(savedVente);
        }

        return resultats;
    } catch (error) {
        throw error;
    }
};

exports.listerVentes = async (filter = {}) => {
    return await Vente.find(filter).populate('article', 'nom').populate('gerant', 'nom').populate('boutique', 'nom');
};