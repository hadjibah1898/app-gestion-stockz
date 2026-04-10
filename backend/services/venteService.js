const Vente = require('../models/Vente');
const Article = require('../models/Article');
const User = require('../models/User');
const Mouvement = require('../models/Mouvement');
const Client = require('../models/Client');
const notificationService = require('./notificationService');
const DebtMovement = require('../models/DebtMovement'); // Importer le nouveau modèle
const mongoose = require('mongoose');
const { logAction } = require('./auditLogService');

// Nouvelle méthode pour traiter tout un panier en une seule transaction atomique
exports.traiterPanier = async (items, userId, boutiqueId, hasRemise = false, clientId = null, montantPaye = null, echeanceDette = null, ouvertureCaisseId = null) => {
    try {
        // SÉCURITÉ : Vérifier que la session de caisse appartient bien au gérant et est ouverte
        const sessionActive = await mongoose.model('OuvertureCaisse').findOne({ 
            _id: ouvertureCaisseId, 
            gerant: userId, 
            statut: 'OUVERTE' 
        });
        if (!sessionActive) throw new Error("Session de caisse invalide ou fermée.");

        const itemsVendus = [];
        const articlesPourMvt = [];

        for (const item of items) {
            // Correction pour correspondre aux données envoyées par le frontend (`article`, `quantite`, `remiseTemp`)
            const { article: articleId, quantite, remiseTemp, remiseType } = item; // Récupérer remiseType

            // 1. Déduire le stock de manière atomique (pour une seule opération)
            const article = await Article.findOneAndUpdate(
                { _id: articleId, quantite: { $gte: quantite } },
                { $inc: { quantite: -quantite } },
                { new: true } 
            ).populate({ path: 'boutique' });

            if (!article) {
                const exists = await Article.findById(articleId);
                if (!exists) {
                    throw new Error(`Article introuvable (ID: ${articleId})`);
                } else {
                    throw new Error(`Stock insuffisant pour l'article "${exists.nom}". Disponible: ${exists.quantite}, demandé: ${quantite}.`);
                }
            }
            
            // 2. Créer l'enregistrement de la vente
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
            else if (remiseTemp && remiseTemp > 0) { // Si une remise temporaire est appliquée
                if (remiseType === 'pourcentage') {
                    if (remiseTemp > 100) {
                        throw new Error(`La remise en pourcentage (${remiseTemp}%) pour l'article "${article.nom}" ne peut pas dépasser 100%.`);
                    }
                    prixUnitaire = prixUnitaire * (1 - remiseTemp / 100);
                } else { // remiseType === 'montant'
                    // Validation backend: la remise ne peut pas être supérieure au prix
                    if (remiseTemp > prixUnitaire) {
                        throw new Error(`La remise (${remiseTemp}) pour l'article "${article.nom}" ne peut pas être supérieure à son prix (${prixUnitaire}).`);
                    }
                    prixUnitaire = prixUnitaire - remiseTemp;
                }
            }
            // Priorité 3 : Remise permanente sur l'article
            else if (article.remise > 0) { 
                prixUnitaire = prixUnitaire * (1 - article.remise / 100);
            }

            // Validation de sécurité : Empêcher la vente à perte à cause des remises
            if (prixUnitaire < article.prixAchat) {
                throw new Error(`Vente refusée pour l'article "${article.nom}" : Le prix remisé (${prixUnitaire.toLocaleString('fr-FR')} GNF) est inférieur au prix d'achat (${article.prixAchat.toLocaleString('fr-FR')} GNF).`);
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
                remiseType: remiseType || 'montant', // Enregistrer le type de remise
                ouvertureCaisse: ouvertureCaisseId, // Association de la vente à la session de caisse
                client: clientId // Ajout de l'ID client à chaque vente
            });
            
            const savedVente = await vente.save();
            
            // Notification Stock Faible (effet de bord, non transactionnel, ce qui est normal)
            if (article.quantite <= 10) {
                notificationService.sendLowStockAlert(article).catch(err => console.error("Erreur notif:", err));
            }
            
            itemsVendus.push(savedVente);
            articlesPourMvt.push({ articleId: article._id, nomArticle: article.nom, quantite: quantite, prixAchatUnitaire: article.prixAchat });
        }

        const totalVentePanier = itemsVendus.reduce((acc, v) => acc + v.prixTotal, 0);

        // SÉCURITÉ : Validation de la cohérence du paiement après recalcul backend
        const isDette = montantPaye !== null && montantPaye < totalVentePanier;
        if (isDette && (!clientId || !echeanceDette)) {
            throw new Error("Un client et une échéance sont obligatoires pour une vente à crédit.");
        }

        // 3. Gestion de la dette et mise à jour du client
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
                        venteAssociee: itemsVendus.length > 0 ? itemsVendus[0]._id : null 
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

        // 4. Enregistrer un seul mouvement pour tout le panier
        if (articlesPourMvt.length > 0) {
            const resteAPayer = totalVentePanier - (montantPaye !== null ? montantPaye : totalVentePanier);
            const refVente = itemsVendus[0]?._id.toString().slice(-6).toUpperCase();
            
            let details = `🛒 Vente #${refVente} : ${articlesPourMvt.length} article(s) | Total : ${totalVentePanier.toLocaleString('fr-FR')} GNF`;
            
            if (resteAPayer > 0) {
                details += ` | Encaissé : ${montantPaye.toLocaleString('fr-FR')} GNF | Dette : ${resteAPayer.toLocaleString('fr-FR')} GNF`;
            } else {
                details += ` | Règlement : Comptant`;
            }

            if (hasRemise) {
                const remises = items
                    .filter(item => item.remiseTemp > 0)
                    .map(item => `${item.remiseTemp.toLocaleString('fr-FR')}${item.remiseType === 'pourcentage' ? '%' : ' GNF'}`);
                
                details += ` | 🏷️ Remise(s): ${[...new Set(remises)].join(', ')}`;

                // Alerter les admins qu'une remise a été appliquée
                const gerant = await User.findById(userId);
                const client = clientId ? await Client.findById(clientId) : null;
                if (gerant) {
                    notificationService.sendDiscountGrantedAlert(gerant, remises, totalVentePanier, client?.nom)
                        .catch(err => console.error("Erreur lors de la notification de remise :", err));
                }
            }

            await Mouvement.create([{
                type: 'Vente',
                boutiqueSource: boutiqueId,
                articles: articlesPourMvt,
                operateur: userId,
                details: details
            }]);
        }

        return itemsVendus;
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
        // SÉCURITÉ : Filtrer aussi par la boutique actuelle du gérant
        // Cela évite d'afficher les ventes d'une ancienne affectation dans le dashboard actuel
        if (user.boutique) {
            query.boutique = user.boutique;
        }
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

exports.annulerVente = async (venteId, user, req) => {
    // NOTE: Cette opération n'est pas atomique sans Replica Set.
    // Un crash serveur entre les différentes opérations peut laisser la base de données
    // dans un état incohérent.
    try {
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

        // Log audit (effet de bord, non transactionnel)
        await logAction({
            req,
            user,
            action: 'CANCEL_SALE',
            entity: 'Vente',
            entityId: vente._id,
            details: {
                article: article.nom,
                quantite: vente.quantite,
                prixTotal: vente.prixTotal,
                motif: "Annulation manuelle",
                boutique: vente.boutique
            },
            status: 'SUCCESS'
        });
        // Enregistrer un mouvement d'annulation pour la traçabilité
        await Mouvement.create([{
            type: 'Annulation Vente',
            details: `🔄 Annulation Vente #${vente._id.toString().slice(-6).toUpperCase()} | Article: ${article.nom} | Qté restaurée: ${vente.quantite} | Montant annulé: ${vente.prixTotal.toLocaleString('fr-FR')} GNF`,
            boutiqueSource: vente.boutique, // Le stock revient ici
            articles: [{ articleId: article._id, nomArticle: article.nom, quantite: vente.quantite, prixAchatUnitaire: article.prixAchat }],
            operateur: user.id,
            isCancelled: true
        }]);

        return { message: "Vente annulée avec succès. Le stock a été restauré." };
    } catch (error) {
        throw error;
    }
};