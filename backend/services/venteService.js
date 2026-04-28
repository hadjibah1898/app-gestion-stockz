const Vente = require('../models/Vente');
const Setting = require('../models/Setting');
const Boutique = require('../models/Boutique');
const Article = require('../models/Article');
const User = require('../models/User');
const Mouvement = require('../models/Mouvement');
const Client = require('../models/Client');
const DebtMovement = require('../models/DebtMovement');
const notificationService = require('./notificationService');
const mongoose = require('mongoose');
const auditHelper = require('../utils/auditHelper');

// Variable locale pour le taux de pourboire (5% par défaut)
// Utilisée comme cache pour la performance lors des ventes
let currentTipPercentage = 0.05;

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
syncTipPercentage();

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
        // 1. SÉCURITÉ : Vérifier la session de caisse
        const sessionActive = await mongoose.model('OuvertureCaisse').findOne({ 
            _id: ouvertureCaisseId, 
            // La caisse doit être celle du gérant de la boutique, même si c'est un serveur qui commande
            statut: 'OUVERTE' 
        });
        if (!sessionActive) throw new Error("Session de caisse invalide ou fermée.");

        const isOrderOnly = user.role === 'Serveur';
        
        // Récupérer le taux de pourboire spécifique à la boutique
        const boutique = await Boutique.findById(boutiqueId);
        
        // Calcul du taux effectif : 0 si désactivé manuellement, sinon taux boutique ou taux global
        const effectiveTipRate = (boutique && !boutique.tipsEnabled) 
            ? 0 
            : ((boutique && boutique.tipPercentage !== undefined) ? (boutique.tipPercentage / 100) : currentTipPercentage);

        const orderGroupId = new mongoose.Types.ObjectId().toString(); // Générer un ID unique pour regrouper les articles de cette commande
        const itemsVendus = [];
        const articlesPourMvt = [];
        let totalGeneralVente = 0;

        // 2. BOUCLE SUR LES ARTICLES DU PANIER
        for (const item of items) {
            const { article: articleId, quantite, remiseTemp, remiseType } = item;

            const article = await Article.findById(articleId).populate('boutique');
            if (!article) throw new Error("Article introuvable.");

            if (!isOrderOnly) {
                const articleUpdated = await Article.findOneAndUpdate(
                    { _id: articleId, quantite: { $gte: quantite } },
                    { $inc: { quantite: -quantite } },
                    { new: true } 
                );
                if (!articleUpdated) throw new Error(`Stock insuffisant pour "${article.nom}".`);
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
                gerant: user.id,
                boutique: boutiqueId,
                statut: isOrderOnly ? 'commande' : 'finalisee',
                remiseAppliquee: remiseTemp || 0,
                remiseType: remiseType || 'montant',
                ouvertureCaisse: ouvertureCaisseId,
                client: clientId,
                numeroTable,
                pourboire: isOrderOnly ? Math.round(prixTotal * effectiveTipRate) : 0,
                transactionRef: transactionRefSaisi,
                orderGroupId: orderGroupId, // Assigner l'ID de groupe
                modePaiement: modePaiementSaisi // Capture du mode de paiement
            });

            itemsVendus.push(vente);
            
            if (!isOrderOnly) {
                articlesPourMvt.push({ 
                    articleId: article._id, 
                    nomArticle: article.nom, 
                    quantite, 
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
                        type: 'CREATION',
                        montant: detteGeneree,
                        soldeAnterieur,
                        nouveauSolde: client.dette,
                        operateur: user.id,
                        boutique: boutiqueId,
                        venteAssociee: itemsVendus[0]._id
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
        if (clientId) {
            const montantEncaissé = montantPaye !== null ? montantPaye : totalGeneralVente;
            const detteGeneree = totalGeneralVente - montantEncaissé;
            if (detteGeneree > 0) {
                modeFinal = montantEncaissé > 0 ? `${modePaiementSaisi} + Dette` : 'Dette';
                // Si c'est une dette, l'echeanceDette est valide.
            }
        }
        if (montantPaye !== null && montantPaye < totalGeneralVente && !clientId) {
            // Ce cas ne devrait normalement pas arriver sans clientId, mais par sécurité
            modeFinal = `Partiel (${modePaiementSaisi})`;
        }

        // 5. JOURNAL D'AUDIT (Centralisation type Odoo)
        await auditHelper.logSuccess(req, user, 'CREATE_SALE', 'Vente', itemsVendus[0]?._id, {
            total: totalGeneralVente,
            nbArticles: items.length,
            client: clientId || 'Comptant',
            reference: refVente,
            modePaiement: modeFinal,
            montantPaye: montantPaye // Inclure le montant payé brut pour plus de détails
        });

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

    // Gestion du filtre d'annulation : par défaut, on cache les annulées
    if (filter.showCancelledOnly === 'true') {
        query.isCancelled = true;
    } else {
        query.isCancelled = { $ne: true };
    }

    // Permettre à l'admin de filtrer par gérant spécifique
    if (filter.gerantId) query.gerant = filter.gerantId;

    // Filtrage par statut (ex: pour isoler les commandes serveurs)
    if (filter.statut) query.statut = filter.statut;
    
    // Support pour exclure un statut spécifique (ex: exclure les commandes de l'historique)
    if (filter.excludeStatut) query.statut = { $ne: filter.excludeStatut };

    // Filtrer par référence de transaction
    if (filter.transactionRefSearch) {
        query.transactionRef = { $regex: filter.transactionRefSearch, $options: 'i' };
    }

    if (user && user.role === 'Serveur') {
        query.gerant = user.id;
        if (user.boutique) query.boutique = user.boutique;
    } else if (user && user.role === 'Gérant') {
        if (user.boutique) query.boutique = user.boutique;
    }

    const totalVentes = await Vente.countDocuments(query);
    const ventes = await Vente.find(query)
        .sort({ createdAt: -1 })
        .skip(limit > 0 ? (page - 1) * limit : 0)
        .limit(limit > 0 ? limit : 0)
        .populate('article', 'nom image code')
        .populate('gerant', 'nom') // Peupler le gérant pour avoir son nom
        .populate('boutique', 'nom adresse telephone') // Peupler la boutique pour les infos du ticket
        .populate('client', 'nom'); // Peupler le client pour avoir son nom

    return { ventes, totalPages: limit > 0 ? Math.ceil(totalVentes / limit) : 1, currentPage: page };
};

/**
 * Annule une vente et restaure le stock
 */
exports.annulerVente = async (venteId, user, req) => {
    let vente = null;
    try {
        vente = await Vente.findById(venteId);
        if (!vente || vente.isCancelled) throw new Error(!vente ? "Vente introuvable." : "Vente déjà annulée.");

        // Délai de 24h pour les gérants
        if (user.role === 'Gérant') {
            const diffInHours = (Date.now() - new Date(vente.createdAt)) / (1000 * 60 * 60);
            if (diffInHours > 24) throw new Error("Délai d'annulation (24h) dépassé.");
        }

        // Récupérer l'article pour avoir son nom dans les logs, même si on ne restaure pas le stock
        const article = await Article.findById(vente.article);
        const articleNom = article ? article.nom : 'Article supprimé';

        // SÉCURITÉ : On ne restaure le stock que si la vente n'était pas une simple commande
        if (vente.statut !== 'commande' && article) {
            article.quantite += vente.quantite;
            await article.save();

            // Enregistrement du mouvement de stock
            await Mouvement.create({
                type: 'Annulation Vente',
                boutiqueSource: vente.boutique,
                articles: [{ articleId: article._id, nomArticle: articleNom, quantite: vente.quantite }],
                operateur: user.id,
                details: `Restauration suite annulation vente #${vente._id}`
            });
        }

        vente.isCancelled = true;
        vente.statut = 'annulee'; // Changement de statut pour sortir du flux "Commande"
        await vente.save();

        // SÉCURITÉ & ALERTE : Si le gérant annule la commande d'un serveur, on notifie le serveur
        if (user.id.toString() !== vente.gerant.toString()) {
            await notificationService.sendOrderCancelledAlert(vente, user);
        }

        // Enregistrement dans le Journal d'Audit (AuditLog) pour l'admin (Succès)
        await auditHelper.logSuccess(req, user, 'CANCEL_SALE', 'Vente', vente._id, { 
            article: articleNom, 
            quantite: vente.quantite, 
            montant: vente.prixTotal 
        });

        return { success: true };
    } catch (error) {
        // Enregistrement de l'échec via l'utilitaire centralisé
        await auditHelper.logFailure(req, user, 'CANCEL_SALE', 'Vente', venteId, error, {
            venteFound: !!vente,
            isCancelled: vente?.isCancelled
        });

        throw error;
    }
};

/**
 * Met à jour le statut d'une commande et gère les mouvements de stock associés
 */
exports.updateStatus = async (venteId, newStatus, user, req) => {
    const vente = await Vente.findById(venteId).populate('article');
    if (!vente) throw new Error("Vente introuvable.");

    // Mise à jour optionnelle du mode de paiement (ex: changement de Cash vers OM lors de l'encaissement)
    if (req.body.modePaiement) vente.modePaiement = req.body.modePaiement;
    
    const digitalModes = ['Orange Money', 'MobiCash', 'PayCard', 'Virement'];
    
    // Enregistrement de la référence de transaction si fournie
    if (req.body.transactionRef) {
        vente.transactionRef = req.body.transactionRef;
    } else if (newStatus === 'finalisee' && digitalModes.includes(vente.modePaiement)) {
        // SÉCURITÉ : Bloquer la finalisation si la référence est manquante pour un paiement digital
        throw new Error(`Une référence de transaction est obligatoire pour le paiement par ${vente.modePaiement}.`);
    }

    // SÉCURITÉ : On compare les IDs de boutique uniquement si la vente en possède un.
    // Cela permet de valider les anciennes commandes créées avant la correction du bug boutique.
    const userBoutiqueId = (user.boutique?._id || user.boutique || '').toString();
    const venteBoutiqueId = (vente.boutique?._id || vente.boutique || '').toString();

    if (['Gérant', 'Serveur'].includes(user.role) && venteBoutiqueId && userBoutiqueId !== venteBoutiqueId) {
        throw new Error("Action refusée : Vous ne pouvez pas valider une commande d'une autre boutique.");
    }

    // Validation des transitions autorisées
    const allowedTransitions = {
        'commande': ['en_preparation', 'finalisee', 'annulee'],
        'en_preparation': ['finalisee', 'annulee'] // Gardé pour compatibilité avec anciennes données
    };

    if (!allowedTransitions[vente.statut]?.includes(newStatus)) {
        throw new Error(`Transition de statut invalide : ${vente.statut} -> ${newStatus}`);
    }

    // Déduction du stock lors de la validation finale par le gérant
    if (vente.statut === 'commande' && (newStatus === 'en_preparation' || newStatus === 'finalisee')) {
        // Vérification de l'existence de l'article (cas où l'article a été supprimé)
        const articleId = vente.article?._id || vente.article;
        if (!articleId) throw new Error("Impossible de valider : l'article n'existe plus en base.");

        const article = await Article.findById(articleId);
        if (!article) throw new Error("Article introuvable dans le stock.");

        if (article.quantite < (vente.quantite || 0)) {
            throw new Error(`Stock insuffisant pour "${article?.nom || 'l\'article'}".`);
        }

        article.quantite -= vente.quantite;
        await article.save();

        // Enregistrement du mouvement de stock
        await Mouvement.create({
            type: 'Vente',
            boutiqueSource: vente.boutique || user.boutique, // Utilise la boutique du gérant si la vente n'en a pas
            articles: [{ 
                nomArticle: article.nom, 
                quantite: vente.quantite, 
                prixAchatUnitaire: article.prixAchat 
            }],
            operateur: user.id,
            details: `Validation commande Table ${vente.numeroTable || 'N/A'}`
        });
    }

    vente.statut = newStatus;
    if (newStatus === 'annulee') {
        vente.isCancelled = true;
    }

    // Déclencher les alertes selon le nouveau statut, seulement si l'action est faite par un autre utilisateur
    // et si le statut change réellement pour éviter les notifications redondantes.
    // Pas de notification pour 'finalisee' car le serveur verra la commande disparaître de sa liste.
    // Déclencher les alertes selon le nouveau statut
    if (user.id.toString() !== vente.gerant.toString()) {
        if (newStatus === 'annulee') await notificationService.sendOrderCancelledAlert(vente, user);
        if (newStatus === 'en_preparation') await notificationService.sendOrderReadyAlert(vente, user);
    }
    
    await vente.save();
    return vente;
};

/**
 * Met à jour le statut d'un groupe de commandes (par orderGroupId) et gère les mouvements de stock associés.
 */
exports.updateGroupStatus = async (orderGroupId, newStatus, user, req) => {
    let ventes = await Vente.find({ orderGroupId: orderGroupId }).populate('article');
    const { modePaiement, transactionRef } = req.body;
    const userBoutiqueId = (user.boutique?._id || user.boutique || '').toString();

    const digitalModes = ['Orange Money', 'MobiCash', 'PayCard', 'Virement'];

    // SÉCURITÉ : Validation Backend des paiements digitaux
    if (newStatus === 'finalisee' && modePaiement && digitalModes.includes(modePaiement) && !transactionRef) {
        throw new Error(`Référence de transaction manquante pour le paiement groupé en ${modePaiement}.`);
    }

    // SÉCURITÉ/COMPATIBILITÉ : Si aucun groupe trouvé par ID, on cherche par Table ou ID individuel
    if (!ventes || ventes.length === 0) {
        if (mongoose.isValidObjectId(orderGroupId)) {
            const single = await Vente.findById(orderGroupId).populate('article');
            if (single) ventes = [single];
        } else if (orderGroupId.startsWith('EMPORTER_')) {
            const id = orderGroupId.replace('EMPORTER_', '');
            if (mongoose.isValidObjectId(id)) {
                const single = await Vente.findById(id).populate('article');
                if (single) ventes = [single];
            }
        } else {
            // Cas de la vue Préparation : l'ID est le numéro de table (ex: "5")
            ventes = await Vente.find({ 
                numeroTable: orderGroupId, 
                boutique: userBoutiqueId,
                statut: { $ne: 'finalisee' },
                isCancelled: false 
            }).populate('article');
        }
    }

    if (!ventes || ventes.length === 0) throw new Error("Groupe de ventes introuvable.");

    const updatedVentes = [];
    const articlesPourMvt = [];
    const notifiedServers = new Set(); // Pour s'assurer qu'un serveur ne reçoit qu'une seule notification par groupe

    for (const vente of ventes) {
        // SÉCURITÉ : On compare les IDs de boutique uniquement si la vente en possède un.
        const userBoutiqueId = (user.boutique?._id || user.boutique || '').toString();
        const venteBoutiqueId = (vente.boutique?._id || vente.boutique || '').toString();

        if (['Gérant', 'Serveur'].includes(user.role) && venteBoutiqueId && userBoutiqueId !== venteBoutiqueId) {
            throw new Error("Action refusée : Vous ne pouvez pas valider une commande d'une autre boutique.");
        }

        // SÉCURITÉ : Si l'article est déjà annulé ou déjà dans l'état cible, on l'ignore dans le traitement de groupe
        if (vente.isCancelled || vente.statut === newStatus) continue;

        // Si on essaie de finaliser un article qui est déjà finalisé ou en préparation, on continue (pour le groupe)
        // Cela permet de valider un groupe où certains articles sont déjà passés à l'état final.
        // On ne devrait pas bloquer la validation du groupe entier pour un article déjà traité.
        if (newStatus === 'finalisee' && (vente.statut === 'finalisee' || vente.statut === 'en_preparation')) continue;

        // Validation des transitions autorisées
        const allowedTransitions = {
            'commande': ['en_preparation', 'finalisee', 'annulee'],
            'en_preparation': ['finalisee', 'annulee'] // Gardé pour compatibilité avec anciennes données
        };

        if (!allowedTransitions[vente.statut]?.includes(newStatus)) {
            // Si une seule vente dans le groupe ne peut pas transiter, on bloque tout le groupe
            throw new Error(`Transition de statut invalide pour l'article "${vente.article?.nom}" : ${vente.statut} -> ${newStatus}`);
        }

        // Mise à jour du mode de paiement pour chaque article du groupe
        if (modePaiement) vente.modePaiement = modePaiement;
        if (transactionRef) vente.transactionRef = transactionRef;

        // Déduction du stock lors de la validation finale par le gérant
        if (vente.statut === 'commande' && (newStatus === 'en_preparation' || newStatus === 'finalisee')) {
            const articleId = vente.article?._id || vente.article;
            if (!articleId) throw new Error(`Impossible de valider : l'article n'existe plus en base pour la vente ${vente._id}.`);

            const article = await Article.findById(articleId);
            if (!article) throw new Error(`Article introuvable dans le stock pour la vente ${vente._id}.`);

            if (article.quantite < (vente.quantite || 0)) {
                throw new Error(`Stock insuffisant pour "${article?.nom || 'l\'article'}".`);
            }

            article.quantite -= vente.quantite;
            await article.save();

            articlesPourMvt.push({ 
                nomArticle: article.nom, 
                quantite: vente.quantite, 
                prixAchatUnitaire: article.prixAchat 
            });
        }

        vente.statut = newStatus;
        if (newStatus === 'annulee') {
            vente.isCancelled = true;
            if (user.id.toString() !== vente.gerant.toString()) {
                await notificationService.sendOrderCancelledAlert(vente, user);
            }
        }
        await vente.save();
        updatedVentes.push(vente);
    }

    // Créer un mouvement de stock unique pour tout le groupe si des déductions ont eu lieu
    if (articlesPourMvt.length > 0) {
        await Mouvement.create({
            type: 'Vente',
            boutiqueSource: ventes[0].boutique || user.boutique,
            articles: articlesPourMvt,
            operateur: user.id,
            details: `Validation groupe commande #${orderGroupId.slice(-6).toUpperCase()} Table ${ventes[0].numeroTable || 'N/A'}`
        });
    }

    return updatedVentes;
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