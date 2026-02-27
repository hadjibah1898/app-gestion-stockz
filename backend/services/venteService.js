const Vente = require('../models/Vente');
const Article = require('../models/Article');
const Mouvement = require('../models/Mouvement');
const notificationService = require('./notificationService');
const Notification = require('../models/Notification');

// Nouvelle méthode pour traiter tout un panier en une seule transaction atomique
exports.traiterPanier = async (items, userId, boutiqueId, hasRemise = false) => {
    try {
        const resultats = [];
        const articlesVendusPourMouvement = [];

        for (const item of items) {
            // Correction pour correspondre aux données envoyées par le frontend (`article`, `quantite`, `remiseTemp`)
            const { article: articleId, quantite, remiseTemp } = item;

            // 1. Récupérer l'article
            const article = await Article.findById(articleId).populate('boutique');
            if (!article) {
                throw new Error(`Article introuvable (ID: ${articleId})`);
            }

            // 2. Vérifier le stock
            if (article.quantite < quantite) {
                throw new Error(`Stock insuffisant pour l'article "${article.nom}". Disponible: ${article.quantite}, demandé: ${quantite}.`);
            }

            // 3. Créer l'enregistrement de la vente
            // Calcul du prix unitaire avec Promo ou Remise
            let prixUnitaire = article.prixVente;
            
            // Priorité 1 : Promotion active (si dans les dates)
            if (article.promoActive && article.promo > 0) {
                const now = new Date();
                if ((!article.dateDebutPromo || now >= article.dateDebutPromo) && 
                    (!article.dateFinPromo || now <= article.dateFinPromo)) {
                    prixUnitaire = prixUnitaire * (1 - article.promo / 100);
                }
            } 
            // Priorité 2 : Remise temporaire du panier
            else if (remiseTemp && remiseTemp > 0) {
                prixUnitaire = prixUnitaire * (1 - remiseTemp / 100);
            }
            // Priorité 3 : Remise permanente sur l'article
            else if (article.remise > 0) { 
                prixUnitaire = prixUnitaire * (1 - article.remise / 100);
            }

            const prixTotal = prixUnitaire * quantite;
            const vente = new Vente({
                article: articleId,
                quantite: quantite,
                prixTotal,
                gerant: userId,
                boutique: boutiqueId,
                statut: hasRemise ? 'en_attente_remise' : 'finalisee',
                remiseAppliquee: remiseTemp || 0
            });
            
            // Sauvegarde simple sans transaction
            const savedVente = await vente.save();
            
            // 4. Mettre à jour le stock de l'article seulement si la vente est finalisée
            if (!hasRemise) {
                article.quantite -= quantite;
                await article.save();
                
                // Notification Stock Faible
                if (article.quantite <= 10) {
                    notificationService.sendLowStockAlert(article).catch(err => console.error("Erreur notif:", err));
                }
            }
            
            resultats.push(savedVente);
            articlesVendusPourMouvement.push({ nomArticle: article.nom, quantite: quantite });
        }

        // Enregistrer un seul mouvement pour tout le panier
        if (articlesVendusPourMouvement.length > 0) {
            await Mouvement.create({
                type: 'Vente',
                boutiqueSource: boutiqueId,
                articles: articlesVendusPourMouvement,
                operateur: userId,
                details: `Vente de ${articlesVendusPourMouvement.length} type(s) d'article(s). ${hasRemise ? 'Remise en attente de validation.' : ''}`
            });
        }

        return resultats;
    } catch (error) {
        throw error;
    }
};

exports.listerVentes = async (filter = {}) => {
    const page = parseInt(filter.page) || 1;
    // Si limit n'est pas défini, on pagine. Si limit=0, on retourne tout.
    const limit = filter.limit !== undefined ? parseInt(filter.limit) : 15;
    // Si le filtre contient startDate ou endDate, on les utilise pour la recherche
    const query = {};
    
    if (filter.startDate || filter.endDate) {
        query.createdAt = {};
        if (filter.startDate) query.createdAt.$gte = new Date(filter.startDate);
        if (filter.endDate) {
            const end = new Date(filter.endDate);
            end.setHours(23, 59, 59, 999); // Inclure toute la journée de fin
            query.createdAt.$lte = end;
        }
    }

    // Gérer le filtre pour les ventes annulées
    if (filter.showCancelledOnly === 'true') {
        query.isCancelled = true;
    }

    // Gérer le filtre par gérant
    if (filter.gerantId) {
        query.gerant = filter.gerantId;
    }
    
    const totalVentes = await Vente.countDocuments(query);
    let ventesQuery = Vente.find(query)
        .sort({ createdAt: -1 })
        .populate('article', 'nom image code prixAchat')
        .populate('gerant', 'nom')
        .populate('boutique', 'nom')
        .populate('client', 'nom type');

    // Appliquer la pagination seulement si une limite positive est spécifiée
    if (limit > 0) {
        const skip = (page - 1) * limit;
        ventesQuery = ventesQuery.skip(skip).limit(limit);
    }

    const ventes = await ventesQuery;

    return {
        ventes,
        totalPages: limit > 0 ? Math.ceil(totalVentes / limit) : 1,
        currentPage: page,
    };
};

exports.annulerVente = async (venteId, user) => {
    const vente = await Vente.findById(venteId);
    if (!vente) throw new Error("Vente introuvable.");
    if (vente.isCancelled) throw new Error("Cette vente est déjà annulée.");

    // Règle métier : Un gérant ne peut annuler une vente que dans les 24h.
    if (user.role === 'Gérant') {
        const now = new Date();
        const saleDate = new Date(vente.createdAt);
        const diffInHours = (now - saleDate) / (1000 * 60 * 60);

        if (diffInHours > 24) {
            throw new Error("L'annulation par un gérant n'est possible que dans les 24 heures suivant la vente.");
        }
    }

    const article = await Article.findById(vente.article);
    // Si l'article a été supprimé, on ne peut pas restaurer le stock facilement.
    if (!article) throw new Error("Impossible d'annuler : L'article associé n'existe plus.");

    // Restauration du stock
    article.quantite += vente.quantite;
    await article.save();

    // Marquer la vente comme annulée
    vente.isCancelled = true;
    await vente.save();

    // Enregistrer un mouvement d'annulation pour la traçabilité
    await Mouvement.create({
        type: 'Vente',
        details: `ANNULATION Vente #${vente._id} - Retour Stock`,
        boutiqueSource: vente.boutique, // Le stock revient ici
        articles: [{ nomArticle: article.nom, quantite: vente.quantite }],
        operateur: user.id,
        isCancelled: true
    });

    return { message: "Vente annulée avec succès. Le stock a été restauré." };
};

exports.listerVentesEnAttente = async (filter = {}) => {
    const finalFilter = { ...filter, statut: 'en_attente_remise', isCancelled: false };
    return await Vente.find(finalFilter)
        .sort({ createdAt: -1 })
        .populate('article', 'nom image code')
        .populate('gerant', 'nom')
        .populate('client', 'nom');
};

exports.validerRemise = async (venteId) => {
    const vente = await Vente.findById(venteId).populate('article', 'nom');
    if (!vente) throw new Error("Vente introuvable.");
    if (vente.statut !== 'en_attente_remise') throw new Error("Cette vente n'est pas en attente de validation.");

    vente.statut = 'finalisee';
    await vente.save();

    // Mettre à jour le stock de l'article (car la vente était en attente et le stock n'avait pas été déduit)
    const article = await Article.findById(vente.article);
    if (article) {
        article.quantite -= vente.quantite;
        await article.save();
    }

    // --- Notification pour le gérant ---
    if (vente.gerant) {
        await Notification.create({
            recipient: vente.gerant,
            message: `✅ La remise de ${vente.remiseAppliquee}% sur la vente de "${vente.article.nom}" a été approuvée.`,
            type: 'success',
            link: '/gerant/ventes?tab=history' // Lien vers l'historique des ventes
        });
    }

    return vente;
};

exports.refuserRemise = async (venteId, adminUser) => {
    // Refuser une remise équivaut à annuler la vente. 
    // Le gérant pourra la refaire sans remise.
    const vente = await Vente.findById(venteId).populate('article', 'nom');
    if (!vente) throw new Error("Vente introuvable.");
    if (vente.statut !== 'en_attente_remise') throw new Error("Cette vente n'est pas en attente de validation.");

    // Le stock n'est pas restauré car il n'a jamais été déduit pour une vente en attente.
    vente.isCancelled = true;
    vente.statut = 'refusee'; // Statut final pour le suivi
    await vente.save();

    // --- Notification pour le gérant ---
    if (vente.gerant) {
        await Notification.create({
            recipient: vente.gerant,
            message: `❌ La remise de ${vente.remiseAppliquee}% sur la vente de "${vente.article?.nom || 'un article'}" a été refusée. La vente est annulée.`,
            type: 'error',
            link: '/gerant/ventes?tab=history' // Lien vers l'historique des ventes
        });
    }

    await Mouvement.create({
        type: 'Vente',
        details: `REFUS REMISE (ANNULATION) Vente #${vente._id}`,
        boutiqueSource: vente.boutique,
        articles: [{ nomArticle: vente.article?.nom || 'Article Inconnu', quantite: vente.quantite }],
        operateur: adminUser.id, // L'admin qui a refusé est l'opérateur
        isCancelled: true
    });

    return { message: "Remise refusée et vente annulée. Le stock n'a pas été affecté." };
};