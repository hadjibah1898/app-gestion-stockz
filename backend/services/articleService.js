const articleRepository = require('../repositories/articleRepository');
const Article = require('../models/Article');
const Mouvement = require('../models/Mouvement');
const Notification = require('../models/Notification');
const Boutique = require('../models/Boutique');
const Fournisseur = require('../models/Fournisseur');
const { logAction } = require('./auditLogService');

/**
 * --- CONSULTATION ET LECTURE ---
 */

exports.listerArticles = async (filter = {}, page = 1, limit = 0) => {
    const { sort, order, search, status, ...restFilters } = filter;
    const dbFilters = { ...restFilters };

    // Nettoyage des paramètres
    delete dbFilters.page;
    delete dbFilters.limit;

    Object.keys(dbFilters).forEach(key => {
        if (dbFilters[key] === '' || dbFilters[key] === null || dbFilters[key] === undefined) {
            delete dbFilters[key];
        }
    });

    // Recherche textuelle
    if (search) {
        dbFilters.$or = [
            { nom: { $regex: search, $options: 'i' } },
            { code: { $regex: search, $options: 'i' } }
        ];
    }

    // Filtrage par état du stock (Optimisation Database)
    if (status) {
        if (status === 'low_stock' || status === 'reapprovisionnement') {
            // Filtre dynamique basé sur le seuil d'alerte de chaque article
            dbFilters.$expr = { $lte: ["$quantite", { $ifNull: ["$seuilAlerte", 10] }] };
            dbFilters.quantite = { $gt: 0 };
        } else if (status === 'out_of_stock' || status === 'rupture') {
            dbFilters.quantite = { $lte: 0 };
        } else if (status === 'expired') {
            dbFilters.datePeremption = { $lt: new Date() };
        } else if (status === 'expiring_soon') {
            const soon = new Date();
            soon.setDate(soon.getDate() + 30);
            dbFilters.datePeremption = { $gte: new Date(), $lte: soon };
        }
    }

    const totalCount = await Article.countDocuments(dbFilters);
    const limitNum = parseInt(limit) || parseInt(filter.limit) || 0;
    const pageNum = parseInt(page) || parseInt(filter.page) || 1;

    let query = Article.find(dbFilters)
        .populate('boutique')
        .populate('fournisseur')
        .populate('remiseEnAttente.gerant', 'nom');

    // Tri
    const sortOrder = order === 'desc' ? -1 : 1;
    query.sort(sort ? { [sort]: sortOrder } : { createdAt: -1 });

    // Pagination
    if (limitNum > 0) {
        query.skip((pageNum - 1) * limitNum).limit(limitNum);
    }

    const articles = await query;

    return {
        data: articles,
        totalCount,
        totalPages: limitNum > 0 ? Math.ceil(totalCount / limitNum) : 1,
        currentPage: pageNum
    };
};

/**
 * --- MODIFICATION ET SUPPRESSION ---
 */

exports.modifierArticle = async (id, inputData, user, req) => {
    if (Object.keys(inputData).length === 0) throw new Error("Données de mise à jour vides.");

    // On utilise Article.findById avec populate pour connaître le type de boutique (Centrale ou Secondaire)
    const articleExistant = await Article.findById(id).populate('boutique');
    if (!articleExistant) throw new Error("Article introuvable.");

    // SÉCURITÉ : Filtrer les champs pour empêcher la modification directe du stock 
    // ou des métadonnées sensibles par injection via l'API.
    const allowedFields = [
        'nom', 'prixAchat', 'prixVente', 'boutique', 'categorie', 'code', 
        'image', 'promo', 'promoActive', 'dateDebutPromo', 'dateFinPromo', 
        'remise', 'datePeremption', 'fournisseur', 'remiseEnAttente',
        'seuilAlerte'
    ];
    
    const data = {};
    allowedFields.forEach(f => { if (inputData[f] !== undefined) data[f] = inputData[f]; });

    const operateurId = user?._id || user?.id;
    let detailsMouvement = '';

    // Gestion des notifications de remise (Validation/Refus)
    if (articleExistant.remiseEnAttente?.valeur && inputData.remiseEnAttente === null) {
        // SÉCURITÉ : Seul l'Admin peut valider/vider une demande de remise
        if (user.role !== 'Admin') {
            throw new Error("Seul l'administrateur peut valider ou refuser une demande de remise.");
        }

        const recipientId = articleExistant.remiseEnAttente.gerant?._id || articleExistant.remiseEnAttente.gerant;
        const isApproved = Number(data.remise) === articleExistant.remiseEnAttente.valeur;
        
        await Notification.create({
            recipient: recipientId,
            message: isApproved 
                ? `✅ Votre demande de remise de ${articleExistant.remiseEnAttente.valeur}% sur l'article "${articleExistant.nom}" a été approuvée.`
                : `❌ Votre demande de remise de ${articleExistant.remiseEnAttente.valeur}% sur l'article "${articleExistant.nom}" a été refusée.`,
            type: isApproved ? 'success' : 'error'
        });
    }

    // Validation des prix et quantités
    const prixVenteFinal = data.prixVente !== undefined ? Number(data.prixVente) : articleExistant.prixVente;
    const prixAchatFinal = data.prixAchat !== undefined ? Number(data.prixAchat) : articleExistant.prixAchat;

    if (prixVenteFinal <= prixAchatFinal) throw new Error("Le prix de vente doit être supérieur au prix d'achat.");
    if (data.quantite !== undefined && Number(data.quantite) < 0) throw new Error("La quantité ne peut pas être négative.");

    // Validation de la date de péremption : ne peut pas être dans le passé
    if (data.datePeremption) {
        const peremptionDate = new Date(data.datePeremption);
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normaliser à minuit pour comparer uniquement la date
        if (peremptionDate < today) {
            throw new Error("La date de péremption ne peut pas être dans le passé.");
        }
    }

    // Vérification que la remise permanente ne vend pas l'article à perte
    const remiseFinale = data.remise !== undefined ? Number(data.remise) : articleExistant.remise;
    if (remiseFinale > 0) {
        const prixEffectif = prixVenteFinal * (1 - remiseFinale / 100);
        if (prixEffectif < prixAchatFinal) {
            throw new Error(`Action refusée : Une remise de ${remiseFinale}% rendrait le prix de vente (${prixEffectif.toLocaleString('fr-FR')} GNF) inférieur au prix d'achat (${prixAchatFinal.toLocaleString('fr-FR')} GNF).`);
        }
    }

    // Protection de l'intégrité de l'intervalle de promotion (Fusion data + existant)
    const promoActiveFinal = data.promoActive !== undefined ? data.promoActive : articleExistant.promoActive;
    const dateDebutFinal = data.dateDebutPromo || articleExistant.dateDebutPromo;
    const dateFinFinal = data.dateFinPromo || articleExistant.dateFinPromo;

    if (promoActiveFinal && dateDebutFinal && dateFinFinal) {
        if (new Date(dateFinFinal) < new Date(dateDebutFinal)) {
            throw new Error("Action refusée : La date de fin de promotion ne peut pas être antérieure à la date de début.");
        }
    }

    // Validation de l'existence de la boutique si elle est modifiée ou fournie
    if (data.boutique) {
        const boutiqueCheck = await Boutique.findById(data.boutique);
        if (!boutiqueCheck) throw new Error("La boutique spécifiée est introuvable.");
    }

    // Validation de l'existence du fournisseur si il est modifié ou fourni
    if (data.fournisseur) {
        const fournisseurCheck = await Fournisseur.findById(data.fournisseur);
        if (!fournisseurCheck) throw new Error("Le fournisseur spécifié est introuvable.");
    }

    // Traçabilité des changements de prix
    if (data.prixAchat !== undefined && Number(data.prixAchat) !== articleExistant.prixAchat) {
        detailsMouvement += `P. Achat: ${articleExistant.prixAchat.toLocaleString('fr-FR')} -> ${Number(data.prixAchat).toLocaleString('fr-FR')} GNF. `;
    }
    if (data.prixVente !== undefined && Number(data.prixVente) !== articleExistant.prixVente) {
        detailsMouvement += `P. Vente: ${articleExistant.prixVente.toLocaleString('fr-FR')} -> ${Number(data.prixVente).toLocaleString('fr-FR')} GNF.`;
    }

    const articleModifie = await articleRepository.update(id, data);

    // --- LOGIQUE DE SYNCHRONISATION DES PRIX (CENTRALE -> SECONDAIRES) ---
    // Si la modification a lieu sur le Dépôt Principal, on répercute sur les autres boutiques
    if (articleExistant.boutique && articleExistant.boutique.type === 'Centrale') {
        const updatesCascades = {};
        if (data.nom !== undefined) updatesCascades.nom = data.nom;
        if (data.code !== undefined) updatesCascades.code = data.code;
        if (data.prixVente !== undefined) updatesCascades.prixVente = Number(data.prixVente);
        if (data.prixAchat !== undefined) updatesCascades.prixAchat = Number(data.prixAchat);
        if (data.categorie !== undefined) updatesCascades.categorie = data.categorie;
        if (data.image !== undefined) updatesCascades.image = data.image;

        if (Object.keys(updatesCascades).length > 0) {
            await Article.updateMany(
                { nom: articleExistant.nom, _id: { $ne: id } }, // Tous les articles de même nom sauf celui qu'on vient de modifier
                { $set: updatesCascades }
            );
        }
    }

    // Audit Log
    if (req) {
        await logAction({
            req, user, action: 'UPDATE_ARTICLE', entity: 'Article', entityId: articleModifie._id,
            details: { before: articleExistant, after: articleModifie.toObject() },
            status: 'SUCCESS'
        });
    }

    // Mouvement de prix
    if (detailsMouvement && operateurId) {
        await Mouvement.create({
            type: 'Modification Prix',
            details: detailsMouvement.trim(),
            boutiqueSource: articleExistant.boutique,
            articles: [{ nomArticle: articleExistant.nom, quantite: 0 }],
            operateur: operateurId
        });
    }

    return articleModifie;
};

exports.supprimerArticle = async (id) => {
    return await articleRepository.deleteById(id);
};

/**
 * --- GESTION DES TRANSFERTS ET STOCKS ---
 */

const performStockTransfer = async (sourceId, targetId, items, user, details = '', nomTransporteur = '') => {
    const operateurId = user.id || user._id;
    const userRole = user.role;

    if (sourceId.toString() === targetId.toString()) throw new Error("Les boutiques doivent être différentes.");

    const [sourceBoutique, targetBoutique] = await Promise.all([
        Boutique.findById(sourceId),
        Boutique.findById(targetId)
    ]);

    if (!sourceBoutique || !targetBoutique) throw new Error("Boutique introuvable.");
    if (sourceBoutique.type === 'Centrale' && userRole !== 'Admin') {
        throw new Error("Seul l'administrateur peut transférer depuis le Dépôt Principal.");
    }

    if (!items?.length) throw new Error("La liste d'articles est vide.");

    const articlesPourMouvement = [];

    for (const item of items) {
        const qtyToTransfer = parseInt(item.quantite);
        if (isNaN(qtyToTransfer) || qtyToTransfer <= 0) continue;

        // 1. Décrémenter Source
        const sourceArticle = await Article.findOneAndUpdate(
            { _id: item.articleId, boutique: sourceId, quantite: { $gte: qtyToTransfer } },
            { $inc: { quantite: -qtyToTransfer } },
            { new: true }
        );

        if (!sourceArticle) throw new Error(`Stock insuffisant pour l'article ID: ${item.articleId}`);

        articlesPourMouvement.push({ nomArticle: sourceArticle.nom, quantite: qtyToTransfer });
    }

    // Le stock est déduit de la source, mais pas encore ajouté à la cible.
    return await Mouvement.create({
        type: 'Transfert',
        boutiqueSource: sourceId,
        boutiqueDestination: targetId,
        articles: articlesPourMouvement,
        statutTransfert: 'EXPEDIE',
        nomTransporteur,
        operateur: operateurId,
        details: details || `Transfert de ${sourceBoutique.nom} vers ${targetBoutique.nom}`
    });
};

exports.transfererStock = async (sourceId, targetId, articles, user, details, nomTransporteur) => {
    return await performStockTransfer(sourceId, targetId, articles, user, details, nomTransporteur);
};

exports.effectuerReapprovisionnement = async (targetBoutiqueId, articles, user, nomTransporteur) => {
    const centrale = await Boutique.findOne({ type: 'Centrale' });
    if (!centrale) throw new Error("Aucun Dépôt Principal configuré.");

    const target = await Boutique.findById(targetBoutiqueId);
    if (!target || target.type !== 'Secondaire') throw new Error("La destination doit être une boutique secondaire.");

    const itemsToTransfer = [];
    for (const item of articles) {
        const targetArticle = await Article.findById(item.articleId);
        if (!targetArticle) throw new Error(`Article ${item.articleId} introuvable.`);

        const sourceArticle = await Article.findOne({ nom: targetArticle.nom, boutique: centrale._id });
        if (!sourceArticle || sourceArticle.quantite < item.quantite) {
            throw new Error(`Stock insuffisant en Centrale pour "${targetArticle.nom}".`);
        }
        itemsToTransfer.push({ articleId: sourceArticle._id, quantite: item.quantite });
    }

    return await performStockTransfer(centrale._id, targetBoutiqueId, itemsToTransfer, user, "Réapprovisionnement", nomTransporteur);
};

/**
 * Confirme la réception physique des articles par le gérant de la boutique cible.
 */
exports.confirmerReceptionTransfert = async (mouvementId, user) => {
    const mouvement = await Mouvement.findById(mouvementId).populate('boutiqueSource boutiqueDestination');
    
    if (!mouvement || mouvement.statutTransfert !== 'EXPEDIE') {
        throw new Error("Ce transfert n'est pas en attente de réception.");
    }

    // SÉCURITÉ : Seul un gérant de la boutique de destination (ou un admin) peut valider
    if (user.role !== 'Admin' && user.boutique.toString() !== mouvement.boutiqueDestination._id.toString()) {
        throw new Error("Vous n'êtes pas autorisé à réceptionner ce colis pour cette boutique.");
    }

    for (const item of mouvement.articles) {
        // Chercher l'article correspondant dans la boutique de destination (par nom)
        let targetArticle = await Article.findOne({ 
            nom: item.nomArticle, 
            boutique: mouvement.boutiqueDestination._id 
        });

        if (targetArticle) {
            targetArticle.quantite += item.quantite;
            await targetArticle.save();
        } else {
            // Si l'article n'existe pas encore dans cette boutique, on le crée en copiant les infos de la source
            const sourceArticle = await Article.findOne({ nom: item.nomArticle, boutique: mouvement.boutiqueSource._id });
            const newArticleData = sourceArticle.toObject();
            delete newArticleData._id;
            newArticleData.boutique = mouvement.boutiqueDestination._id;
            newArticleData.quantite = item.quantite;
            await Article.create(newArticleData);
        }
    }

    mouvement.statutTransfert = 'RECU';
    await mouvement.save();

    // Envoyer une notification aux admins
    await notificationService.sendTransferReceivedAlert(mouvement, user);

    return { success: true, message: `Réception validée. Le stock de ${mouvement.boutiqueDestination.nom} a été mis à jour.` };
};

/**
 * --- ANNULATIONS ET PROMOTIONS ---
 */

exports.annulerTransfert = async (mouvementId, operateurId) => {
    const mouvement = await Mouvement.findById(mouvementId);
    if (!mouvement || mouvement.type !== 'Transfert' || mouvement.isCancelled) {
        throw new Error("Annulation impossible : mouvement invalide ou déjà annulé.");
    }

    for (const item of mouvement.articles) {
        const artDest = await Article.findOne({ nom: item.nomArticle, boutique: mouvement.boutiqueDestination });
        if (!artDest || artDest.quantite < item.quantite) throw new Error(`Stock insuffisant pour rétablir "${item.nomArticle}".`);

        let artSrc = await Article.findOne({ nom: item.nomArticle, boutique: mouvement.boutiqueSource });
        
        artDest.quantite -= item.quantite;
        await artDest.save();

        if (artSrc) {
            artSrc.quantite += item.quantite;
            await artSrc.save();
        } else {
            await Article.create({ ...artDest.toObject(), _id: undefined, boutique: mouvement.boutiqueSource, quantite: item.quantite });
        }
    }

    mouvement.isCancelled = true;
    await mouvement.save();

    return await Mouvement.create({
        type: 'Transfert',
        details: `ANNULATION transfert du ${mouvement.createdAt.toLocaleDateString()}`,
        boutiqueSource: mouvement.boutiqueDestination,
        boutiqueDestination: mouvement.boutiqueSource,
        articles: mouvement.articles,
        operateur: operateurId,
        isCancelled: true
    });
};

exports.annulerApprovisionnement = async (mouvementId, operateurId) => {
    const mouvement = await Mouvement.findById(mouvementId);
    if (!mouvement || mouvement.type !== 'Approvisionnement' || mouvement.isCancelled) throw new Error("Mouvement invalide.");

    for (const item of mouvement.articles) {
        const article = await Article.findOne({ nom: item.nomArticle, boutique: mouvement.boutiqueDestination });
        if (!article || article.quantite < item.quantite) throw new Error(`Stock insuffisant pour annuler "${item.nomArticle}".`);
        article.quantite -= item.quantite;
        await article.save();
    }

    mouvement.isCancelled = true;
    await mouvement.save();

    return await Mouvement.create({
        type: 'Approvisionnement',
        details: `ANNULATION Approvisionnement du ${mouvement.createdAt.toLocaleDateString()}`,
        boutiqueSource: mouvement.boutiqueDestination,
        articles: mouvement.articles,
        operateur: operateurId,
        isCancelled: true
    });
};

exports.appliquerPromoPeremption = async (jours, pourcentage) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + parseInt(jours));

    const result = await Article.updateMany(
        { datePeremption: { $gte: today, $lte: targetDate }, quantite: { $gt: 0 } },
        { 
            $set: { 
                promo: parseInt(pourcentage), 
                promoActive: true, 
                dateDebutPromo: new Date(), 
                dateFinPromo: "$datePeremption" 
            } 
        }
    );
    return { modifiedCount: result.modifiedCount };
};

exports.desactiverPromotionsExpirees = async () => {
    const now = new Date();
    const result = await Article.updateMany(
        { 
            promoActive: true, 
            dateFinPromo: { $lt: now } 
        },
        { 
            $set: { promoActive: false } 
        }
    );
    return result.modifiedCount;
};