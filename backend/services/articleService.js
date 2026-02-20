const articleRepository = require('../repositories/articleRepository');
const Article = require('../models/Article'); // Assurez-vous que le modèle est importé
const Mouvement = require('../models/Mouvement');

// Doit maintenant accepter un filtre et utiliser populate
exports.listerArticles = async (filter = {}) => {
    return await Article.find(filter).populate('boutique');
};

exports.supprimerArticle = async (id) => {
    // On pourrait ajouter ici une logique pour vérifier si l'article peut être supprimé
    return await articleRepository.deleteById(id);
};

exports.modifierArticle = async (id, data) => {
    // 1. Valider que les données ne sont pas vides
    if (Object.keys(data).length === 0) {
        throw new Error("Données de mise à jour vides.");
    }

    // 2. Récupérer l'article existant pour valider les prix
    const articleExistant = await articleRepository.findById(id);
    if (!articleExistant) {
        throw new Error("Article introuvable.");
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

    // 4. Appel au repository pour la mise à jour
    // La fonction findByIdAndUpdate du repo s'occupera de ne mettre à jour que les champs fournis dans `data`
    const articleModifie = await articleRepository.update(id, data);

    return articleModifie;
};

const performStockTransfer = async (sourceId, targetId, items, user, details = '') => {
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
        if (userRole !== 'Admin') {
            const err = new Error("Action non autorisée : Seul l'administrateur peut effectuer des mouvements depuis la Boutique Centrale.");
            err.statusCode = 403;
            throw err;
        }
    }

    let transferCount = 0;

    // items est attendu comme un tableau de { articleId, quantite }
    if (!items || items.length === 0) {
        return { modifiedCount: 0 };
    }

    for (const item of items) {
        const sourceArticle = await Article.findById(item.articleId);
        if (!sourceArticle) continue;

        // Vérification d'appartenance
        if (sourceArticle.boutique.toString() !== sourceId.toString()) continue;

        const qtyToTransfer = parseInt(item.quantite);
        if (isNaN(qtyToTransfer) || qtyToTransfer <= 0) continue;

        if (sourceArticle.quantite < qtyToTransfer) {
            throw new Error(`Stock insuffisant pour l'article "${sourceArticle.nom}". Disponible: ${sourceArticle.quantite}`);
        }

        // Chercher l'article correspondant dans la boutique de destination
        let targetArticle = await Article.findOne({ 
            nom: sourceArticle.nom, 
            boutique: targetId 
        });

        if (targetArticle) {
            // Mise à jour du stock existant
            targetArticle.quantite += qtyToTransfer;
            await targetArticle.save();
        } else {
            // Création d'un nouvel article dans la destination
            const newArticleData = sourceArticle.toObject();
            delete newArticleData._id;
            delete newArticleData.createdAt;
            delete newArticleData.updatedAt;
            delete newArticleData.__v;
            newArticleData.boutique = targetId;
            newArticleData.quantite = qtyToTransfer;
            await Article.create(newArticleData);
        }

        // Décrémenter le stock source
        sourceArticle.quantite -= qtyToTransfer;
        await sourceArticle.save();
        
        transferCount++;
    }

    // Enregistrer le mouvement de stock
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
};

exports.transfererStock = async (sourceId, targetId, articles, user, details) => {
    return await performStockTransfer(sourceId, targetId, articles, user, details);
};

exports.effectuerReapprovisionnement = async (targetBoutiqueId, articles, user, details) => {
    const Boutique = require('../models/Boutique');
    const centrale = await Boutique.findOne({ type: 'Centrale' });
    if (!centrale) {
        const err = new Error("Aucune Boutique Centrale n'est configurée pour le réapprovisionnement.");
        err.statusCode = 400;
        throw err;
    }

    const target = await Boutique.findById(targetBoutiqueId);
    if (!target || target.type !== 'Secondaire') {
        const err = new Error("La boutique de destination pour le réapprovisionnement doit être une boutique secondaire.");
        err.statusCode = 400;
        throw err;
    }

    return await performStockTransfer(centrale._id, targetBoutiqueId, articles, user, "Réapprovisionnement");
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
                boutique: targetId
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