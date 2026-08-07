/**
 * @file venteService.js
 * @description Service de traitement des ventes : création panier, annulation, listing, clôture caisse.
 */

const Vente = require('../models/Vente');
const Setting = require('../models/Setting');
const Boutique = require('../models/Boutique');
const Article = require('../models/Article');
const User = require('../models/User');
const Mouvement = require('../models/Mouvement');
const Client = require('../models/Client');
const DebtMovement = require('../models/DebtMovement');
const notificationService = require('./notificationService');
const OuvertureCaisse = require('../models/OuvertureCaisse');
const mongoose = require('mongoose');
const auditHelper = require('../utils/auditHelper');

// Variable locale pour le taux de pourboire (5% par défaut)
// Utilisée comme cache pour la performance lors des ventes
let currentTipPercentage = 0.05;

// Helper to safely convert value to number (handles Decimal128 from MongoDB)
// This is crucial for arithmetic operations on potentially mixed number types from the DB.
const safeNum = (value) => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return parseFloat(value) || 0;
    if (typeof value === 'object' && value.$numberDecimal) {
        return parseFloat(value.$numberDecimal) || 0;
    }
    return 0;
};
/**
 * Initialise ou synchronise le taux de pourboire depuis la base de données.
 */
const syncTipPercentage = async () => {
    try {
        let setting = await Setting.findOne({ key: 'tip_percentage' });
        if (!setting) {
            setting = await Setting.create({
                key: 'tip_percentage',
                value: 0.05,
                description: 'Taux de pourboire automatique pour les serveurs'
            });
        }
        currentTipPercentage = setting.value;
    } catch (error) {
        console.error("Erreur de synchronisation du taux de pourboire:", error);
    }
};

// Lancement de la synchronisation au démarrage du service
mongoose.connection.on('connected', () => {
    syncTipPercentage();
});

exports.updateTipConfig = async (newPercentage) => {
    const val = newPercentage / 100;
    await Setting.findOneAndUpdate(
        { key: 'tip_percentage' },
        { value: val },
        { upsert: true }
    );
    currentTipPercentage = val;
};

/**
 * Traite un panier complet (plusieurs articles) avec gestion de stock, remise et dette client.
 */
exports.traiterPanier = async (items, user, boutiqueId, hasRemise = false, clientId = null, montantPaye = null, echeanceDette = null, ouvertureCaisseId = null, req = null, modePaiementSaisi = 'Cash', transactionRefSaisi = null, numeroTable = null) => {
    try {
        // Validation : Pour les paiements Fintech, la référence (téléphone) est obligatoire
        const fintechModes = ['Orange Money', 'MobiCash', 'PayCard', 'Virement'];
        if (fintechModes.includes(modePaiementSaisi) && !transactionRefSaisi) {
            throw new Error(`Le numéro de téléphone est obligatoire pour les paiements par ${modePaiementSaisi}.`);
        }

        // Si le panier est vide, qu'un client est sélectionné et qu'un montant est payé, c'est un paiement de dette.
        if (items.length === 0 && clientId && montantPaye > 0) {
            const client = await Client.findById(clientId);
            if (!client) throw new Error("Client introuvable pour le paiement de la dette.");

            const soldeAnterieur = client.dette;
            client.dette -= montantPaye;

            // Créer un mouvement de dette pour le paiement
            await DebtMovement.create({
                client: clientId,
                type: 'PAIEMENT',
                montant: montantPaye,
                soldeAnterieur,
                nouveauSolde: client.dette,
                operateur: user.id,
                boutique: boutiqueId,
                modePaiement: modePaiementSaisi,
                transactionRef: transactionRefSaisi
            });
            await client.save();
            return []; // On retourne un tableau vide car aucune vente d'article n'a été créée.
        }

        // 1. SÉCURITÉ : Vérifier la session de caisse
        // Si l'ID n'est pas fourni, on cherche la session ouverte correspondant au rôle de l'utilisateur
        const sessionQuery = { boutique: boutiqueId, statut: 'OUVERTE' };
        if (ouvertureCaisseId && mongoose.Types.ObjectId.isValid(ouvertureCaisseId)) {
            sessionQuery._id = ouvertureCaisseId;
        } else if (user.role === 'Caissier') {
            // Le Caissier doit avoir sa propre caisse ouverte (type CAISSIER)
            sessionQuery.gerant = user.id;
            sessionQuery.type = 'CAISSIER';
        } else if (user.role === 'Gérant' || user.role === 'Admin') {
            // Le Gérant/Admin utilise la caisse de type GERANT
            sessionQuery.type = 'GERANT';
        }
        // Pour le Serveur, on ne filtre pas par gerant car il utilise la caisse du Gérant

        const sessionActive = await OuvertureCaisse.findOne(sessionQuery);
        if (!sessionActive) throw new Error("La session de caisse de la boutique est fermée. Le gérant doit ouvrir la caisse avant de prendre des commandes.");

        // Utiliser l'ID de la session active trouvée (évite les erreurs si le frontend envoie null)
        const finalCaisseId = sessionActive._id;

        const isOrderOnly = user.role === 'Serveur';

        // Récupérer le taux de pourboire spécifique à la boutique
        const boutique = await Boutique.findById(boutiqueId).lean();

        // SÉCURITÉ MULTI-TENANT : Un Admin ne peut créer des ventes que dans ses propres boutiques
        if (user.role === 'Admin' && boutique.createur.toString() !== user.id.toString()) {
            throw new Error("Accès refusé : Vous ne pouvez créer des ventes que dans vos propres boutiques.");
        }

        // Calcul du taux effectif : 0 si désactivé manuellement, sinon taux boutique ou taux global
        const effectiveTipRate = (boutique && boutique.tipsEnabled === false)
            ? 0
            : ((boutique && boutique.tipPercentage !== undefined) ? (boutique.tipPercentage / 100) : currentTipPercentage);

        const orderGroupId = new mongoose.Types.ObjectId().toString(); // Générer un ID unique pour regrouper les articles de cette commande
        const itemsVendus = [];
        const articlesPourMvt = [];
        let totalGeneralVente = 0;

        // 2. BOUCLE SUR LES ARTICLES DU PANIER
        let itemIndex = 0;
        for (const item of items) {
            itemIndex++;
            let { article: articleId, quantite, remiseTemp, remiseType, venteUnitType } = item;

            // SÉCURITÉ SYNC : Extraire l'ID si c'est un objet
            const cleanArticleId = (articleId && typeof articleId === 'object' && articleId._id) ? articleId._id : articleId;

            const article = await Article.findById(cleanArticleId).lean();
            if (!article) throw new Error(`L'article ${item.article?.nom || 'ID: ' + cleanArticleId} est introuvable.`);

            // Calcul du décrément de stock fractionnaire
            const stockDecrement = (venteUnitType === 'dose' && article.isDoseEnabled)
                ? (quantite / (article.dosesPerBottle || 10))
                : quantite;

            if (!isOrderOnly) {
                const articleUpdated = await Article.findOneAndUpdate(
                    { _id: cleanArticleId, quantite: { $gte: stockDecrement } },
                    { $inc: { quantite: -stockDecrement } },
                    { new: true }
                );
                if (!articleUpdated) throw new Error(`Stock insuffisant pour "${article.nom}".`);
            }

            // Calcul du prix unitaire (Logique de hiérarchie des prix)
            const isDoseVente = venteUnitType === 'dose' && article.isDoseEnabled;
            const remiseVal = remiseTemp ? parseFloat(remiseTemp) : 0;
            let prixUnitaire = isDoseVente ? safeNum(article.prixDose) : safeNum(article.prixVente);

            // On n'applique pas les remises bouteille sur les doses
            if (!isDoseVente && article.promoActive && article.promo > 0) {
                prixUnitaire = prixUnitaire * (1 - article.promo / 100);
            } else if (!isDoseVente && remiseVal > 0) {
                prixUnitaire = remiseType === 'pourcentage'
                    ? prixUnitaire * (1 - remiseVal / 100)
                    : prixUnitaire - remiseVal;
            } else if (article.remise > 0) {
                prixUnitaire = prixUnitaire * (1 - article.remise / 100);
            }

            // Sécurité anti-vente à perte
            if (prixUnitaire < safeNum(article.prixAchat)) {
                throw new Error(`Prix remisé (${prixUnitaire} GNF) inférieur au prix d'achat pour "${article.nom}". (Achat: ${safeNum(article.prixAchat)})`);
            }

            const qty = parseInt(quantite);
            const prixTotal = prixUnitaire * qty;
            totalGeneralVente += prixTotal;

            // Générer le numéro de facture unique pour cet article
            const numeroFacture = `FAC-${orderGroupId.slice(-6).toUpperCase()}-${itemIndex}-${new Date().getFullYear()}`;

            // Création de l'entrée de vente
            const vente = await Vente.create({
                article: articleId,
                quantite: qty,
                prixTotal,
                gerant: user.id,
                boutique: boutiqueId,
                statut: isOrderOnly ? 'commande' : 'finalisee',
                remiseAppliquee: remiseTemp || 0,
                remiseType: remiseType || 'montant',
                ouvertureCaisse: finalCaisseId,
                client: clientId,
                venteUnitType: venteUnitType || 'bottle',
                numeroTable,
                pourboire: isOrderOnly ? Math.round(prixTotal * effectiveTipRate) : 0,
                transactionRef: transactionRefSaisi,
                numeroFacture: numeroFacture, // Numéro de facture unique
                orderGroupId: orderGroupId, // Assigner l'ID de groupe
                modePaiement: modePaiementSaisi, // Capture du mode de paiement
                codeBoutique: boutique.codeBoutique // Tag de l'organisation
            });

            itemsVendus.push(vente);

            if (!isOrderOnly) {
                articlesPourMvt.push({
                    articleId: article._id,
                    nomArticle: article.nom,
                    quantite: stockDecrement,
                    prixAchatUnitaire: article.prixAchat
                });
            }

            // Alerte stock faible
            const seuil = article.seuilAlerte || 10;
            if (article.quantite <= seuil) {
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
                        type: 'CREATION', // This is for new debt from a sale
                        montant: detteGeneree,
                        soldeAnterieur,
                        nouveauSolde: client.dette,
                        operateur: user.id,
                        boutique: boutiqueId,
                        venteAssociee: itemsVendus.length > 0 ? itemsVendus[0]._id : null
                    });
                }
                await client.save();
            }
        }

        // Définir refVente ici pour qu'elle soit toujours disponible pour l'audit
        const refVente = itemsVendus[0]?._id.toString().slice(-6).toUpperCase();

        // 4. TRAÇABILITÉ GLOBALE (Mouvement de stock)
        if (articlesPourMvt.length > 0) {
            await Mouvement.create({
                type: 'Vente',
                boutiqueSource: boutiqueId,
                articles: articlesPourMvt,
                operateur: user.id,
                details: `Vente #${refVente} | Total: ${totalGeneralVente.toLocaleString()} GNF | Client: ${clientId ? 'Oui' : 'Comptant'}`
            });
        }

        // Déterminer le mode de paiement pour le log d'audit
        let modeFinal = modePaiementSaisi;

        // 5. JOURNAL D'AUDIT (Centralisation type Odoo)
        await auditHelper.logSuccess(req, user, 'CREATE_SALE', 'Vente', itemsVendus[0]?._id, {
            total: totalGeneralVente,
            nbArticles: items.length,
            client: clientId || 'Comptant',
            reference: refVente,
            modePaiement: modeFinal,
            montantPaye: montantPaye // Inclure le montant payé brut pour plus de détails
        });

        // --- MISE À JOUR DE LA CAISSE (Nécessaire pour le Dashboard) ---
        if (!isOrderOnly && finalCaisseId) {
            await OuvertureCaisse.findByIdAndUpdate(finalCaisseId, {
                $inc: {
                    totalVentes: totalGeneralVente,
                    nombreVentes: 1
                }
            });
        }

        return itemsVendus;

    } catch (error) {
        console.error("ERREUR TRAITER_PANIER:", error.message);

        // Enregistrement de l'échec dans l'audit
        await auditHelper.logFailure(req, user, 'CREATE_SALE', 'Vente', null, error, {
            nbArticles: items?.length || 0
            // Les détails du mode de paiement ne peuvent pas être entièrement déterminés ici
            , clientId: clientId
            , montantPaye: montantPaye
        });

        throw error;
    }
};

/**
 * Annule une vente individuelle et restaure le stock si nécessaire
 */
exports.annulerVente = async (id, user, req = null) => {
    const vente = await Vente.findById(id).populate('article');
    if (!vente) throw new Error("Vente introuvable.");

    // Sécurité Multi-tenant
    const userBoutiqueId = (user.boutique?._id || user.boutique || '').toString();
    if (user.role !== 'Admin' && vente.boutique.toString() !== userBoutiqueId) {
        throw new Error("Accès refusé : vous ne pouvez annuler que les ventes de votre boutique.");
    }

    // Sécurité : Délai de 2h pour les gérants
    if (user.role === 'Gérant') {
        const diffHours = (new Date() - vente.createdAt) / (1000 * 60 * 60);
        if (diffHours > 2) throw new Error("Délai d'annulation (2h) dépassé. Contactez l'administrateur.");
    }

    if (vente.isCancelled) throw new Error("Cette vente est déjà annulée.");

    // RESTAURATION DU STOCK : Pour tous les statuts (finalisée, prêt ou commande)
    if (vente.statut === 'finalisee' || vente.statut === 'en_preparation' || vente.statut === 'commande') {
        await Article.findByIdAndUpdate(vente.article._id, { $inc: { quantite: vente.quantite } });

        // Restauration de la caisse (Session active ou passée)
        if (vente.ouvertureCaisse) {
            await mongoose.model('OuvertureCaisse').findByIdAndUpdate(vente.ouvertureCaisse, {
                $inc: { totalVentes: -vente.prixTotal }
            });
        }

        // Trace dans les mouvements de stock
        await Mouvement.create({
            type: 'Annulation Vente',
            boutiqueSource: vente.boutique,
            articles: [{
                articleId: vente.article._id,
                nomArticle: vente.article.nom,
                quantite: vente.quantite,
                prixAchatUnitaire: vente.article.prixAchat
            }],
            operateur: user.id,
            details: `Annulation article sur table/groupe #${vente.orderGroupId?.slice(-6).toUpperCase() || 'N/A'}`
        });
    }

    vente.isCancelled = true;
    vente.statut = 'annulee';
    await vente.save();

    // Notification au serveur si l'annulateur est différent de celui qui a pris la commande
    if (vente.gerant && vente.gerant.toString() !== user.id.toString()) {
        notificationService.sendItemCancelledAlert(vente, user)
            .catch(e => console.error("Erreur notification annulation article:", e.message));
    }

    await auditHelper.logSuccess(req, user, 'CANCEL_SALE', 'Vente', id, { total: vente.prixTotal, article: vente.article?.nom });

    return { success: true, message: "Article annulé avec succès." };
};

/**
 * Met à jour le statut d'un groupe de commande (ex: Table entière)
 * Gère la décrémentation du stock si passage à 'finalisee'
 * Supporte la mise à jour partielle via itemIds
 */
exports.updateGroupStatus = async (orderGroupId, status, user, req = null, modePaiement = 'Cash', transactionRef = null, itemIds = []) => {
    console.log(`[venteService] updateGroupStatus called for ${orderGroupId}, status: ${status}, items: ${itemIds?.length || 'all'}`);

    // 1. Construction intelligente de la requête
    let query = {};
    if (itemIds && itemIds.length > 0) {
        // Si des IDs d'articles sont fournis (sélection partielle), on les utilise directement
        query._id = { $in: itemIds.filter(id => mongoose.isValidObjectId(id)) };
    } else if (mongoose.isValidObjectId(orderGroupId)) {
        // Si l'identifiant est un ObjectId technique (orderGroupId)
        query.orderGroupId = orderGroupId;
    } else if (orderGroupId) {
        // Cas du regroupement par table : orderGroupId contient le numéro de table (ex: "55")
        query.numeroTable = orderGroupId;
        query.boutique = user.boutique?._id || user.boutique; // Sécurité : rester dans la boutique
        query.statut = { $ne: 'finalisee' }; // On ne cible que les commandes en cours
    } else {
        throw new Error("Identifiant de commande ou numéro de table manquant.");
    }

    const ventes = await Vente.find(query);
    if (ventes.length === 0) {
        throw new Error("Groupe de commande introuvable.");
    }

    const boutiqueId = ventes[0].boutique;

    // Si on finalise (Encaissement), on doit décrémenter le stock car le serveur ne l'a pas fait
    if (status === 'finalisee') {
        const articlesPourMvt = [];
        let totalGeneralVente = 0;
        let itemsToUpdateCount = 0;

        for (const vente of ventes) {
            // Sécurité : Ne pas traiter des articles déjà annulés ou déjà payés
            if (vente.isCancelled || vente.statut === 'finalisee') continue;

            const article = await Article.findById(vente.article).lean();
            const stockDecrement = (vente.venteUnitType === 'dose' && article?.isDoseEnabled)
                ? (vente.quantite / (article.dosesPerBottle || 10))
                : vente.quantite;

            // Décrémenter le stock
            const articleUpdated = await Article.findOneAndUpdate(
                { _id: vente.article, quantite: { $gte: stockDecrement } },
                { $inc: { quantite: -stockDecrement } },
                { new: true }
            );

            if (!articleUpdated) {
                throw new Error(`Stock insuffisant pour "${article ? article.nom : 'Article'}" lors de la finalisation.`);
            }

            totalGeneralVente += safeNum(vente.prixTotal);
            itemsToUpdateCount++;
            articlesPourMvt.push({
                articleId: articleUpdated._id,
                nomArticle: articleUpdated.nom,
                quantite: stockDecrement,
                prixAchatUnitaire: articleUpdated.prixAchat
            });

            // Alerte stock faible
            const seuil = articleUpdated.seuilAlerte || 10;
            if (articleUpdated.quantite <= seuil) {
                notificationService.sendLowStockAlert(articleUpdated).catch(e => console.error(e));
            }

            // Mettre à jour le statut de la vente individuelle
            vente.statut = 'finalisee';
            vente.modePaiement = modePaiement || 'Cash';
            vente.transactionRef = transactionRef;
            await vente.save();
        }

        // Traçabilité : Créer le mouvement de stock global pour le groupe
        if (articlesPourMvt.length > 0) {
            await Mouvement.create({
                type: 'Vente',
                boutiqueSource: boutiqueId,
                articles: articlesPourMvt,
                operateur: user.id,
                details: `Encaissement Table/Groupe #${orderGroupId.toString().slice(-6).toUpperCase()}`
            });
        }

        // Mise à jour de la caisse session
        if (itemsToUpdateCount > 0 && ventes[0].ouvertureCaisse) {
            await OuvertureCaisse.findByIdAndUpdate(ventes[0].ouvertureCaisse, {
                $inc: {
                    totalVentes: Math.round(totalGeneralVente),
                    nombreVentes: itemsToUpdateCount
                }
            });
        }

        // Audit
        await auditHelper.logSuccess(req, user, 'FINALIZE_GROUP', 'Vente', orderGroupId, { total: totalGeneralVente });

    } else if (status === 'en_preparation') {
        const updateQuery = itemIds && itemIds.length > 0 ? { _id: { $in: itemIds } } : { orderGroupId };
        await Vente.updateMany(updateQuery, { $set: { statut: 'en_preparation' } });

        // Notifier le serveur que la commande est prête
        // Ensure ventes[0] and ventes[0].gerant are valid before attempting to send notification
        if (ventes[0] && ventes[0].gerant) {
            notificationService.sendOrderReadyAlert(ventes[0], user).catch(e => console.error(`[venteService] Error sending order ready alert for orderGroupId ${orderGroupId}: ${e.message}`));
        } else {
            console.warn(`[venteService] Skipping order ready alert for orderGroupId ${orderGroupId}: ventes[0] or ventes[0].gerant is missing.`);
        }

    } else if (status === 'annulee') {
        // Annulation du groupe (ne restaure pas le stock car 'commande' ne l'a pas déduit)
        await Vente.updateMany({ orderGroupId }, { $set: { isCancelled: true, statut: 'annulee' } });
        notificationService.sendOrderCancelledAlert(ventes[0], user).catch(e => console.error(e));

        // Audit
        await auditHelper.logSuccess(req, user, 'CANCEL_GROUP', 'Vente', orderGroupId, { status: 'annulee' });
    } else {
        // Autres changements de statut simples
        await Vente.updateMany({ orderGroupId }, { $set: { statut: status } });
    }
    return { success: true };
};

/**
 * Liste les ventes avec filtres et pagination
 */
exports.listerVentes = async (filter = {}, user = null, req = null) => {
    const page = parseInt(filter.page) || 1;
    const limit = filter.limit !== undefined ? parseInt(filter.limit) : 15;
    const query = {};
    let codeBoutique = filter.codeBoutique || req?.codeBoutique || user?.codeBoutique; // Récupérer le codeBoutique

    // SÉCURITÉ : Si le code est manquant pour un Admin, on le récupère via sa boutique centrale
    if (!codeBoutique && user?.role === 'Admin') {
        const primaryBoutique = await Boutique.findOne({ createur: user.id, type: 'Centrale' });
        if (primaryBoutique) {
            codeBoutique = primaryBoutique.codeBoutique;
        }
    }

    if (filter.startDate || filter.endDate) {
        query.createdAt = {};
        if (filter.startDate) query.createdAt.$gte = new Date(filter.startDate);
        if (filter.endDate) {
            const end = new Date(filter.endDate);
            end.setHours(23, 59, 59, 999);
            query.createdAt.$lte = end;
        }
    }

    // Gestion du filtre d'annulation : par défaut, on cache les annulées
    if (filter.showCancelledOnly === 'true') {
        query.isCancelled = true;
    } else {
        query.isCancelled = { $ne: true };
    }

    // Permettre à l'admin de filtrer par gérant spécifique
    if (filter.gerantId) query.gerant = filter.gerantId;

    // Filtrage par statut (ex: pour isoler les commandes serveurs)
    if (filter.statut) {
        query.statut = Array.isArray(filter.statut) ? { $in: filter.statut } : filter.statut;
    }

    // Support pour exclure un statut spécifique (ex: exclure les commandes de l'historique)
    if (filter.excludeStatut) query.statut = { ...query.statut, $ne: filter.excludeStatut };

    // Filtrer par référence de transaction
    if (filter.transactionRefSearch) {
        query.transactionRef = { $regex: filter.transactionRefSearch, $options: 'i' };
    }

    // Filtrer par mode de paiement
    if (filter.modePaiement) {
        query.modePaiement = filter.modePaiement;
    }

    // Filtrer par numéro de facture
    if (filter.numeroFacture) {
        query.numeroFacture = { $regex: filter.numeroFacture, $options: 'i' };
    }

    // Filtrer par client
    if (filter.clientId) {
        query.client = filter.clientId;
    }

    // --- FILTRAGE PAR RÔLE ---
    // Définir les groupes de rôles pour simplifier les conditions
    const isAdminLike = ['Admin', 'AdminBar'].includes(user?.role);
    const isGerantLike = ['Gérant', 'GérantBar'].includes(user?.role);
    const isEquipeLike = ['Serveur', 'ServeurBar', 'Caissier'].includes(user?.role);
    const isSuperAdmin = user?.role === 'SuperAdmin';

    if (user && isAdminLike) {
        // Pour l'Admin (Marchand ou Bar), récupère toutes les boutiques DONT IL EST LE CRÉATEUR
        // (approche robuste, ne dépend pas de codeBoutique)
        const adminBoutiques = await Boutique.find({ createur: user.id }).select('_id');
        const adminBoutiqueIds = adminBoutiques.map(b => b._id);

        if (filter.boutique) {
            // Vérifier que la boutique demandée appartient bien à l'Admin
            if (adminBoutiqueIds.some(id => id.toString() === filter.boutique.toString())) {
                query.boutique = filter.boutique;
            } else {
                query.boutique = { $in: [] };
            }
        } else if (adminBoutiqueIds.length > 0) {
            query.boutique = { $in: adminBoutiqueIds };
        } else {
            query.boutique = { $in: [] };
        }
    } else if (user && (isGerantLike || isEquipeLike)) {
        // Gérant/GérantBar voient toute l'équipe
        // Serveur/ServeurBar/Caissier limités à leurs propres ventes
        if (!isGerantLike) {
            query.gerant = user.id;
        }

        query.boutique = user.boutique?._id || user.boutique;

        // LOGIQUE DE RÉINITIALISATION (Gérant & Serveur) : 
        // Si aucune date n'est spécifiée, on ne montre par défaut que les ventes de la session ACTUELLE
        // SEULEMENT POUR LES COMMANDES EN ATTENTE (Prêts, Commandes).
        // Cela permet de vider les tableaux (Prêts, Commandes) dès que la caisse est clôturée.
        if (!filter.startDate && !filter.endDate) {
            const isPendingStatut = filter.statut && (
                filter.statut === 'commande' ||
                filter.statut === 'en_preparation' ||
                (Array.isArray(filter.statut) && (filter.statut.includes('commande') || filter.statut.includes('en_preparation')))
            );

            if (isPendingStatut) {
                const activeSession = await OuvertureCaisse.findOne({
                    boutique: query.boutique,
                    statut: 'OUVERTE'
                });
                if (activeSession) {
                    query.ouvertureCaisse = activeSession._id;
                } else {
                    // Si la caisse est fermée, on force un résultat vide pour le "reset" visuel
                    query._id = { $in: [] };
                }
            }
        }
    } else if (user?.role !== 'SuperAdmin') {
        // SÉCURITÉ : Tout autre rôle non-SuperAdmin sans gestion explicite -> aucun résultat
        query._id = { $in: [] };
    }

    console.log(`[listerVentes DEBUG] Role: ${user?.role}, Query:`, JSON.stringify(query));

    // Optimisation des champs Article selon le rôle (économie de bande passante pour le Serveur)
    // On inclut l'image pour l'expérience utilisateur (UX) dans les listings
    const articleFields = 'nom code prixVente prixAchat image';

    const pipeline = [];

    // Correction Critique : Pour l'agrégation ($match), les IDs doivent être au format ObjectId
    const ensureObjectId = (id) => {
        if (!id) return id;
        if (Array.isArray(id)) return id.map(i => ensureObjectId(i));
        if (typeof id === 'string' && mongoose.isValidObjectId(id)) return new mongoose.Types.ObjectId(id);
        return id;
    };

    if (query.gerant) query.gerant = ensureObjectId(query.gerant);
    if (query.boutique) query.boutique = ensureObjectId(query.boutique);
    if (query.client) query.client = ensureObjectId(query.client);

    // Initial match for security and basic filters
    pipeline.push({ $match: query });

    // New parameter for grouping
    const groupBy = filter.groupBy; // 'table' or 'order'

    // Grouping stage
    let groupById;
    if (groupBy === 'table') {
        // If grouping by table, use numeroTable. If no table, use orderGroupId.
        groupById = {
            $cond: [
                { $ne: ['$numeroTable', null] },
                '$numeroTable',
                '$orderGroupId' // Fallback to orderGroupId for 'à emporter' or no table
            ]
        };
    } else { // Default or 'order'
        groupById = '$orderGroupId';
    }

    pipeline.push({
        $group: {
            _id: groupById,
            items: { $push: '$$ROOT' },
            totalGroupPrice: {
                $sum: {
                    $cond: [{ $eq: ['$isCancelled', true] }, 0, '$prixTotal']
                }
            },
            totalGroupPourboire: {
                $sum: {
                    $cond: [{ $eq: ['$isCancelled', true] }, 0, '$pourboire']
                }
            },
            hasPending: {
                $max: {
                    $cond: [{ $eq: ['$statut', 'commande'] }, 1, 0]
                }
            },
            hasReady: {
                $max: {
                    $cond: [{ $eq: ['$statut', 'en_preparation'] }, 1, 0]
                }
            },
            allCancelled: {
                $min: {
                    $cond: [{ $eq: ['$isCancelled', true] }, true, false]
                }
            },
            numeroTable: { $first: '$numeroTable' },
            orderGroupId: { $first: '$orderGroupId' },
            client: { $first: '$client' },
            gerant: { $first: '$gerant' },
            boutique: { $first: '$boutique' },
            createdAt: { $first: '$createdAt' },
            modePaiement: { $first: '$modePaiement' }, // Assuming modePaiement is consistent within a group
            transactionRef: { $first: '$transactionRef' } // Assuming transactionRef is consistent within a group
        }
    });

    // Add fields for final group status
    pipeline.push({
        $addFields: {
            isCancelled: '$allCancelled',
            statut: {
                $cond: [
                    '$allCancelled',
                    'annulee',
                    {
                        $cond: [
                            { $eq: ['$hasPending', 1] },
                            'commande',
                            {
                                $cond: [
                                    { $eq: ['$hasReady', 1] },
                                    'en_preparation',
                                    'finalisee'
                                ]
                            }
                        ]
                    }
                ]
            }
        }
    });

    // Sort grouped results
    pipeline.push({ $sort: { createdAt: -1 } }); // Sort groups by creation date (latest first)

    // Apply pagination to grouped results
    const limitNum = parseInt(limit) || 15;
    const pageNum = parseInt(page) || 1;
    const skip = (pageNum - 1) * limitNum;
    let totalGroupedCount = 0;

    if (limitNum > 0) {
        // On compte les groupes AVANT de limiter pour la pagination
        const countPipeline = [...pipeline, { $count: "total" }];
        const countResult = await Vente.aggregate(countPipeline);
        totalGroupedCount = countResult.length > 0 ? countResult[0].total : 0;

        pipeline.push({ $skip: skip });
        pipeline.push({ $limit: limitNum });
    }

    // C'EST ICI QUE LA MAGIE OPÈRE : On va chercher les détails uniquement pour les 15 groupes affichés
    pipeline.push({
        $lookup: {
            from: 'articles',
            localField: 'items.article',
            foreignField: '_id',
            as: 'populatedArticles'
        }
    });
    pipeline.push({
        $lookup: {
            from: 'users', // Utilisation de la collection users
            localField: 'items.gerant',
            foreignField: '_id',
            as: 'populatedGerants'
        }
    });
    pipeline.push({
        $lookup: {
            from: 'clients',
            localField: 'items.client',
            foreignField: '_id',
            as: 'populatedClients'
        }
    });
    pipeline.push({
        $lookup: {
            from: 'boutiques',
            localField: 'boutique',
            foreignField: '_id',
            as: 'populatedBoutique'
        }
    });

    const groupedVentes = await Vente.aggregate(pipeline);

    // Format the output to match frontend expectations
    const formattedGroups = groupedVentes.map(group => {
        // Reconstruction des objets complets pour le frontend
        const mappedItems = group.items.map(item => {
            const articleObj = group.populatedArticles.find(a => a._id.toString() === item.article.toString());
            const gerantObj = group.populatedGerants.find(u => u._id.toString() === item.gerant.toString());
            const clientObj = group.populatedClients.find(c => c._id.toString() === (item.client || '').toString());
            const boutiqueObj = group.populatedBoutique?.[0];

            const newItem = {
                ...item,
                article: articleObj,
                gerant: gerantObj,
                client: clientObj,
                // Peupler la boutique directement dans chaque item
                boutique: boutiqueObj || item.boutique
            };

            // SÉCURITÉ : Cacher l'état de synchronisation pour l'Admin pour éviter les alertes inutiles
            if (user && user.role === 'Admin') {
                delete newItem.isSynced;
                delete newItem.syncedAt;
            }
            return newItem;
        });

        return {
            orderGroupId: group.orderGroupId || group._id,
            numeroTable: group.numeroTable,
            createdAt: group.createdAt,
            items: mappedItems,
            // Récupérer le gérant et le client du premier item pour les infos de l'en-tête du groupe
            gerant: mappedItems[0]?.gerant,
            client: group.populatedClients?.[0] || mappedItems[0]?.client,
            boutique: group.boutique,
            totalGroupPrice: group.totalGroupPrice,
            totalGroupPourboire: group.totalGroupPourboire,
            statut: group.statut,
            isCancelled: group.isCancelled,
            modePaiement: group.modePaiement,
            transactionRef: group.transactionRef
        };
    });

    return {
        ventes: formattedGroups,
        totalCount: totalGroupedCount, // Total count of grouped documents
        totalPages: limitNum > 0 ? Math.ceil(totalGroupedCount / limitNum) : 1,
        currentPage: pageNum
    };
};

/**
 * Annule automatiquement toutes les commandes non encaissées d'une session.
 * Appelé lors de la clôture de la caisse.
 * @param {string} ouvertureCaisseId - ID de la session de caisse à nettoyer
 * @param {Object} session - Session MongoDB (pour les transactions)
 */
exports.annulerCommandesNonEncaissees = async (ouvertureCaisseId, session = null) => {
    const query = {
        ouvertureCaisse: ouvertureCaisseId,
        statut: { $in: ['commande', 'en_preparation'] },
        isCancelled: false
    };

    // On marque tout comme annulé. 
    // Note : On ne restaure pas le stock ici car dans votre logique actuelle, 
    // les statuts 'commande' et 'en_preparation' n'ont pas encore déduit le stock.
    return await Vente.updateMany(
        query,
        { $set: { statut: 'annulee', isCancelled: true } },
        { session }
    );
};

/**
 * Prépare et calcule les données financières pour le rapport de clôture.
 * @param {string} ouvertureCaisseId - ID de la session d'ouverture
 * @param {number} soldeReel - Le montant physiquement présent dans la caisse
 * @param {object} user - L'utilisateur (gérant) qui clôture
 * @returns {object} Les données formatées pour le modèle RapportCaisse
 */
exports.preparerRapportCloture = async (ouvertureCaisseId, soldeReel, user) => {

    let session;
    // 1. Vérifier si l'identifiant passé est déjà l'objet session complet (possède une propriété statut)
    if (ouvertureCaisseId && typeof ouvertureCaisseId === 'object' && ouvertureCaisseId.statut) {
        session = ouvertureCaisseId;
    }
    // 2. Si c'est un ID (string ou ObjectId), on charge la session depuis la DB
    else if (ouvertureCaisseId && mongoose.isValidObjectId(ouvertureCaisseId)) {
        session = await OuvertureCaisse.findById(ouvertureCaisseId);
    }

    // 3. Fallback ultime : Chercher la session ouverte actuelle pour la boutique de l'utilisateur
    if (!session && user) {
        const boutiqueId = user.boutique?._id || user.boutique;
        if (boutiqueId) {
            session = await OuvertureCaisse.findOne({ boutique: boutiqueId, statut: 'OUVERTE' });
        }
    }

    if (!session) {
        throw new Error("Caisse introuvable : aucune session ouverte n'a pu être identifiée pour cette clôture.");
    }

    if (session.statut !== 'OUVERTE') throw new Error("Cette session de caisse est déjà clôturée.");

    const sReel = safeNum(soldeReel);
    // Calcul du solde théorique : Fond initial + Ventes - Dépenses
    const soldeTheorique = safeNum(session.fondInitial) + safeNum(session.totalVentes) - safeNum(session.totalDepenses);
    const ecart = sReel - soldeTheorique;

    return {
        gerantId: user.id || user._id,
        boutique: session.boutique,
        ouvertureCaisseId: session._id,
        soldeTheorique: Math.round(soldeTheorique),
        montantCloture: sReel, // Aligné sur ce qu'attend caisseService
        ecart,
        totalVentes: safeNum(session.totalVentes),
        totalDepenses: safeNum(session.totalDepenses),
        nombreVentes: safeNum(session.nombreVentes)
    };
};
