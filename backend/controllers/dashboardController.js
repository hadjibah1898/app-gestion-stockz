const Vente = require('../models/vente');
const User = require('../models/User');
const Article = require('../models/Article');
const Boutique = require('../models/Boutique');
const mongoose = require('mongoose');

exports.getDashboardStats = async (req, res) => {
    try {
        const { range } = req.query; // 'monthly' ou 'yearly' reçu du frontend
        const now = new Date();

        // 1. Stats du jour (Pour la bannière)
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        
        const dailyStats = await Vente.aggregate([
            { $match: { createdAt: { $gte: todayStart, $lte: todayEnd } } },
            {
                $group: {
                    _id: null,
                    dailySales: { $sum: '$prixTotal' },
                    dailyOrders: { $sum: 1 }
                }
            }
        ]);

        // 2. Agrégation pour calculer CA et Coût d'achat total (Global)
        // Calcul du CA total (plus robuste, n'exclut pas les ventes d'articles supprimés)
        const totalCAData = await Vente.aggregate([
            {
                $group: {
                    _id: null,
                    totalCA: { $sum: '$prixTotal' }
                }
            }
        ]);

        // Calcul du coût d'achat total (nécessite la jointure avec les articles)
        const totalCoutAchatData = await Vente.aggregate([
            {
                $lookup: {
                    from: Article.collection.name,
                    localField: 'article',
                    foreignField: '_id',
                    as: 'articleDetails'
                }
            },
            { $unwind: '$articleDetails' },
            {
                $group: {
                    _id: null,
                    totalCoutAchat: { $sum: { $multiply: ['$quantite', '$articleDetails.prixAchat'] } },
                }
            }
        ]);

        // 3. Graphique Analyse des Ventes (Sales Analysis)
        let salesChartData = { categories: [], series: [] };
        let matchStage = {};
        let groupStage = {};
        
        if (range === 'yearly') {
            const startOfYear = new Date(now.getFullYear(), 0, 1);
            const endOfYear = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
            matchStage = { createdAt: { $gte: startOfYear, $lte: endOfYear } };
            // Grouper par mois (1-12)
            groupStage = { _id: { $month: "$createdAt" }, total: { $sum: "$prixTotal" } };
        } else {
            // Par défaut: Mensuel
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
            matchStage = { createdAt: { $gte: startOfMonth, $lte: endOfMonth } };
            // Grouper par jour (1-31)
            groupStage = { _id: { $dayOfMonth: "$createdAt" }, total: { $sum: "$prixTotal" } };
        }

        const salesDataRaw = await Vente.aggregate([
            { $match: matchStage },
            { $group: groupStage },
            { $sort: { _id: 1 } }
        ]);

        // Formatage des données pour le graphique
        if (range === 'yearly') {
            const months = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
            const dataMap = new Array(12).fill(0);
            salesDataRaw.forEach(item => { if(item._id) dataMap[item._id - 1] = item.total; });
            salesChartData = {
                categories: months,
                series: [{ name: "Chiffre d'affaires", data: dataMap }]
            };
        } else {
            const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            const days = Array.from({length: daysInMonth}, (_, i) => (i + 1).toString());
            const dataMap = new Array(daysInMonth).fill(0);
            salesDataRaw.forEach(item => { if(item._id) dataMap[item._id - 1] = item.total; });
            salesChartData = {
                categories: days,
                series: [{ name: "Chiffre d'affaires", data: dataMap }]
            };
        }

        // 4. Graphique Articles les plus vendus (Top 5)
        const topProducts = await Vente.aggregate([
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

        const productChartData = {
            labels: topProducts.map(p => p.nom),
            series: topProducts.map(p => p.totalVendu)
        };

        // 5. Performance par Gérant
        const performanceGerants = await Vente.aggregate([
            {
                $group: {
                    _id: '$gerant',
                    totalVendu: { $sum: '$prixTotal' }
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
            { $sort: { totalVendu: -1 } },
            {
                $project: {
                    _id: 0,
                    nom: '$gerantDetails.nom',
                    chiffreAffaires: '$totalVendu'
                }
            }
        ]);

        // 6. Total des articles en stock
        // 6. Performance par Boutique (Nouveau)
        const performanceBoutiques = await Vente.aggregate([
            {
                $group: {
                    _id: '$boutique',
                    totalVendu: { $sum: '$prixTotal' }
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
                    chiffreAffaires: '$totalVendu'
                }
            }
        ]);

        // 8. État du Stock par Boutique (Nouveau)
        const stockBoutiques = await Article.aggregate([
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
            { $unwind: '$boutiqueDetails' },
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

        // 7. Total des articles en stock
        const totalArticlesInStock = await Article.aggregate([
            { $group: { _id: null, total: { $sum: '$quantite' } } }
        ]);

        // Construction de l'objet de statistiques pour le frontend
        const stats = {
            totalCA: totalCAData[0]?.totalCA || 0,
            totalBenefice: (totalCAData[0]?.totalCA || 0) - (totalCoutAchatData[0]?.totalCoutAchat || 0),
            totalArticles: totalArticlesInStock[0]?.total || 0,
            totalVentes: await Vente.countDocuments(),
            performanceGerants: performanceGerants,
            performanceBoutiques: performanceBoutiques, // Ajouté à la réponse
            stockBoutiques: stockBoutiques, // Ajouté à la réponse
            boutiquesActives: await Boutique.countDocuments({ active: true }),
            boutiquesInactives: await Boutique.countDocuments({ active: false }),
            // Nouveaux champs pour les graphiques et la bannière
            dailySales: dailyStats[0]?.dailySales || 0,
            dailyOrders: dailyStats[0]?.dailyOrders || 0,
            salesProfit: salesChartData,
            productSales: productChartData
        };

        res.status(200).json(stats);

    } catch (error) {
        console.error("Erreur Dashboard:", error);
        res.status(500).json({ message: "Erreur lors de la récupération des statistiques.", error: error.message });
    }
};