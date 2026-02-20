const Vente = require('../models/vente');
const Article = require('../models/Article');
const Mouvement = require('../models/Mouvement');
const notificationService = require('./notificationService');

// Nouvelle méthode pour traiter tout un panier en une seule transaction atomique
exports.traiterPanier = async (items, userId, boutiqueId) => {
    try {
        const resultats = [];
        const articlesVendusPourMouvement = [];

        for (const item of items) {
            // Correction pour correspondre aux données envoyées par le frontend (`article` et `quantite`)
            const { article: articleId, quantite } = item;

            // 1. Récupérer l'article
            const article = await Article.findById(articleId).populate('boutique');
            if (!article) {
                throw new Error(`Article introuvable (ID: ${articleId})`);
            }

            // 2. Vérifier le stock
            if (article.quantite < quantite) {
                throw new Error(`Stock insuffisant pour l'article "${article.nom}". Disponible: ${article.quantite}, demandé: ${quantite}.`);
            }

            // 3. Mettre à jour le stock de l'article
            article.quantite -= quantite;
            await article.save();

            // Notification Stock Faible
            if (article.quantite <= 10) {
                notificationService.sendLowStockAlert(article).catch(err => console.error("Erreur notif:", err));
            }

            // 4. Créer l'enregistrement de la vente
            const prixTotal = article.prixVente * quantite;
            const vente = new Vente({
                article: articleId,
                quantite: quantite,
                prixTotal,
                gerant: userId,
                boutique: boutiqueId
            });
            // Sauvegarde simple sans transaction
            const savedVente = await vente.save();
            
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
                details: `Vente de ${articlesVendusPourMouvement.length} type(s) d'article(s).`
            });
        }

        return resultats;
    } catch (error) {
        throw error;
    }
};

exports.listerVentes = async (filter = {}) => {
    return await Vente.find(filter).sort({ createdAt: -1 }).populate('article', 'nom image').populate('gerant', 'nom').populate('boutique', 'nom');
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