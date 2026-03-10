const articleRepository = require('../repositories/articleRepository');
const Article = require('../models/Article'); // Assurez-vous que le modèle est importé
const mongoose = require('mongoose');
const Mouvement = require('../models/Mouvement');
const Notification = require('../models/Notification');

// Doit maintenant accepter un filtre et utiliser populate
exports.listerArticles = async (filter = {}) => {
    // Afficher le fournisseur pour toutes les boutiques sans exception
    return await Article.find(filter).populate('boutique').populate('fournisseur').populate('remiseEnAttente.gerant', 'nom');
};

exports.supprimerArticle = async (id) => {
    // On pourrait ajouter ici une logique pour vérifier si l'article peut être supprimé
    return await articleRepository.deleteById(id);
};

exports.modifierArticle = async (id, data, user) => {
    // 1. Valider que les données ne sont pas vides
    if (Object.keys(data).length === 0) {
        throw new Error("Données de mise à jour vides.");
    }

    // 2. Récupérer l'article existant pour valider les prix
    const articleExistant = await articleRepository.findById(id);
    if (!articleExistant) {
        throw new Error("Article introuvable.");
    }

    // Récupérer l'opérateur qui fait la modification
    const operateurId = user?._id || user?.id;
    let detailsMouvement = '';

    // --- LOGIQUE DE NOTIFICATION (Validation ou Refus Remise) ---
    // Si une remise en attente existait et qu'elle est traitée (remiseEnAttente devient null dans la mise à jour)
    if (articleExistant.remiseEnAttente && articleExistant.remiseEnAttente.valeur && data.remiseEnAttente === null) {
        
        // Cas 1 : Validation (La remise finale correspond à la demande)
        if (Number(data.remise) === articleExistant.remiseEnAttente.valeur) {
            if (articleExistant.remiseEnAttente.gerant) {
                // Sécurisation : on récupère l'ID que le champ soit peuplé (objet) ou non (string)
                const recipientId = articleExistant.remiseEnAttente.gerant._id || articleExistant.remiseEnAttente.gerant;
                await Notification.create({
                    recipient: recipientId,
                    message: `✅ Votre demande de remise de ${articleExistant.remiseEnAttente.valeur}% sur l'article "${articleExistant.nom}" a été approuvée.`,
                    type: 'success'
                });
            }
        } 
        // Cas 2 : Refus (La remise finale est différente ou absente)
        else {
            if (articleExistant.remiseEnAttente.gerant) {
                const recipientId = articleExistant.remiseEnAttente.gerant._id || articleExistant.remiseEnAttente.gerant;
                await Notification.create({
                    recipient: recipientId,
                    message: `❌ Votre demande de remise de ${articleExistant.remiseEnAttente.valeur}% sur l'article "${articleExistant.nom}" a été refusée.`,
                    type: 'error'
                });
            }
        }
    }

    // 3. Logique métier : Vérification des prix
    // On prend le nouveau prix s'il est fourni, sinon on garde l'ancien pour la comparaison.
    const prixVenteFinal = data.prixVente !== undefined ? Number(data.prixVente) : articleExistant.prixVente;
    const prixAchatFinal = data.prixAchat !== undefined ? Number(data.prixAchat) : articleExistant.prixAchat;

    if (prixVenteFinal <= prixAchatFinal) {
        throw new Error("Le prix de vente doit être supérieur au prix d'achat.");
    }

    if (data.quantite !== undefined && Number(data.quantite) < 0) {
        throw new Error("La quantité ne peut pas être négative.");
    }

    // Suivi des modifications de prix
    if (data.prixAchat !== undefined && Number(data.prixAchat) !== articleExistant.prixAchat) {
        detailsMouvement += `P. Achat: ${articleExistant.prixAchat.toLocaleString('fr-FR')} -> ${Number(data.prixAchat).toLocaleString('fr-FR')} GNF. `;
    }
    if (data.prixVente !== undefined && Number(data.prixVente) !== articleExistant.prixVente) {
        detailsMouvement += `P. Vente: ${articleExistant.prixVente.toLocaleString('fr-FR')} -> ${Number(data.prixVente).toLocaleString('fr-FR')} GNF.`;
    }

    // 4. Appel au repository pour la mise à jour
    // La fonction findByIdAndUpdate du repo s'occupera de ne mettre à jour que les champs fournis dans `data`
    const articleModifie = await articleRepository.update(id, data);

    // Créer un mouvement pour la traçabilité si un prix a changé
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

const performStockTransfer = async (sourceId, targetId, items, user, details = '') => {
    // --- VALIDATIONS HORS TRANSACTION ---
    // On effectue toutes les vérifications en amont pour renvoyer des erreurs claires.

    const operateurId = user.id || user._id || user; // Gestion compatibilité (objet user ou ID string)
    const userRole = user.role;

    if (sourceId.toString() === targetId.toString()) {
        const err = new Error("La boutique source et la boutique de destination doivent être différentes.");
        err.statusCode = 400;
        throw err;
    }

    // Ajout de la logique de contrôle des transferts pour respecter la hiérarchie
    const Boutique = require('../models/Boutique');
    const [sourceBoutique, targetBoutique] = await Promise.all([
        Boutique.findById(sourceId),
        Boutique.findById(targetId)
    ]);

    if (!sourceBoutique || !targetBoutique) {
        const err = new Error("Boutique source ou de destination introuvable.");
        err.statusCode = 404;
        throw err;
    }

    // Règle de sécurité : Seul l'Admin peut sortir du stock de la Centrale
    if (sourceBoutique.type === 'Centrale') {
        if (userRole !== 'Admin') { // Seul l'admin peut initier un transfert depuis le dépôt principal
            const err = new Error("Action non autorisée : Seul l'administrateur peut effectuer des mouvements depuis le Dépôt Principal.");
            err.statusCode = 403;
            throw err;
        }
    }

    // items est attendu comme un tableau de { articleId, quantite }
    if (!items || items.length === 0) {
        const err = new Error("La liste d'articles à transférer est vide.");
        err.statusCode = 400;
        throw err;
    }

    // Validation du stock AVANT de démarrer la transaction.
    for (const item of items) {
        const sourceArticle = await Article.findById(item.articleId);
        if (!sourceArticle || sourceArticle.boutique.toString() !== sourceId.toString()) continue; // Ignore if not found in source

        const qtyToTransfer = parseInt(item.quantite);
        if (isNaN(qtyToTransfer) || qtyToTransfer <= 0) continue;

        if (sourceArticle.quantite < qtyToTransfer) {
            // C'est l'erreur que l'utilisateur doit voir.
            const err = new Error(`Stock insuffisant pour l'article "${sourceArticle.nom}". Disponible: ${sourceArticle.quantite}, demandé: ${qtyToTransfer}.`);
            err.statusCode = 400; // Bad Request
            throw err;
        }
    }

    // --- DÉBUT DES OPÉRATIONS (SANS TRANSACTION) ---
    // NOTE : Les transactions ont été retirées pour assurer la compatibilité avec les instances
    // MongoDB autonomes (non-replica set) courantes en environnement de développement.
    // Pour un environnement de production, il est fortement recommandé de réactiver les transactions
    // et d'utiliser une base de données configurée en replica set pour garantir l'atomicité.
    try {
        let transferCount = 0;

        for (const item of items) {
            const qtyToTransfer = parseInt(item.quantite);
            if (isNaN(qtyToTransfer) || qtyToTransfer <= 0) continue;

            const sourceArticle = await Article.findById(item.articleId);
            if (!sourceArticle || sourceArticle.boutique.toString() !== sourceId.toString()) continue;

            // Re-vérification du stock pour éviter les "race conditions" (conflits d'accès)
            if (sourceArticle.quantite < qtyToTransfer) {
                throw new Error(`Conflit de stock pour "${sourceArticle.nom}". Le stock a changé durant l'opération.`);
            }

            let targetArticle = await Article.findOne({ nom: sourceArticle.nom, boutique: targetId });

            if (targetArticle) {
                targetArticle.quantite += qtyToTransfer;
                await targetArticle.save();
            } else {
                const newArticleData = sourceArticle.toObject();
                delete newArticleData._id;
                delete newArticleData.createdAt;
                delete newArticleData.updatedAt;
                delete newArticleData.__v;
                newArticleData.boutique = targetId;
                newArticleData.quantite = qtyToTransfer;
                await Article.create([newArticleData]);
            }

            sourceArticle.quantite -= qtyToTransfer;
            await sourceArticle.save();
            
            transferCount++;
        }
        const articlesDeplaces = await Promise.all(items.map(async item => {
            const article = await Article.findById(item.articleId).select('nom').lean();
            return { nomArticle: article.nom, quantite: item.quantite };
        }));

        await Mouvement.create({
            type: 'Transfert',
            boutiqueSource: sourceId,
            boutiqueDestination: targetId,
            articles: articlesDeplaces,
            operateur: operateurId,
            details: details || `Transfert de ${sourceBoutique.nom} vers ${targetBoutique.nom}`
        });

        return { modifiedCount: transferCount };

    } catch (error) {
        console.error("ERREUR CRITIQUE pendant le transfert de stock (non-transactionnel):", error);
        throw new Error(`Une erreur est survenue pendant le transfert. L'état du stock peut être incohérent. Erreur: ${error.message}`);
    }
};

exports.transfererStock = async (sourceId, targetId, articles, user, details) => {
    return await performStockTransfer(sourceId, targetId, articles, user, details);
};

exports.effectuerReapprovisionnement = async (targetBoutiqueId, articles, user, details) => {
    const Boutique = require('../models/Boutique');
    const centrale = await Boutique.findOne({ type: 'Centrale' });
    if (!centrale) {
        const err = new Error("Aucun Dépôt Principal n'est configuré pour le réapprovisionnement.");
        err.statusCode = 400;
        throw err;
    }

    const target = await Boutique.findById(targetBoutiqueId);
    if (!target || target.type !== 'Secondaire') {
        const err = new Error("La boutique de destination pour le réapprovisionnement doit être une boutique secondaire.");
        err.statusCode = 400;
        throw err;
    }

    // Transformation des articles : On a reçu les IDs des articles de la boutique CIBLE (Secondaire)
    // On doit trouver les articles correspondants dans la boutique SOURCE (Centrale) pour effectuer le transfert
    const itemsToTransfer = [];
    
    for (const item of articles) {
        // 1. Trouver l'article cible pour avoir son nom
        const targetArticle = await Article.findById(item.articleId);
        if (!targetArticle) continue;

        // 2. Trouver l'article source correspondant (même nom, boutique Centrale)
        const sourceArticle = await Article.findOne({ nom: targetArticle.nom, boutique: centrale._id });
        
        if (sourceArticle) {
            itemsToTransfer.push({ articleId: sourceArticle._id, quantite: item.quantite });
        }
    }

    return await performStockTransfer(centrale._id, targetBoutiqueId, itemsToTransfer, user, "Réapprovisionnement");
};

exports.annulerTransfert = async (mouvementId, operateurId) => {
    const mouvement = await Mouvement.findById(mouvementId);
    if (!mouvement) throw new Error("Mouvement introuvable.");
    if (mouvement.type !== 'Transfert') throw new Error("Seuls les transferts peuvent être annulés.");
    if (mouvement.isCancelled) throw new Error("Ce transfert est déjà annulé.");

    // La destination originale devient la source pour l'annulation
    const sourceId = mouvement.boutiqueDestination;
    const targetId = mouvement.boutiqueSource;

    // Vérifier que les boutiques existent toujours
    const Boutique = require('../models/Boutique');
    const sourceBoutique = await Boutique.findById(sourceId);
    const targetBoutique = await Boutique.findById(targetId);

    if (!sourceBoutique || !targetBoutique) throw new Error("Une des boutiques concernées n'existe plus.");

    // Pour chaque article du mouvement, on fait le chemin inverse
    for (const item of mouvement.articles) {
        // 1. Trouver l'article dans la boutique qui a reçu le stock (Destination originale)
        const articleInDest = await Article.findOne({ nom: item.nomArticle, boutique: sourceId });
        
        if (!articleInDest) throw new Error(`Impossible d'annuler : L'article "${item.nomArticle}" n'existe plus dans la boutique de destination.`);
        if (articleInDest.quantite < item.quantite) throw new Error(`Impossible d'annuler : Stock insuffisant pour "${item.nomArticle}" dans la boutique de destination (Stock actuel: ${articleInDest.quantite}, Requis: ${item.quantite}).`);

        // 2. Trouver l'article dans la boutique qui avait envoyé le stock (Source originale)
        let articleInSource = await Article.findOne({ nom: item.nomArticle, boutique: targetId });

        // 3. Effectuer le mouvement inverse
        articleInDest.quantite -= item.quantite;
        await articleInDest.save();

        if (articleInSource) {
            articleInSource.quantite += item.quantite;
            await articleInSource.save();
        } else {
            // Si l'article n'existe plus dans la source (supprimé entre temps), on le recrée
            await Article.create({
                nom: item.nomArticle,
                prixAchat: articleInDest.prixAchat,
                prixVente: articleInDest.prixVente,
                quantite: item.quantite,
                boutique: targetId,
                fournisseur: articleInDest.fournisseur // Conserver le fournisseur d'origine
            });
        }
    }

    // Marquer le mouvement comme annulé
    mouvement.isCancelled = true;
    await mouvement.save();

    // Créer un mouvement de compensation pour la traçabilité
    await Mouvement.create({
        type: 'Transfert',
        details: `ANNULATION du transfert du ${mouvement.createdAt.toLocaleDateString()}`,
        boutiqueSource: sourceId,
        boutiqueDestination: targetId,
        articles: mouvement.articles,
        operateur: operateurId,
        isCancelled: true // Marqué comme annulé/technique pour ne pas le ré-annuler
    });

    return { message: "Transfert annulé avec succès. Le stock a été rétabli." };
};

exports.annulerApprovisionnement = async (mouvementId, operateurId) => {
    const mouvement = await Mouvement.findById(mouvementId);
    if (!mouvement) throw new Error("Mouvement introuvable.");
    if (mouvement.type !== 'Approvisionnement') throw new Error("Ce n'est pas un approvisionnement.");
    if (mouvement.isCancelled) throw new Error("Cet approvisionnement est déjà annulé.");

    const boutiqueId = mouvement.boutiqueDestination;
    
    // Pour chaque article, on retire la quantité ajoutée
    for (const item of mouvement.articles) {
        const article = await Article.findOne({ nom: item.nomArticle, boutique: boutiqueId });
        
        if (!article) throw new Error(`Impossible d'annuler : L'article "${item.nomArticle}" n'existe plus dans la boutique.`);
        if (article.quantite < item.quantite) throw new Error(`Impossible d'annuler : Stock insuffisant pour "${item.nomArticle}" (Stock actuel: ${article.quantite}, Requis: ${item.quantite}).`);

        article.quantite -= item.quantite;
        await article.save();
    }

    // Marquer le mouvement comme annulé
    mouvement.isCancelled = true;
    await mouvement.save();

    // Créer un mouvement de compensation (Sortie de stock)
    await Mouvement.create({
        type: 'Approvisionnement',
        details: `ANNULATION Approvisionnement du ${mouvement.createdAt.toLocaleDateString()}`,
        boutiqueSource: boutiqueId, // Le stock sort de la boutique
        fournisseur: mouvement.fournisseur,
        articles: mouvement.articles,
        operateur: operateurId,
        isCancelled: true // Marqué comme annulé/technique
    });

    return { message: "Approvisionnement annulé avec succès. Le stock a été déduit." };
};

exports.appliquerPromoPeremption = async (jours, pourcentage, user) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + parseInt(jours));
    
    // Trouver les articles qui expirent entre aujourd'hui et la date cible
    // et qui n'ont pas déjà une promo active supérieure ou égale
    const articles = await Article.find({
        datePeremption: { $gte: today, $lte: targetDate },
        quantite: { $gt: 0 }
    });

    let count = 0;
    for (const article of articles) {
        article.promo = parseInt(pourcentage);
        article.promoActive = true;
        article.dateDebutPromo = new Date();
        article.dateFinPromo = article.datePeremption; // La promo dure jusqu'à la péremption
        await article.save();
        count++;
    }
    
    return { modifiedCount: count };
};