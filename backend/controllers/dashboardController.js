const Vente = require('../models/Vente');
const User = require('../models/User');
const Article = require('../models/Article');
const Boutique = require('../models/Boutique');
const Client = require('../models/Client');
const DebtPayment = require('../models/DebtPayment');
const OuvertureCaisse = require('../models/OuvertureCaisse');
const Depense = require('../models/Depense');
const mongoose = require('mongoose');
const asyncHandler = require('../middleware/asyncHandler');

exports.getDashboardStats = asyncHandler(async (req, res) => {
        const { range } = req.query; // 'monthly' ou 'yearly' reçu du frontend
        const now = new Date();
        const adminId = req.user.id;
        const userRole = req.user.role;

        // Isolation Multi-tenant : Filtre par créateur pour l'Admin, par boutique assignée pour le Gérant
        let myBoutiqueFilter = {};
        if (userRole === 'Admin') {
            myBoutiqueFilter = { createur: adminId };
        } else if (userRole === 'Gérant') {
            myBoutiqueFilter = { _id: req.user.boutique };
        } else if (userRole === 'Serveur') {
            myBoutiqueFilter = { _id: req.user.boutique };
        } else {
            myBoutiqueFilter = { _id: null };
        }

        const myBoutiques = await Boutique.find(myBoutiqueFilter).select('_id');
        const myBoutiqueIds = myBoutiques.map(b => b._id);

        // SÉCURITÉ & PERFORMANCE : Si aucune boutique n'est rattachée (Nouvel Admin)
        // On retourne un objet vide structuré pour éviter les erreurs de calcul plus bas
        if (myBoutiqueIds.length === 0) {
            return res.status(200).json({
                totalCA: 0, totalBenefice: 0, totalArticles: 0, articlesPeuStock: 0,
                dailyOrdersPending: 0, totalVentes: 0,
                performanceEquipe: [],
                performanceGerants: [],
                performanceBoutiques: [],
                stockBoutiques: [],
                boutiquesActives: 0,
                boutiquesInactives: 0,
                dailySales: 0,
                dailyOrders: 0,
                dailyRecoveries: 0,
                salesProfit: { categories: [], series: [] },
                productSales: { labels: [], series: [] },
                detailedSales: []
            });
        }

        // HIÉRARCHIE : L'Admin voit tout, le Gérant voit toute l'activité de sa boutique
        let userRestriction = {};
        if (userRole === 'Gérant') {
            // Le gérant voit tout ce qui appartient à sa boutique (déjà filtré par myBoutiqueIds)
            userRestriction = {}; 
        }

        // 1. Stats du jour (Pour la bannière)
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        
        const dailyStats = await Vente.aggregate([
            { $match: { ...userRestriction, boutique: { $in: myBoutiqueIds }, createdAt: { $gte: todayStart, $lte: todayEnd } } },
            {
                $group: {
                    _id: null,
                    dailySales: { $sum: '$prixTotal' },
                    dailyOrders: { $sum: 1 }
                }
            }
        ]);

        // NOUVEAU: Calcul des recouvrements de dettes validés aujourd'hui
        const dailyRecoveriesStats = await DebtPayment.aggregate([
            {
                $match: {
                    boutique: { $in: myBoutiqueIds },
                    ...userRestriction,
                    statut: 'VALIDEE',
                    datePaiement: { $gte: todayStart, $lte: todayEnd }
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$montant' }
                }
            }
        ]);

        // 2. Agrégation pour calculer CA et Coût d'achat total (Global)
        // Calcul du CA total (plus robuste, n'exclut pas les ventes d'articles supprimés)
        const totalCAData = await Vente.aggregate([
            { $match: { boutique: { $in: myBoutiqueIds }, isCancelled: false } },
            {
                $group: {
                    _id: null,
                    totalCA: { $sum: '$prixTotal' }
                }
            }
        ]);

        // Calcul du coût d'achat total (nécessite la jointure avec les articles)
        const totalCoutAchatData = await Vente.aggregate([
            { $match: { ...userRestriction, boutique: { $in: myBoutiqueIds }, isCancelled: false } },
            {
                $lookup: {
                    from: Article.collection.name,
                    localField: 'article',
                    foreignField: '_id',
                    as: 'articleDetails'
                }
            },
            { $unwind: { path: '$articleDetails', preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: null,
                    totalCoutAchat: { $sum: { $multiply: ['$quantite', '$articleDetails.prixAchat'] } },
                }
            }
        ]);

        // Calcul des dépenses totales (Global)
        const totalDepensesData = await Depense.aggregate([
            { $match: { ...userRestriction, boutique: { $in: myBoutiqueIds } } },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$montant' }
                }
            }
        ]);

        // Initialisation des variables
        let performanceGerants = [];
        let performanceBoutiques = [];
        let stockBoutiques = [];
        const isAdmin = userRole === 'Admin';

        // 3. Graphique Analyse des Ventes (Sales Analysis) - DISPONIBLE POUR TOUS
        let matchStage = { 
            boutique: { $in: myBoutiqueIds },
            isCancelled: false,
            ...userRestriction
        };
        let groupStage = {};
        
        if (range === 'yearly') {
            matchStage.createdAt = { $gte: new Date(now.getFullYear(), 0, 1), $lte: new Date(now.getFullYear(), 11, 31, 23, 59, 59) };
            groupStage = { _id: { $month: "$createdAt" }, total: { $sum: "$prixTotal" } };
        } else {
            matchStage.createdAt = { $gte: new Date(now.getFullYear(), now.getMonth(), 1), $lte: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59) };
            groupStage = { _id: { $dayOfMonth: "$createdAt" }, total: { $sum: "$prixTotal" } };
        }

        const unitExpression = groupStage._id;
        const detailedSalesRaw = await Vente.aggregate([
            { $match: matchStage },
            {
                $lookup: {
                    from: Article.collection.name,
                    localField: 'article',
                    foreignField: '_id',
                    as: 'art'
                }
            },
            { $unwind: { path: '$art', preserveNullAndEmptyArrays: true } },
            { 
                $project: { 
                    unit: unitExpression, 
                    boutique: 1, 
                    ca: '$prixTotal', 
                    cost: { $multiply: ['$quantite', { $ifNull: ['$art.prixAchat', 0] }] } 
                } 
            },
            {
                $unionWith: {
                    coll: Depense.collection.name,
                    pipeline: [
                        { 
                            $match: { 
                                boutique: { $in: myBoutiqueIds },
                                createdAt: matchStage.createdAt 
                            } 
                        },
                        { $project: { unit: unitExpression, boutique: 1, depense: '$montant' } }
                    ]
                }
            },
            {
                $lookup: {
                    from: Boutique.collection.name,
                    localField: 'boutique',
                    foreignField: '_id',
                    as: 'btq'
                }
            },
            { $unwind: { path: '$btq', preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: { unit: '$unit', boutique: { $ifNull: ['$btq.nom', 'Boutique Inconnue'] } },
                    ca: { $sum: { $ifNull: ['$ca', 0] } },
                    cost: { $sum: { $ifNull: ['$cost', 0] } },
                    depense: { $sum: { $ifNull: ['$depense', 0] } }
                }
            },
            { 
                $project: { 
                    _id: 0, 
                    unit: '$_id.unit', 
                    boutique: '$_id.boutique', 
                    ca: 1, 
                    profit: { $subtract: ['$ca', { $add: [{ $ifNull: ['$cost', 0] }, { $ifNull: ['$depense', 0] }] }] } 
                } 
            },
            { $sort: { unit: 1 } }
        ]);

        let salesChartData = range === 'yearly' ? {
            categories: ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"],
            series: [{ name: "Chiffre d'affaires", data: Array.from({length: 12}, (_, i) => detailedSalesRaw.find(d => d.unit === i + 1)?.ca || 0) }]
        } : {
            categories: Array.from({length: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()}, (_, i) => (i + 1).toString()),
            series: [{ name: "Chiffre d'affaires", data: Array.from({length: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()}, (_, i) => detailedSalesRaw.find(d => d.unit === i + 1)?.ca || 0) }]
        };

        // 4. Graphique Articles les plus vendus (Top 5) - DISPONIBLE POUR TOUS
        const topProducts = await Vente.aggregate([
            { $match: { ...matchStage, isCancelled: false } },
            { $group: { _id: "$article", totalVendu: { $sum: "$quantite" } } },
            { $sort: { totalVendu: -1 } },
            { $limit: 5 },
            {
                $lookup: {
                    from: Article.collection.name,
                    localField: "_id",
                    foreignField: "_id",
                    as: "articleInfo"
                }
            },
            { $unwind: "$articleInfo" },
            { $project: { nom: "$articleInfo.nom", totalVendu: 1 } }
        ]);

        const productChartData = { labels: topProducts.map(p => p.nom), series: topProducts.map(p => p.totalVendu) };

        // Calculs RESTREINTS à l'ADMIN (Performance globale)
        // --- NOUVEAU : Calcul des recouvrements par gérant pour le classement ---
        const recoveriesByGerant = await DebtPayment.aggregate([
            { $match: { boutique: { $in: myBoutiqueIds }, statut: 'VALIDEE' } },
            {
                $group: {
                    _id: '$gerant',
                    total: { $sum: '$montant' }
                }
            }
        ]);

        const recoveryMap = {};
        recoveriesByGerant.forEach(r => {
            if (r._id) {
                recoveryMap[r._id.toString()] = r.total;
            }
        });

        // 5. Performance par Gérant
        if (isAdmin) {
        const performanceGerantsRaw = await Vente.aggregate([
            { $match: { boutique: { $in: myBoutiqueIds }, isCancelled: false } },
            {
                $group: {
                    _id: '$gerant',
                    totalVendu: { $sum: '$prixTotal' },
                    totalPourboires: { $sum: '$pourboire' }
                }
            },
            {
                $lookup: {
                    from: User.collection.name,
                    localField: '_id',
                    foreignField: '_id',
                    as: 'gerantDetails'
                }
            },
            { $unwind: '$gerantDetails' },
            // Ajouter un lookup pour obtenir les détails de la boutique du gérant
            {
                $lookup: {
                    from: 'boutiques', // Nom de la collection des boutiques
                    localField: 'gerantDetails.boutique',
                    foreignField: '_id',
                    as: 'boutiqueDetails'
                }
            },
            { $unwind: { path: '$boutiqueDetails', preserveNullAndEmptyArrays: true } }, // Utiliser preserveNullAndEmptyArrays au cas où un gérant n'aurait pas de boutique
            { $sort: { totalVendu: -1 } },
            {
                $project: {
                    id: '$_id',
                    nom: '$gerantDetails.nom',
                    boutiqueNom: '$boutiqueDetails.nom', // Inclure le nom de la boutique
                    chiffreAffaires: '$totalVendu',
                    pourboires: '$totalPourboires'
                }
            }
        ]);

        performanceGerants = performanceGerantsRaw.map(g => ({
            ...g,
            totalRecouvrements: recoveryMap[g.id?.toString()] || 0,
            totalPourboires: g.pourboires || 0
        }));
        }

        // 6. Performance par Boutique
        if (isAdmin) {
        performanceBoutiques = await Vente.aggregate([
            { $match: { boutique: { $in: myBoutiqueIds }, isCancelled: false } },
            {
                $group: {
                    _id: '$boutique',
                    totalVendu: { $sum: '$prixTotal' },
                    totalPourboires: { $sum: '$pourboire' }
                }
            },
            {
                $lookup: {
                    from: Boutique.collection.name,
                    localField: '_id',
                    foreignField: '_id',
                    as: 'boutiqueDetails'
                }
            },
            { $unwind: '$boutiqueDetails' },
            { $sort: { totalVendu: -1 } },
            {
                $project: {
                    _id: 0,
                    nom: '$boutiqueDetails.nom',
                    chiffreAffaires: '$totalVendu',
                    pourboires: '$totalPourboires'
                }
            }
        ]);
        }

        // 8. État du Stock par Boutique (Nouveau)
        if (isAdmin) {
        stockBoutiques = await Article.aggregate([
            { $match: { boutique: { $in: myBoutiqueIds } } },
            {
                $group: {
                    _id: '$boutique',
                    totalStock: { $sum: '$quantite' },
                    valeurStock: { $sum: { $multiply: ['$quantite', '$prixAchat'] } }
                }
            },
            {
                $lookup: {
                    from: Boutique.collection.name,
                    localField: '_id',
                    foreignField: '_id',
                    as: 'boutiqueDetails'
                }
            },
            { $unwind: { path: '$boutiqueDetails', preserveNullAndEmptyArrays: true } },
            { $sort: { totalStock: -1 } },
            {
                $project: {
                    _id: 0,
                    nom: '$boutiqueDetails.nom',
                    totalStock: 1,
                    valeurStock: 1
                }
            }
        ]);
        }

        // 7. Total des articles en stock
        const totalArticlesInStock = await Article.aggregate([
            { $match: { boutique: { $in: myBoutiqueIds } } },
            { $group: { _id: null, total: { $sum: '$quantite' } } }
        ]);

        // Compte des articles en stock faible (pré-calculé pour le dashboard)
        const articlesPeuStock = await Article.countDocuments({
            boutique: { $in: myBoutiqueIds },
            $expr: { $lte: ["$quantite", { $ifNull: ["$seuilAlerte", 10] }] }
        });

        // Compte des commandes en attente aujourd'hui pour la boutique (Vue Gérant)
        const dailyOrdersPending = await Vente.countDocuments({
            ...userRestriction, boutique: { $in: myBoutiqueIds }, createdAt: { $gte: todayStart, $lte: todayEnd }, statut: 'commande'
        });

        // 9. Performance de l'Équipe (Serveurs) pour la session en cours
        let performanceEquipe = [];
        if (userRole === 'Gérant') {
            const sessionActive = await OuvertureCaisse.findOne({ 
                boutique: req.user.boutique, statut: 'OUVERTE' 
            });

            if (sessionActive) {
                performanceEquipe = await Vente.aggregate([
                    { $match: { ouvertureCaisse: sessionActive._id, isCancelled: false } },
                    {
                        $group: {
                            _id: '$gerant',
                            ca: { $sum: '$prixTotal' },
                            pourboires: { $sum: '$pourboire' },
                            nbVentes: { $sum: 1 }
                        }
                    },
                    {
                        $lookup: {
                            from: 'users',
                            localField: '_id',
                            foreignField: '_id',
                            as: 'user'
                        }
                    },
                    { $unwind: '$user' },
                    { $project: { nom: '$user.nom', ca: 1, pourboires: 1, nbVentes: 1 } },
                    { $sort: { ca: -1 } }
                ]);
            }
        }

        // Construction de l'objet de statistiques pour le frontend
        const stats = {
            totalCA: totalCAData[0]?.totalCA || 0,
            totalBenefice: 
                (totalCAData[0]?.totalCA || 0) - 
                (totalCoutAchatData[0]?.totalCoutAchat || 0) - 
                (totalDepensesData[0]?.total || 0),
            totalArticles: totalArticlesInStock[0]?.total || 0,
            articlesPeuStock,
            dailyOrdersPending,
            totalVentes: await Vente.countDocuments({ boutique: { $in: myBoutiqueIds } }),
            performanceEquipe, // Ajouté pour le Gérant
            performanceGerants: performanceGerants,
            performanceBoutiques: performanceBoutiques, // Ajouté à la réponse
            stockBoutiques: stockBoutiques, // Ajouté à la réponse
            boutiquesActives: await Boutique.countDocuments({ ...myBoutiqueFilter, active: true }),
            boutiquesInactives: await Boutique.countDocuments({ ...myBoutiqueFilter, active: false }),
            // Nouveaux champs pour les graphiques et la bannière
            dailySales: dailyStats[0]?.dailySales || 0,
            dailyOrders: dailyStats[0]?.dailyOrders || 0,
            dailyRecoveries: dailyRecoveriesStats[0]?.total || 0, // Ajout du recouvrement du jour
            salesProfit: salesChartData,
            productSales: productChartData,
            detailedSales: detailedSalesRaw // On envoie les données brutes pour le traitement frontend
        };

        res.status(200).json(stats);
});