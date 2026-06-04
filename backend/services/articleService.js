const articleRepository = require('../repositories/articleRepository');
const Article = require('../models/Article');
const Mouvement = require('../models/Mouvement');
const Notification = require('../models/Notification');
const Boutique = require('../models/Boutique');
const Fournisseur = require('../models/Fournisseur');
const notificationService = require('./notificationService');
const AjustementStock = require('../models/AjustementStock');
const { logAction } = require('./auditLogService');

/**
 * --- CONSULTATION ET LECTURE ---
 */

exports.listerArticles = async (filter = {}, page = 1, limit = 0, user = null) => {
    const { sort, order, search, status, ...restFilters } = filter;
    const dbFilters = { ...restFilters };

    // Optimisation : On retire les infos fournisseurs pour le serveur.
    // L'image est conservée pour l'UX mais sera compressée à l'upload.
    const projection = (user && user.role === 'Serveur') 
        ? { fournisseur: 0, __v: 0 } 
        : { __v: 0 };

    // SÉCURITÉ MULTI-TENANT (Isolation Entreprise)
    if (user) {
        if (user.role === 'SuperAdmin') {
            // Accès total : on ne modifie pas les dbFilters, 
            // le SuperAdmin voit toutes les boutiques de tous les Admins.
        } else if (user.role === 'Admin') {
            const myBoutiques = await Boutique.find({ createur: user.id }).select('_id');
            const myBoutiqueIds = myBoutiques.map(b => b._id.toString());

            if (dbFilters.boutique) {
                // Si l'Admin demande une boutique spécifique, on vérifie qu'il en est le créateur
                if (!myBoutiqueIds.includes(dbFilters.boutique.toString())) {
                    throw new Error("Accès refusé : Cette boutique ne vous appartient pas.");
                }
            } else {
                // Sinon, on restreint automatiquement aux siennes
                dbFilters.boutique = { $in: myBoutiques.map(b => b._id) };
            }
        } else if (['Gérant', 'Serveur'].includes(user.role)) {
            // SÉCURITÉ STRICTE : Restriction à la boutique assignée
            const gerantBoutiqueId = (user.boutique?._id || user.boutique || '').toString();
            if (!gerantBoutiqueId) {
                dbFilters.boutique = { $in: [] }; 
            } else {
                dbFilters.boutique = gerantBoutiqueId;
            }
        }
    }

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

    let query = Article.find(dbFilters, projection)
        .populate('boutique')
        .populate('fournisseur')
        .populate('remiseEnAttente.gerant', 'nom')
        .lean(); // Performance boost

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
 * Vérifie si un code ressemble à un code boutique existant
 * (Utile pour la visibilité du bouton génération automatique héritage)
 */
exports.verifierRessemblanceCode = async (code, boutiqueId) => {
    const boutique = await Boutique.findById(boutiqueId);
    if (!boutique || !boutique.codeBoutique) return false;

    // On cherche s'il existe des articles dont le code contient ou commence par le code boutique
    const similarExists = await Article.exists({ 
        boutique: boutiqueId, 
        code: { $regex: new RegExp(`^${boutique.codeBoutique}`, 'i') } 
    });
    return !!similarExists;
};

/**
 * --- MODIFICATION ET SUPPRESSION ---
 */

exports.modifierArticle = async (id, inputData, user, req) => {
    if (Object.keys(inputData).length === 0) throw new Error("Données de mise à jour vides.");

    // On utilise Article.findById avec populate pour connaître le type de boutique (Centrale ou Secondaire)
    const articleExistant = await Article.findById(id).populate('boutique');
    if (!articleExistant) throw new Error("Article introuvable.");

    // SÉCURITÉ MULTI-TENANT : Un Admin ne peut modifier que les articles de ses boutiques
    if (user.role === 'Admin' && articleExistant.boutique.createur.toString() !== user.id.toString()) {
        throw new Error("Accès refusé : Vous ne pouvez modifier que les articles de vos boutiques.");
    }

    // SÉCURITÉ : Filtrer les champs pour empêcher la modification directe du stock 
    // ou des métadonnées sensibles par injection via l'API.
    const allowedFields = [
        'nom', 'prixAchat', 'prixVente', 'boutique', 'categorie', 'code', 
        'image', 'promo', 'promoActive', 'dateDebutPromo', 'dateFinPromo', 
        'remise', 'datePeremption', 'fournisseur', 'remiseEnAttente',
        'seuilAlerte', 'type', 'uniteMesure', 'tva', 'description',
        'isDoseEnabled', 'dosesPerBottle', 'prixDose'
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

    // SÉCURITÉ : Vérifier l'unicité du code si celui-ci est modifié
    if (data.code && data.code !== articleExistant.code) {
        const codeExists = await Article.findOne({ code: data.code, boutique: data.boutique || articleExistant.boutique });
        if (codeExists) {
            throw new Error(`Le code "${data.code}" est déjà utilisé par l'article "${codeExists.nom}" dans cette boutique.`);
        }
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
            // On ne synchronise que vers les boutiques appartenant au même Admin
            const adminBoutiques = await Boutique.find({ createur: user.id }).select('_id');
            const boutiqueIds = adminBoutiques.map(b => b._id);

            await Article.updateMany(
                { 
                    nom: articleExistant.nom, 
                    _id: { $ne: id },
                    boutique: { $in: boutiqueIds } 
                },
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

exports.supprimerArticle = async (id, user) => {
    const articleToDelete = await Article.findById(id).populate('boutique');
    if (!articleToDelete) throw new Error("Article introuvable.");

    // SÉCURITÉ MULTI-TENANT : Un Admin ne peut supprimer que les articles de ses boutiques (Le SuperAdmin passe)
    if (user.role === 'Admin' && articleToDelete.boutique?.createur?.toString() !== user.id.toString()) {
        throw new Error("Accès refusé : Vous ne pouvez supprimer que les articles de vos boutiques.");
    }
    return await articleRepository.deleteById(id); // Supprime l'article après vérification
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

    // 1. Vérification de l'existence des boutiques
    if (!sourceBoutique || !targetBoutique) throw new Error("Boutique source ou destination introuvable.");

    // 2. SÉCURITÉ MULTI-TENANT : Les boutiques doivent appartenir au même administrateur
    if (sourceBoutique.createur.toString() !== targetBoutique.createur.toString()) {
        throw new Error("Accès refusé : Impossible de transférer du stock entre des boutiques appartenant à des administrateurs différents.");
    }

    // SÉCURITÉ MULTI-TENANT : Un Admin ne peut transférer qu'entre ses propres boutiques
    if (user.role === 'Admin' && (sourceBoutique.createur.toString() !== user.id.toString() || targetBoutique.createur.toString() !== user.id.toString())) {
        throw new Error("Accès refusé : Vous ne pouvez transférer du stock qu'entre vos propres boutiques.");
    }

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

        articlesPourMouvement.push({ 
            articleId: sourceArticle._id, 
            nomArticle: sourceArticle.nom, 
            quantite: qtyToTransfer,
            prixAchatUnitaire: sourceArticle.prixAchat 
        });
    }

    return await Mouvement.create({
        type: 'Transfert',
        boutiqueSource: sourceId,
        boutiqueDestination: targetId,
        articles: articlesPourMouvement,
        statutTransfert: 'EXPEDIE',
        nomTransporteur,
        operateur: operateurId,
        details: details || `Transfert de ${sourceBoutique.nom} vers ${targetBoutique.nom}`
    }).then(mvt => {
        // Signaler à la boutique de destination qu'un nouveau colis arrive
        if (global.io) {
            global.io.to(`boutique_${targetId}`).emit('nouveau_transfert', { mvtId: mvt._id });
        }
        return mvt;
    });
};

exports.transfererStock = async (sourceId, targetId, articles, user, details, nomTransporteur) => {
    return await performStockTransfer(sourceId, targetId, articles, user, details, nomTransporteur);
};

exports.effectuerReapprovisionnement = async (targetBoutiqueId, articles, user, nomTransporteur) => {
    const target = await Boutique.findById(targetBoutiqueId);
    if (!target || target.type !== 'Secondaire') throw new Error("La destination doit être une boutique secondaire.");

    const centrale = await Boutique.findOne({ type: 'Centrale', createur: target.createur });
    if (!centrale) throw new Error("Aucun Dépôt Principal configuré pour cette entreprise.");

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
 * Supporte désormais la réception partielle (LIVRAISON_PARTIELLE).
 */
exports.confirmerReceptionTransfert = async (mouvementId, user, itemsRecus = null, commentaire = '') => {
    const mouvement = await Mouvement.findById(mouvementId).populate('boutiqueSource boutiqueDestination');
    
    if (!mouvement || mouvement.statutTransfert !== 'EXPEDIE') {
        throw new Error("Ce transfert n'est pas en attente de réception.");
    }

    // SÉCURITÉ : Seul un gérant de la boutique de destination (ou un admin) peut valider
    if (user.role !== 'Admin' && user.boutique.toString() !== mouvement.boutiqueDestination._id.toString()) {
        throw new Error("Vous n'êtes pas autorisé à réceptionner ce colis pour cette boutique.");
    }
    // SÉCURITÉ MULTI-TENANT : Un Admin ne peut réceptionner que pour ses propres boutiques
    if (user.role === 'Admin' && mouvement.boutiqueDestination.createur.toString() !== user.id.toString()) {
        throw new Error("Accès refusé : Vous ne pouvez réceptionner que pour vos propres boutiques.");
    }


    let isPartial = false;

    for (const item of mouvement.articles) {
        let qteRecue = item.quantite;

        if (itemsRecus && Array.isArray(itemsRecus)) {
            const recu = itemsRecus.find(r => r.nomArticle === item.nomArticle);
            if (recu && parseInt(recu.quantiteRecue) < item.quantite) {
                qteRecue = Math.max(0, parseInt(recu.quantiteRecue));
                isPartial = true;
            }
        }

        // 1. Récupération de l'article source (le "Master")
        const sourceArticle = await Article.findById(item.articleId);
        if (!sourceArticle) throw new Error(`Article source "${item.nomArticle}" introuvable.`);

        let targetArticle = null;

        // 2. LOGIQUE ODOO : Recherche de l'existant dans la boutique cible
        // On cherche par CODE ou par NOM pour éviter tout conflit d'index unique
        if (sourceArticle.code) {
            targetArticle = await Article.findOne({ 
                code: sourceArticle.code.trim(), 
                boutique: mouvement.boutiqueDestination._id 
            });
        }

        if (!targetArticle) {
            targetArticle = await Article.findOne({ 
                nom: sourceArticle.nom, 
                boutique: mouvement.boutiqueDestination._id 
            });
        }

        if (targetArticle) {
            // 3. MISE À JOUR : L'article existe déjà dans cette boutique
            targetArticle.quantite += qteRecue;
            
            // On synchronise les métadonnées pour garder la cohérence avec la Centrale
            targetArticle.nom = sourceArticle.nom;
            targetArticle.code = sourceArticle.code;
            targetArticle.prixAchat = sourceArticle.prixAchat;
            targetArticle.prixVente = sourceArticle.prixVente;
            targetArticle.image = sourceArticle.image;
            targetArticle.categorie = sourceArticle.categorie;

            await targetArticle.save();
        } else {
            // 4. CRÉATION : Nouvel emplacement de stock (Quant)
            // On ne copie que les champs nécessaires pour éviter de copier les timestamps originaux
            await Article.create({
                nom: sourceArticle.nom,
                code: sourceArticle.code,
                prixAchat: sourceArticle.prixAchat,
                prixVente: sourceArticle.prixVente,
                quantite: qteRecue,
                boutique: mouvement.boutiqueDestination._id,
                categorie: sourceArticle.categorie,
                image: sourceArticle.image,
                seuilAlerte: sourceArticle.seuilAlerte,
                fournisseur: sourceArticle.fournisseur
            });
        }

        // 4. RESTAURATION DU STOCK SOURCE SI PARTIEL (Le surplus non reçu retourne à la Centrale)
        if (qteRecue < item.quantite) {
            const surplus = item.quantite - qteRecue;
            await Article.findByIdAndUpdate(item.articleId, { $inc: { quantite: surplus } });
        }
    }

    mouvement.statutTransfert = isPartial ? 'LIVRAISON_PARTIELLE' : 'RECU';
    
    // Préparation du message d'indication pour les utilisateurs (Admin/Expéditeur)
    const notifMsg = isPartial 
        ? `⚠️ Alerte Réception : Le gérant de "${mouvement.boutiqueDestination.nom}" a signalé des articles manquants ou gâtés lors du transfert #${mouvement._id.toString().slice(-6).toUpperCase()}.${commentaire ? ` Note : ${commentaire}` : ""}`
        : `✅ Colis Réceptionné : Le gérant de "${mouvement.boutiqueDestination.nom}" a validé la réception complète du transfert #${mouvement._id.toString().slice(-6).toUpperCase()}.`;

    await Notification.create({
        recipient: mouvement.boutiqueDestination.createur,
        message: notifMsg,
        type: isPartial ? 'warning' : 'success'
    });

    if (isPartial) {
        const motif = commentaire ? ` - Motif: ${commentaire}` : "";
        mouvement.details = (mouvement.details || "") + ` | Réception partielle validée par ${user.nom}${motif}`;
    }
    await mouvement.save();

    // Envoyer une notification aux admins
    await notificationService.sendTransferReceivedAlert(mouvement, user);

    const message = isPartial 
        ? `Réception partielle validée. Le surplus a été retourné automatiquement au ${mouvement.boutiqueSource.nom}.`
        : `Réception validée. Le stock de ${mouvement.boutiqueDestination.nom} a été mis à jour.`;

    return { success: true, message };
};

/**
 * Envoie une notification de rappel aux gérants de la boutique destination
 * pour un transfert en attente de réception.
 */
exports.relancerGerantTransfert = async (mouvementId, user) => {
    const mouvement = await Mouvement.findById(mouvementId).populate('boutiqueDestination');
    
    if (!mouvement || mouvement.statutTransfert !== 'EXPEDIE') {
        throw new Error("Ce transfert n'est pas en attente de réception.");
    }

    // SÉCURITÉ : Seul l'Admin peut envoyer une relance
    if (user.role !== 'Admin') {
        throw new Error("Accès refusé : Seul l'administrateur peut envoyer un rappel.");
    }

    // Récupérer les gérants de la boutique destination
    const boutiqueDest = await Boutique.findById(mouvement.boutiqueDestination).populate('vendeurs');
    if (!boutiqueDest || !boutiqueDest.vendeurs.length) {
        throw new Error("Aucun gérant n'est assigné à la boutique de destination.");
    }

    for (const gerant of boutiqueDest.vendeurs) {
        await Notification.create({
            recipient: gerant._id,
            message: `🔔 Rappel : Un colis (${mouvement.articles.length} articles) est en attente de réception pour votre boutique "${boutiqueDest.nom}". Merci de vérifier et valider le stock.`,
            type: 'info'
        });
    }

    return { success: true, message: "Relance envoyée aux gérants avec succès." };
};

/**
 * Rejette la réception d'un transfert par le gérant de la boutique cible.
 * Le stock est alors retourné à la boutique source (Dépôt Principal).
 */
exports.rejeterReceptionTransfert = async (mouvementId, user, commentaire = '') => {
    const mouvement = await Mouvement.findById(mouvementId).populate('boutiqueSource boutiqueDestination');
    
    if (!mouvement) throw new Error("Bon de transfert introuvable.");

    if (mouvement.statutTransfert !== 'EXPEDIE') {
        throw new Error("Ce transfert ne peut plus être rejeté (déjà reçu ou déjà rejeté).");
    }

    // SÉCURITÉ : Seul un gérant de la boutique de destination (ou un admin) peut rejeter
    const userBoutiqueId = (user.boutique?._id || user.boutique || '').toString();
    const destBoutiqueId = (mouvement.boutiqueDestination?._id || mouvement.boutiqueDestination || '').toString();

    if (user.role !== 'Admin' && userBoutiqueId !== destBoutiqueId) {
        throw new Error("Action refusée : Vous ne pouvez rejeter que les bons destinés à votre boutique.");
    }
    // SÉCURITÉ MULTI-TENANT : Un Admin ne peut rejeter que pour ses propres boutiques
    if (user.role === 'Admin' && mouvement.boutiqueDestination.createur.toString() !== user.id.toString()) {
        throw new Error("Action refusée : Vous ne pouvez rejeter que les bons destinés à vos boutiques.");
    }


    // Retour du stock à la boutique SOURCE (Dépôt Principal)
    for (const item of mouvement.articles) {
        let sourceArticle = await Article.findOne({ 
            nom: item.nomArticle, 
            boutique: mouvement.boutiqueSource._id 
        });

        if (sourceArticle) {
            sourceArticle.quantite += item.quantite;
            await sourceArticle.save();
        } else {
            throw new Error(`Échec du retour : L'article "${item.nomArticle}" n'existe plus dans le stock source.`);
        }
    }

    mouvement.statutTransfert = 'REJETE';
    const motif = commentaire ? ` - Motif: ${commentaire}` : "";
    mouvement.details = (mouvement.details || "") + ` | Rejeté par ${user.nom}${motif}`;
    await mouvement.save();

    return { success: true, message: `Bon de transfert rejeté. Le stock a été retourné au ${mouvement.boutiqueSource.nom}.` };
};

/**
 * --- ANNULATIONS ET PROMOTIONS ---
 */

exports.annulerTransfert = async (mouvementId, user) => {
    const mouvement = await Mouvement.findById(mouvementId).populate('boutiqueSource boutiqueDestination');
    if (!mouvement || mouvement.type !== 'Transfert' || mouvement.isCancelled) {
        throw new Error("Annulation impossible : mouvement invalide ou déjà annulé.");
    }

    // SÉCURITÉ MULTI-TENANT
    if (user.role === 'Admin') {
        const isOwner = (mouvement.boutiqueSource && mouvement.boutiqueSource.createur?.toString() === user.id.toString()) ||
                        (mouvement.boutiqueDestination && mouvement.boutiqueDestination.createur?.toString() === user.id.toString());
        if (!isOwner) throw new Error("Accès refusé : ce mouvement ne concerne pas vos boutiques.");
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
        operateur: user.id || user._id,
        isCancelled: true
    });
};

/**
 * Workflow Ajustement Stock (Inspiration Odoo/SYSCOHADA)
 */
exports.listerAjustements = async (filters = {}, user = null) => {
    const query = { ...filters };
    if (user && user.role === 'Admin') {
        const myBoutiques = await Boutique.find({ createur: user.id }).select('_id');
        query.boutique = { $in: myBoutiques.map(b => b._id) };
    } else if (user && user.role === 'Gérant') {
        query.boutique = user.boutique;
    }
    return await AjustementStock.find(query)
        .populate('article', 'nom code image')
        .populate('boutique', 'nom')
        .populate('gerant', 'nom')
        .populate('adminValidateur', 'nom')
        .sort({ createdAt: -1 });
};

exports.demanderAjustement = async (data, user) => {
    // 1. Vérification de l'existence de l'article et du stock disponible
    const article = await Article.findById(data.article);
    if (!article) throw new Error("Article introuvable.");

    if (article.quantite < data.quantite) {
        throw new Error(`Quantité insuffisante : vous essayez de déclarer une perte de ${data.quantite} unités, mais il n'en reste que ${article.quantite} en stock.`);
    }

    const ajustement = await AjustementStock.create({
        ...data,
        gerant: user.id,
        boutique: user.boutique,
        statut: 'EN_ATTENTE'
    });

    // Notification pour l'Admin
    await notificationService.sendAjustementRequestAlert(ajustement, article, user);
    
    return ajustement;
};

exports.validerAjustement = async (ajustementId, decision, commentaire, adminId) => {
    const ajst = await AjustementStock.findById(ajustementId).populate('article boutique gerant');
    if (!ajst || ajst.statut !== 'EN_ATTENTE') throw new Error("Demande invalide ou déjà traitée.");

    if (decision === 'VALIDE') {
        const article = await Article.findById(ajst.article._id);
        if (article.quantite < ajst.quantite) throw new Error("Stock actuel insuffisant pour appliquer cet ajustement.");

        // Déduction effective du stock physique
        article.quantite -= ajst.quantite;
        await article.save();

        // Création du mouvement de stock pour traçabilité
        await Mouvement.create({
            type: 'Ajustement Stock',
            details: `Ajustement (${ajst.raison}) : ${ajst.justification}`,
            boutiqueSource: ajst.boutique,
            articles: [{ nomArticle: article.nom, quantite: ajst.quantite, articleId: article._id }],
            operateur: adminId
        });

        ajst.statut = 'VALIDE';
    } else {
        ajst.statut = 'REJETE';
    }

    ajst.adminValidateur = adminId;
    ajst.commentaireAdmin = commentaire;
    ajst.dateValidation = new Date();
    await ajst.save();

    await notificationService.sendAjustementStatusAlert(ajst);
    return ajst;
};

exports.annulerApprovisionnement = async (mouvementId, user) => {
    const mouvement = await Mouvement.findById(mouvementId).populate('boutiqueDestination');
    if (!mouvement || mouvement.type !== 'Approvisionnement' || mouvement.isCancelled) throw new Error("Mouvement invalide.");

    // SÉCURITÉ MULTI-TENANT
    if (user.role === 'Admin' && mouvement.boutiqueDestination?.createur?.toString() !== user.id.toString()) {
        throw new Error("Accès refusé : Vous ne pouvez annuler que les approvisionnements de vos propres boutiques.");
    }

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
        operateur: user.id || user._id,
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