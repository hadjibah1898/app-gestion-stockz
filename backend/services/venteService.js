const Vente = require('../models/Vente');
const Article = require('../models/Article');
const User = require('../models/User');
const Mouvement = require('../models/Mouvement');
const Client = require('../models/Client');
const DebtMovement = require('../models/DebtMovement');
const notificationService = require('./notificationService');
const mongoose = require('mongoose');
const { logAction } = require('./auditLogService');

/**
 * Traite un panier complet (plusieurs articles) avec gestion de stock, remise et dette client.
 */
exports.traiterPanier = async (items, userId, boutiqueId, hasRemise = false, clientId = null, montantPaye = null, echeanceDette = null, ouvertureCaisseId = null) => {
    try {
        // 1. SÉCURITÉ : Vérifier la session de caisse
        const sessionActive = await mongoose.model('OuvertureCaisse').findOne({ 
            _id: ouvertureCaisseId, 
            gerant: userId, 
            statut: 'OUVERTE' 
        });
        if (!sessionActive) throw new Error("Session de caisse invalide ou fermée.");

        const itemsVendus = [];
        const articlesPourMvt = [];
        let totalGeneralVente = 0;

        // 2. BOUCLE SUR LES ARTICLES DU PANIER
        for (const item of items) {
            const { article: articleId, quantite, remiseTemp, remiseType } = item;

            // Déduction du stock atomique
            const article = await Article.findOneAndUpdate(
                { _id: articleId, quantite: { $gte: quantite } },
                { $inc: { quantite: -quantite } },
                { new: true } 
            ).populate('boutique');

            if (!article) {
                const exists = await Article.findById(articleId);
                throw new Error(exists 
                    ? `Stock insuffisant pour "${exists.nom}". Dispo: ${exists.quantite}` 
                    : `Article introuvable ID: ${articleId}`);
            }

            // Calcul du prix unitaire (Logique de hiérarchie des prix)
            let prixUnitaire = article.prixVente;

            if (article.promoActive && article.promo > 0) {
                prixUnitaire = prixUnitaire * (1 - article.promo / 100);
            } else if (remiseTemp && remiseTemp > 0) {
                prixUnitaire = remiseType === 'pourcentage' 
                    ? prixUnitaire * (1 - remiseTemp / 100) 
                    : prixUnitaire - remiseTemp;
            } else if (article.remise > 0) {
                prixUnitaire = prixUnitaire * (1 - article.remise / 100);
            }

            // Sécurité anti-vente à perte
            if (prixUnitaire < article.prixAchat) {
                throw new Error(`Prix remisé (${prixUnitaire} GNF) inférieur au prix d'achat pour "${article.nom}".`);
            }

            const prixTotal = prixUnitaire * quantite;
            totalGeneralVente += prixTotal;

            // Création de l'entrée de vente
            const vente = await Vente.create({
                article: articleId,
                quantite,
                prixTotal,
                gerant: userId,
                boutique: boutiqueId,
                statut: 'finalisee',
                remiseAppliquee: remiseTemp || 0,
                remiseType: remiseType || 'montant',
                ouvertureCaisse: ouvertureCaisseId,
                client: clientId
            });

            itemsVendus.push(vente);
            articlesPourMvt.push({ 
                articleId: article._id, 
                nomArticle: article.nom, 
                quantite, 
                prixAchatUnitaire: article.prixAchat 
            });

            // Alerte stock faible
            if (article.quantite <= 10) {
                notificationService.sendLowStockAlert(article).catch(e => console.error(e));
            }
        }

        // 3. GESTION DU CLIENT ET DE LA DETTE (Centralisée)
        if (clientId) {
            const client = await Client.findById(clientId);
            if (client) {
                client.totalAchats += totalGeneralVente;

                // Commission ouvrier
                if (client.type === 'Ouvrier' && client.tauxCommission > 0) {
                    client.commission = (client.commission || 0) + (totalGeneralVente * client.tauxCommission / 100);
                }

                // Calcul de la dette
                const montantEncaissé = montantPaye !== null ? montantPaye : totalGeneralVente;
                const detteGeneree = totalGeneralVente - montantEncaissé;

                if (detteGeneree > 0) {
                    if (!echeanceDette) throw new Error("Échéance obligatoire pour une vente à crédit.");
                    
                    const soldeAnterieur = client.dette;
                    client.dette += detteGeneree;
                    client.echeanceDette = echeanceDette;

                    // Historique du mouvement de dette
                    await DebtMovement.create({
                        client: clientId,
                        type: 'CREATION',
                        montant: detteGeneree,
                        soldeAnterieur,
                        nouveauSolde: client.dette,
                        operateur: userId,
                        boutique: boutiqueId,
                        venteAssociee: itemsVendus[0]._id
                    });
                }
                await client.save();
            }
        }

        // 4. TRAÇABILITÉ GLOBALE (Mouvement de stock)
        const refVente = itemsVendus[0]?._id.toString().slice(-6).toUpperCase();
        await Mouvement.create({
            type: 'Vente',
            boutiqueSource: boutiqueId,
            articles: articlesPourMvt,
            operateur: userId,
            details: `Vente #${refVente} | Total: ${totalGeneralVente.toLocaleString()} GNF | Client: ${clientId ? 'Oui' : 'Comptant'}`
        });

        return itemsVendus;

    } catch (error) {
        console.error("ERREUR TRAITER_PANIER:", error.message);
        throw error;
    }
};

/**
 * Liste les ventes avec filtres et pagination
 */
exports.listerVentes = async (filter = {}, user = null) => {
    const page = parseInt(filter.page) || 1;
    const limit = filter.limit !== undefined ? parseInt(filter.limit) : 15;
    const query = {};

    if (filter.startDate || filter.endDate) {
        query.createdAt = {};
        if (filter.startDate) query.createdAt.$gte = new Date(filter.startDate);
        if (filter.endDate) {
            const end = new Date(filter.endDate);
            end.setHours(23, 59, 59, 999);
            query.createdAt.$lte = end;
        }
    }

    if (filter.showCancelledOnly === 'true') query.isCancelled = true;

    if (user && user.role === 'Gérant') {
        query.gerant = user.id;
        if (user.boutique) query.boutique = user.boutique;
    }

    const totalVentes = await Vente.countDocuments(query);
    const ventes = await Vente.find(query)
        .sort({ createdAt: -1 })
        .skip(limit > 0 ? (page - 1) * limit : 0)
        .limit(limit > 0 ? limit : 0)
        .populate('article', 'nom image code')
        .populate('gerant', 'nom')
        .populate('boutique', 'nom')
        .populate('client', 'nom');

    return { ventes, totalPages: limit > 0 ? Math.ceil(totalVentes / limit) : 1, currentPage: page };
};

/**
 * Annule une vente et restaure le stock
 */
exports.annulerVente = async (venteId, user, req) => {
    try {
        const vente = await Vente.findById(venteId);
        if (!vente || vente.isCancelled) throw new Error("Vente introuvable ou déjà annulée.");

        // Délai de 24h pour les gérants
        if (user.role === 'Gérant') {
            const diffInHours = (new Date() - new Date(vente.createdAt)) / (1000 * 60 * 60);
            if (diffInHours > 24) throw new Error("Délai d'annulation (24h) dépassé.");
        }

        const article = await Article.findById(vente.article);
        if (!article) throw new Error("Article supprimé, impossible de restaurer le stock.");

        // Restauration
        article.quantite += vente.quantite;
        await article.save();

        vente.isCancelled = true;
        await vente.save();

        // Audit & Mouvement
        await Mouvement.create({
            type: 'Annulation Vente',
            boutiqueSource: vente.boutique,
            articles: [{ articleId: article._id, nomArticle: article.nom, quantite: vente.quantite }],
            operateur: user.id,
            details: `Restauration suite annulation vente #${vente._id}`
        });

        // Enregistrement dans le Journal d'Audit (AuditLog) pour l'admin
        await logAction({
            req,
            user,
            action: 'CANCEL_SALE',
            entity: 'Vente',
            entityId: vente._id,
            details: { article: article.nom, quantite: vente.quantite, montant: vente.prixTotal },
            status: 'SUCCESS'
        });

        return { success: true };
    } catch (error) {
        throw error;
    }
};
/** * Récupère les détails d'une vente spécifique */
exports.getDetailsVente = async (venteId) => {
    const vente = await Vente.findById(venteId)
        .populate('article', 'nom image code')
        .populate('gerant', 'nom')        
        .populate('boutique', 'nom')
        .populate('client', 'nom');

    if (!vente) throw new Error("Vente introuvable.");

    return vente;
};