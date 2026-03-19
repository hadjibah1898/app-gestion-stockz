const Vente = require('../models/Vente');
const Article = require('../models/Article');
const User = require('../models/User');
const Mouvement = require('../models/Mouvement');
const Client = require('../models/Client');
const notificationService = require('./notificationService');
const DebtMovement = require('../models/DebtMovement'); // Importer le nouveau modèle

// Nouvelle méthode pour traiter tout un panier en une seule transaction atomique
exports.traiterPanier = async (items, userId, boutiqueId, hasRemise = false, clientId = null, montantPaye = null, echeanceDette = null, ouvertureCaisseId = null) => {
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
            // Priorité 2 : Remise temporaire du panier (en GNF)
            else if (remiseTemp && remiseTemp > 0) {
                // Validation backend: la remise ne peut pas être supérieure au prix
                if (remiseTemp > prixUnitaire) {
                    throw new Error(`La remise (${remiseTemp}) pour l'article "${article.nom}" ne peut pas être supérieure à son prix (${prixUnitaire}).`);
                }
                prixUnitaire = prixUnitaire - remiseTemp;
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
                statut: 'finalisee',
                remiseAppliquee: remiseTemp || 0,
                ouvertureCaisse: ouvertureCaisseId, // Association de la vente à la session de caisse
                client: clientId // Ajout de l'ID client à chaque vente
            });
            
            // Sauvegarde simple sans transaction
            const savedVente = await vente.save();
            
            // 4. Mettre à jour le stock de l'article (Toujours, car la vente est finalisée immédiatement)
            if (true) {
                article.quantite -= quantite;
                await article.save();
                
                // Notification Stock Faible
                if (article.quantite <= 10) {
                    notificationService.sendLowStockAlert(article).catch(err => console.error("Erreur notif:", err));
                }
            }
            
            resultats.push(savedVente);
            articlesVendusPourMouvement.push({ articleId: article._id, nomArticle: article.nom, quantite: quantite, prixAchatUnitaire: article.prixAchat });
        }

        const totalVentePanier = resultats.reduce((acc, v) => acc + v.prixTotal, 0);

        // Gestion de la dette et mise à jour du client
        if (clientId) {
            const client = await Client.findById(clientId);
            if (!client) {
                // Si le client n'est pas trouvé, on ne bloque pas la vente mais on log une erreur
                console.error(`Client avec ID ${clientId} non trouvé. Impossible de mettre à jour la dette ou le total des achats.`);
            } else {
                // Mettre à jour le total des achats du client
                client.totalAchats += totalVentePanier;

                // Gestion Automatique des Commissions pour les Ouvriers
                if (client.type === 'Ouvrier' && client.tauxCommission > 0) {
                    const commissionGagnee = (totalVentePanier * client.tauxCommission) / 100;
                    client.commission = (client.commission || 0) + commissionGagnee;
                }

                // Vérifier s'il y a une dette
                if (montantPaye !== null && montantPaye < totalVentePanier) {
                    const soldeAnterieur = client.dette;
                    const detteAAjouter = totalVentePanier - montantPaye;
                    client.dette += detteAAjouter;
                    const nouveauSolde = client.dette;
                    
                    // Mettre à jour l'échéance de la dette
                    if (echeanceDette) {
                        client.echeanceDette = echeanceDette;
                    }

                    // Enregistrer le mouvement de dette
                    await DebtMovement.create({
                        client: clientId,
                        type: 'CREATION',
                        montant: detteAAjouter,
                        soldeAnterieur: soldeAnterieur,
                        nouveauSolde: nouveauSolde,
                        operateur: userId,
                        // On pourrait lier la première vente du panier pour référence
                        venteAssociee: resultats.length > 0 ? resultats[0]._id : null 
                    });

                    // Alerter les admins qu'une dette a été accordée
                    const gerant = await User.findById(userId);
                    if (gerant) {
                        notificationService.sendDebtGrantedAlert(gerant, client, detteAAjouter, totalVentePanier)
                            .catch(err => console.error("Erreur lors de la notification de dette :", err));
                    }
                }
                await client.save();
            }
        }

        // Enregistrer un seul mouvement pour tout le panier
        if (articlesVendusPourMouvement.length > 0) {
            let details = `Vente de ${articlesVendusPourMouvement.length} article(s) pour un total de ${totalVentePanier.toLocaleString('fr-FR')} GNF.`;

            if (hasRemise) {
                const remises = items
                    .filter(item => item.remiseTemp > 0)
                    .map(item => `${item.remiseTemp.toLocaleString('fr-FR')} GNF`);
                
                details += ` Remise(s) appliquée(s): ${[...new Set(remises)].join(', ')}.`;

                // Alerter les admins qu'une remise a été appliquée
                const gerant = await User.findById(userId);
                const client = clientId ? await Client.findById(clientId) : null;
                if (gerant) {
                    notificationService.sendDiscountGrantedAlert(gerant, remises, totalVentePanier, client?.nom)
                        .catch(err => console.error("Erreur lors de la notification de remise :", err));
                }
            }

            await Mouvement.create({
                type: 'Vente',
                boutiqueSource: boutiqueId,
                articles: articlesVendusPourMouvement,
                operateur: userId,
                details: details
            });
        }

        return resultats
    } catch (error) {
        throw error;
    }
};

exports.listerVentes = async (filter = {}, user = null) => {
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

    // Si l'utilisateur est un gérant, on force le filtre sur son ID pour la sécurité.
    if (user && user.role === 'Gérant') {
        query.gerant = user.id;
    } else if (filter.gerantId) { // Sinon, si un filtre admin est passé, on l'utilise.
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
        type: 'Annulation Vente',
        details: `Annulation de la vente #${vente._id}. Retour de ${vente.quantite} unité(s) en stock.`,
        boutiqueSource: vente.boutique, // Le stock revient ici
        articles: [{ articleId: article._id, nomArticle: article.nom, quantite: vente.quantite, prixAchatUnitaire: article.prixAchat }],
        operateur: user.id,
        isCancelled: true
    });

    return { message: "Vente annulée avec succès. Le stock a été restauré." };
};