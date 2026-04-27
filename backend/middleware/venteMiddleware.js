const Article = require('../models/Article');
const Client = require('../models/Client'); // Import du modèle Client
const mongoose = require('mongoose'); // Pour valider les ObjectId

/**
 * Middleware de sécurité et de validation pour le module de vente
 */

/**
 * Valide la requête de vente, y compris la propriété des articles, le stock,
 * et les informations de paiement/dette.
 */
exports.verifyArticlesBelongToBoutique = async (req, res, next) => {
    try {
        const { panier } = req.body;
        const userBoutiqueId = req.user.boutique ? req.user.boutique.toString() : null;

        // SÉCURITÉ : L'administrateur n'est pas autorisé à effectuer des ventes.
        // Son rôle est uniquement la supervision et la validation.
        if (req.user.role === 'Admin') {
            return res.status(403).json({ message: "Action refusée : Les administrateurs ne sont pas autorisés à effectuer des ventes." });
        }

        if (!panier || !Array.isArray(panier) || panier.length === 0) {
            return res.status(400).json({ message: "Le panier est vide ou invalide." });
        }

        // Vérifier si une boutique est assignée au gérant
        if (!userBoutiqueId) {
            return res.status(403).json({ message: "Action refusée : aucune boutique n'est assignée à votre compte." });
        }

        // Vérifier l'existence du client si un ID est fourni
        const { clientId, montantPaye, echeanceDette } = req.body;

        // Validation de la date d'échéance
        if (echeanceDette) {
            const dateEcheance = new Date(echeanceDette);
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Normaliser à minuit pour comparer uniquement la date

            if (dateEcheance < today) {
                return res.status(400).json({ message: "La date d'échéance de la dette ne peut pas être dans le passé." });
            }
        }

        if (montantPaye !== undefined && montantPaye < 0) {
            return res.status(400).json({ message: "Le montant payé ne peut pas être négatif." });
        }

        let client = null;
        if (clientId) {
            if (!mongoose.Types.ObjectId.isValid(clientId)) {
                return res.status(400).json({ message: "ID client invalide." });
            }
            client = await Client.findById(clientId);
            if (!client) {
                return res.status(404).json({ message: "Client introuvable." });
            }
        }

        // Pré-calculer le total du panier pour les validations de paiement/dette
        let totalPanier = 0;

        for (const item of panier) {
            const { article: articleId, quantite, remiseTemp } = item;

            // Validation de l'ID de l'article
            if (!mongoose.Types.ObjectId.isValid(articleId)) {
                return res.status(400).json({ message: `ID d'article invalide dans le panier : ${articleId}.` });
            }

            // Validation de la quantité
            if (!Number.isInteger(quantite) || quantite <= 0) {
                return res.status(400).json({ message: `La quantité pour l'article ${articleId} doit être un entier positif.` });
            }

            // Validation de la remise temporaire
            if (remiseTemp !== undefined && (isNaN(parseFloat(remiseTemp)) || parseFloat(remiseTemp) < 0)) {
                return res.status(400).json({ message: `La remise temporaire pour l'article ${articleId} doit être un nombre non négatif.` });
            }

            const article = await Article.findById(articleId);

            if (!article) {
                return res.status(404).json({ message: `L'article avec l'ID ${articleId} est introuvable.` });
            }

            // Vérifier que l'article appartient à la boutique du gérant
            if (article.boutique.toString() !== userBoutiqueId) {
                return res.status(403).json({ message: `Sécurité : L'article "${article.nom}" n'appartient pas à votre boutique.` });
            }

            // Vérifier le stock disponible
            if (article.quantite < quantite) {
                return res.status(400).json({ message: `Stock insuffisant pour l'article "${article.nom}". Disponible: ${article.quantite}, demandé: ${quantite}.` });
            }

            // Calculer le prix effectif pour le total du panier (simplifié pour le middleware)
            let prixUnitaire = article.prixVente; // Pour l'estimation rapide
            if (remiseTemp) prixUnitaire = Math.max(0, prixUnitaire - parseFloat(remiseTemp));
            totalPanier += prixUnitaire * quantite;
        }

        next();
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la validation de sécurité du panier.", error: error.message });
    }
};