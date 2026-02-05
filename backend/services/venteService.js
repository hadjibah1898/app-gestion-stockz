const Vente = require('../models/vente');
const Article = require('../models/Article');
const mongoose = require('mongoose');

exports.traiterVente = async (articleId, quantite, userId) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // 1. Récupérer l'article (en utilisant la session pour le verrouillage)
        const article = await Article.findById(articleId).session(session);
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
            gerant: userId
        });

        // 4. Mettre à jour le stock de l'article
        article.quantite -= quantite;
        
        await article.save({ session });
        const savedVente = await vente.save({ session });

        // 5. Valider la transaction
        await session.commitTransaction();

        return savedVente;

    } catch (error) {
        // En cas d'erreur, annuler toutes les opérations
        await session.abortTransaction();
        throw error; // Renvoyer l'erreur au contrôleur
    } finally {
        // Terminer la session dans tous les cas
        session.endSession();
    }
};

exports.listerVentes = async () => {
    return await Vente.find().populate('article', 'nom').populate('gerant', 'nom');
};