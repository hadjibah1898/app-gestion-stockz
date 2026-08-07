/**
 * @file clientController.js
 * @description Contrôleur clients : CRUD, dettes, commissions, historique.
 */

const Client = require('../models/Client');
const DebtMovement = require('../models/DebtMovement');
const DebtPayment = require('../models/DebtPayment');
const OuvertureCaisse = require('../models/OuvertureCaisse');
const Boutique = require('../models/Boutique');
const Vente = require('../models/Vente');
const Setting = require('../models/Setting');
const notificationService = require('../services/notificationService');
const commissionService = require('../services/commissionService');
const asyncHandler = require('../middleware/asyncHandler');

// @desc    Enregistrer un remboursement de dette
exports.payDette = asyncHandler(async (req, res) => {
        const { montant, modePaiement, transactionRef, commentaire } = req.body;
        const client = await Client.findById(req.params.id);

        if (!client) return res.status(404).json({ message: "Client introuvable" });
        
        const montantRembourse = parseFloat(montant);
        const soldeAnterieur = client.dette;

        // Mise à jour de la dette du client
        client.dette -= montantRembourse;
        await client.save();

        // Préparation des données de paiement
        const paymentData = {
            client: client._id,
            montant: montantRembourse,
            gerant: req.user.id,
            // S'assurer que la boutique est un ID propre
            boutique: req.user.boutique?._id || req.user.boutique || client.boutique,
            statut: 'VALIDEE',
            modePaiement: modePaiement || 'Cash',
            transactionRef: transactionRef,
            datePaiement: new Date(),
            commentaire: commentaire || "Remboursement client"
        };

        // Lien avec la session de caisse (Obligatoire pour ton modèle)
        if (req.ouvertureCaisse && req.ouvertureCaisse._id) {
            paymentData.ouvertureCaisse = req.ouvertureCaisse._id;
            await OuvertureCaisse.findByIdAndUpdate(req.ouvertureCaisse._id, {
                $inc: { totalRecouvrements: montantRembourse }
            });
        }

        const newPayment = await DebtPayment.create(paymentData);

// Enregistrement dans l'historique des mouvements
        await DebtMovement.create({
            client: client._id,
            type: 'REMBOURSEMENT',
            montant: montantRembourse,
            soldeAnterieur,
            nouveauSolde: client.dette,
            operateur: req.user.id,
            boutique: req.user.boutique || client.boutique,
            modePaiement: paymentData.modePaiement,
            transactionRef: paymentData.transactionRef
        });

        res.status(200).json({ 
            success: true, 
            data: { 
                nouveauSolde: client.dette, 
                paiement: newPayment, 
                soldeAnterieur 
            } 
        });
});

// @desc    Historique global des mouvements de dettes (créations + remboursements)
exports.getDebtHistory = asyncHandler(async (req, res) => {
        let query = {};
        // SÉCURITÉ MULTI-TENANT
        if (req.user.role === 'Admin') {
            const myBoutiques = await Boutique.find({ createur: req.user.id }).select('_id');
            query.boutique = { $in: myBoutiques.map(b => b._id) };
        } else if (req.user.role !== 'SuperAdmin' && req.user.boutique) {
            query.boutique = req.user.boutique;
        }
        
        // Retourner les DebtMovement qui contiennent soldeAnterieur et nouveauSolde
        const history = await DebtMovement.find(query)
            .populate('client', 'nom email')
            .populate('operateur', 'nom')
            .populate('boutique', 'nom')
            .sort({ createdAt: -1 });
        res.status(200).json(history);
});

// @desc    Envoyer le reçu de paiement par email
exports.sendReceiptEmail = asyncHandler(async (req, res) => {
        console.log("[DEBUG] 📧 Tentative d'envoi d'email pour paiement ID:", req.params.paymentId);
        
        const payment = await DebtPayment.findById(req.params.paymentId)
            .populate('client', 'nom email')
            .populate('boutique', 'nom');
        
        console.log("[DEBUG] Paiement trouvé:", payment ? "OUI" : "NON", payment);
        
        if (!payment) {
            console.error("❌ Paiement introuvable");
            return res.status(404).json({ message: "Paiement introuvable" });
        }
        
        if (!payment.client) {
            console.error("❌ Données client introuvables");
            return res.status(404).json({ message: "Données client introuvables pour ce paiement." });
        }

        if (!payment.client.email) {
            console.error("❌ Email client manquant:", payment.client);
            return res.status(400).json({ message: "Le client n'a pas d'adresse email configurée." });
        }

        console.log("[DEBUG] Envoi du reçu à:", payment.client.email);

        try {
            await notificationService.sendDebtPaymentReceiptEmail(payment, payment.client);
            console.log("✅ Email envoyé avec succès");
            res.status(200).json({ message: "Reçu envoyé avec succès par email." });
        } catch (error) {
            // Retourner un message d'erreur spécifique
            console.error("❌ Erreur lors de l'envoi du reçu:", error.message);
            res.status(500).json({ message: error.message || "Erreur lors de l'envoi de l'email." });
        }
});

// @desc    Lister les clients ayant des dettes
exports.getDebts = asyncHandler(async (req, res) => {
        let query = { dette: { $gt: 0 } };
        // SÉCURITÉ MULTI-TENANT
        if (req.user.role === 'Admin') {
            // L'Admin voit les dettes des clients de toutes ses boutiques
            const myBoutiques = await Boutique.find({ createur: req.user.id }).select('_id');
            query.boutique = { $in: myBoutiques.map(b => b._id) };
        } else if (req.user.role !== 'SuperAdmin' && req.user.boutique) {
            query.boutique = req.user.boutique;
        }

        const debts = await Client.find(query);
        res.status(200).json(debts);
});

// --- NOUVELLES FONCTIONS (Pour éviter le TypeError dans les routes) ---

// @desc    Évolution des dettes (Graphiques)
exports.getDebtEvolution = asyncHandler(async (req, res) => {
        const filter = {};
        if (req.user.role === 'Admin') {
            const myBoutiques = await Boutique.find({ createur: req.user.id }).select('_id');
            filter.boutique = { $in: myBoutiques.map(b => b._id) };
        } else if (req.user.role !== 'SuperAdmin' && req.user.boutique) {
            // CRITIQUE : Dans une agrégation, il faut convertir le string en ObjectId
            const boutiqueId = req.user.boutique?._id || req.user.boutique;
            filter.boutique = new mongoose.Types.ObjectId(boutiqueId);
        }

        const stats = await DebtMovement.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: { 
                        date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                        boutique: "$boutique"
                    },
                    netChange: {
                        $sum: {
                            $cond: [{ $eq: ["$type", "CREATION"] }, "$montant", { $multiply: ["$montant", -1] }]
                        }
                    }
                }
            },
            { 
                $lookup: { 
                    from: Boutique.collection.name, // Plus robuste que 'boutiques'
                    localField: '_id.boutique', 
                    foreignField: '_id', 
                    as: 'boutiqueInfo' 
                } 
            },
            { $unwind: { path: '$boutiqueInfo', preserveNullAndEmptyArrays: true } },
            { $sort: { "_id.date": 1 } }
        ]);

        const result = stats.map(s => ({
            date: s._id.date,
            boutiqueName: s.boutiqueInfo?.nom || 'Boutique Inconnue',
            netChange: s.netChange
        }));

        res.status(200).json(result);
});

// @desc    Paiement de commission (Gérant)
exports.payCommission = asyncHandler(async (req, res) => {
    const { workerId, montant } = req.body;
    const result = await commissionService.payManualCommission({
        workerId,
        montant,
        gerantId: req.user.id,
        boutiqueId: req.user.boutique
    });
    res.status(200).json(result);
});

// --- CRUD STANDARD ---

exports.getAllClients = asyncHandler(async (req, res) => {
        let query = {};
        // SÉCURITÉ MULTI-TENANT
        if (req.user.role === 'Admin') {
            // L'Admin voit les clients de TOUTES ses boutiques (y compris ceux créés par ses gérants)
            const myBoutiques = await Boutique.find({ createur: req.user.id }).select('_id');
            const myBoutiqueIds = myBoutiques.map(b => b._id);
            if (myBoutiqueIds.length > 0) {
                query.$or = [
                    { boutique: { $in: myBoutiqueIds } },
                    { createur: req.user.id }
                ];
            } else {
                query.createur = req.user.id;
            }
        } else if (req.user.role !== 'SuperAdmin' && req.user.boutique) {
            query.boutique = req.user.boutique;
        }

        const clients = await Client.find(query).sort({ nom: 1 });
        res.status(200).json(clients);
});

exports.createClient = asyncHandler(async (req, res) => {
        const client = await Client.create({ 
            ...req.body, 
            createur: req.user.id, // Important pour l'isolation
            boutique: req.user.boutique || req.body.boutique
        });
        res.status(201).json(client);
});

exports.getClient = asyncHandler(async (req, res) => {
        const client = await Client.findById(req.params.id);
        if (!client) return res.status(404).json({ message: "Client non trouvé" });
        res.status(200).json(client);
});

exports.updateClient = asyncHandler(async (req, res) => {
        const client = await Client.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(client);
});

exports.deleteClient = asyncHandler(async (req, res) => {
        const client = await Client.findById(req.params.id);
        if (!client) return res.status(404).json({ message: "Client introuvable" });
        if (client.dette > 0) return res.status(400).json({ message: "Suppression impossible : dette en cours" });
        
        await Client.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Client supprimé" });
});

// @desc    Récupérer les paramètres CRM (seuils de niveau)
exports.getCrmSettings = asyncHandler(async (req, res) => {
        const settings = await getCrmSettings();
        res.status(200).json(settings);
});

// @desc    Récupérer les paramètres de segmentation CRM
exports.getSegmentationSettings = asyncHandler(async (req, res) => {
        const settings = await getSegmentationSettings();
        res.status(200).json(settings);
});

// @desc    Mettre à jour les paramètres de segmentation CRM
exports.updateSegmentationSettings = asyncHandler(async (req, res) => {
        const { joursActif, joursRisque, minAchatsFidele } = req.body;

        const actif = Number(joursActif);
        const risque = Number(joursRisque);
        const minAchats = Number(minAchatsFidele);

        if (isNaN(actif) || isNaN(risque) || isNaN(minAchats) || actif < 1 || risque < 1 || minAchats < 1) {
            return res.status(400).json({ message: "Les valeurs doivent être des nombres positifs." });
        }
        if (risque <= actif) {
            return res.status(400).json({ message: "Le seuil « À risque » doit être supérieur au seuil des clients actifs." });
        }

        const value = { joursActif: actif, joursRisque: risque, minAchatsFidele: minAchats };

        await Setting.findOneAndUpdate(
            { key: 'crm_segmentation_params' },
            { key: 'crm_segmentation_params', value, description: 'Paramètres de segmentation CRM (jours actif, jours risque, min achats fidèle)' },
            { upsert: true, new: true }
        );

        res.status(200).json({ success: true, message: "Paramètres de segmentation mis à jour.", data: value });
});

// Helper : lire les paramètres de segmentation CRM depuis la collection Setting (avec valeurs par défaut)
async function getSegmentationSettings() {
        const DEFAULT = { joursActif: 30, joursRisque: 60, minAchatsFidele: 4 };
        try {
            const setting = await Setting.findOne({ key: 'crm_segmentation_params' });
            if (setting && setting.value) {
                return {
                    joursActif: Number(setting.value.joursActif) || DEFAULT.joursActif,
                    joursRisque: Number(setting.value.joursRisque) || DEFAULT.joursRisque,
                    minAchatsFidele: Number(setting.value.minAchatsFidele) || DEFAULT.minAchatsFidele,
                };
            }
        } catch (e) {
            console.error("Erreur lecture paramètres segmentation CRM:", e.message);
        }
        return DEFAULT;
}

// @desc    Mettre à jour les paramètres CRM (seuils de niveau)
exports.updateCrmSettings = asyncHandler(async (req, res) => {
        const { seuilArgent, seuilOr, seuilPlatine } = req.body;

        // Validation simple : les seuils doivent être des nombres positifs et croissants
        const argent = Number(seuilArgent);
        const or = Number(seuilOr);
        const platine = Number(seuilPlatine);

        if (isNaN(argent) || isNaN(or) || isNaN(platine) || argent < 0 || or < 0 || platine < 0) {
            return res.status(400).json({ message: "Les seuils doivent être des nombres positifs." });
        }
        if (!(argent <= or && or <= platine)) {
            return res.status(400).json({ message: "Les seuils doivent être croissants : Argent ≤ Or ≤ Platine." });
        }

        const value = { seuilArgent: argent, seuilOr: or, seuilPlatine: platine };

        await Setting.findOneAndUpdate(
            { key: 'crm_niveau_seuils' },
            { key: 'crm_niveau_seuils', value, description: 'Seuils de dépense pour les niveaux CRM (Argent/Or/Platine) en GNF' },
            { upsert: true, new: true }
        );

        res.status(200).json({ success: true, message: "Paramètres CRM mis à jour.", data: value });
});

// Helper : lire les seuils CRM depuis la collection Setting (avec valeurs par défaut)
async function getCrmSettings() {
        const DEFAULT = { seuilArgent: 250000, seuilOr: 1000000, seuilPlatine: 5000000 };
        try {
            const setting = await Setting.findOne({ key: 'crm_niveau_seuils' });
            if (setting && setting.value) {
                return {
                    seuilArgent: Number(setting.value.seuilArgent) || DEFAULT.seuilArgent,
                    seuilOr: Number(setting.value.seuilOr) || DEFAULT.seuilOr,
                    seuilPlatine: Number(setting.value.seuilPlatine) || DEFAULT.seuilPlatine,
                };
            }
        } catch (e) {
            console.error("Erreur lecture paramètres CRM:", e.message);
        }
        return DEFAULT;
}

// @desc    Analyse CRM : comportement d'achat de chaque client
exports.getCrmAnalytics = asyncHandler(async (req, res) => {
        // SÉCURITÉ MULTI-TENANT
        let boutiqueFilter = {};
        if (req.user.role === 'Admin') {
            const myBoutiques = await Boutique.find({ createur: req.user.id }).select('_id');
            boutiqueFilter = { $in: myBoutiques.map(b => b._id) };
        } else if (req.user.role !== 'SuperAdmin' && req.user.boutique) {
            boutiqueFilter = req.user.boutique;
        }

// Charger les seuils configurables (défaut si non définis)
        const seuils = await getCrmSettings();
        // Charger les paramètres de segmentation configurables
        const seg = await getSegmentationSettings();
        const msActif = seg.joursActif * 24 * 60 * 60 * 1000;
        const msRisque = seg.joursRisque * 24 * 60 * 60 * 1000;

        // Agrégation des ventes par client
        const analytics = await Vente.aggregate([
            { $match: { isCancelled: { $ne: true }, boutique: boutiqueFilter, client: { $ne: null } } },
            {
                $lookup: {
                    from: 'articles',
                    localField: 'article',
                    foreignField: '_id',
                    as: 'articleInfo'
                }
            },
            { $unwind: { path: '$articleInfo', preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: '$client',
                    depenseTotale: { $sum: '$prixTotal' },
                    nbAchats: { $sum: 1 },
                    dernierAchat: { $max: '$createdAt' },
                    premierAchat: { $min: '$createdAt' },
                    categories: { $push: '$articleInfo.categorie' },
                    modesPaiement: { $push: '$modePaiement' }
                }
            },
            {
                $lookup: {
                    from: 'clients',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'clientInfo'
                }
            },
            { $unwind: '$clientInfo' },
            {
                $addFields: {
                    panierMoyen: { $cond: [{ $gt: ['$nbAchats', 0] }, { $divide: ['$depenseTotale', '$nbAchats'] }, 0] },
                    // Fréquence : achats par mois depuis le premier achat
                    moisActifs: {
                        $max: [1, { $ceil: { $divide: [{ $subtract: ['$dernierAchat', '$premierAchat'] }, 1000 * 60 * 60 * 24 * 30] } }]
                    }
                }
            },
{
                $addFields: {
                    frequenceMensuelle: { $divide: ['$nbAchats', '$moisActifs'] },
                    // Segmentation (paramètres configurables)
                    segmentation: {
                        $cond: [
                            { $lt: [{ $subtract: [new Date(), '$dernierAchat'] }, msActif] },
                            { $cond: [{ $gte: ['$nbAchats', seg.minAchatsFidele] }, 'Fidèle', 'Actif'] },
                            { $cond: [{ $lt: [{ $subtract: [new Date(), '$dernierAchat'] }, msRisque] }, 'À risque', 'Perdu'] }
                        ]
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    clientId: '$_id',
                    nom: '$clientInfo.nom',
                    telephone: '$clientInfo.telephone',
                    email: '$clientInfo.email',
                    quartier: '$clientInfo.quartier',
                    ville: '$clientInfo.ville',
                    depenseTotale: 1,
                    nbAchats: 1,
                    panierMoyen: 1,
                    dernierAchat: 1,
                    frequenceMensuelle: 1,
                    segmentation: 1,
                    categories: 1,
                    modesPaiement: 1
                }
            },
            { $sort: { depenseTotale: -1 } }
        ]);

// Calculer le niveau (Bronze/Argent/Or/Platine) et les top catégories
        const result = analytics.map(c => {
            // Niveau selon dépense totale (seuils configurables)
            let niveau = 'Bronze';
            if (c.depenseTotale > seuils.seuilPlatine) niveau = 'Platine';
            else if (c.depenseTotale > seuils.seuilOr) niveau = 'Or';
            else if (c.depenseTotale > seuils.seuilArgent) niveau = 'Argent';

            // Top catégories
            const catCount = {};
            (c.categories || []).filter(Boolean).forEach(cat => { catCount[cat] = (catCount[cat] || 0) + 1; });
            const topCategories = Object.entries(catCount)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([categorie, count]) => ({ categorie, count }));

            // Mode de paiement préféré
            const modeCount = {};
            (c.modesPaiement || []).forEach(m => { modeCount[m] = (modeCount[m] || 0) + 1; });
            const modePrefere = Object.entries(modeCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Cash';

            return {
                ...c,
                niveau,
                topCategories,
                modePrefere
            };
        });

        res.status(200).json(result);
});

// @desc    Analyse par quartier/zone
exports.getCrmQuartiers = asyncHandler(async (req, res) => {
        let boutiqueFilter = {};
        if (req.user.role === 'Admin') {
            const myBoutiques = await Boutique.find({ createur: req.user.id }).select('_id');
            boutiqueFilter = { $in: myBoutiques.map(b => b._id) };
        } else if (req.user.role !== 'SuperAdmin' && req.user.boutique) {
            boutiqueFilter = req.user.boutique;
        }

        const quartiers = await Vente.aggregate([
            { $match: { isCancelled: { $ne: true }, boutique: boutiqueFilter, client: { $ne: null } } },
            {
                $lookup: {
                    from: 'clients',
                    localField: 'client',
                    foreignField: '_id',
                    as: 'clientInfo'
                }
            },
            { $unwind: '$clientInfo' },
            {
                $group: {
                    _id: { $ifNull: ['$clientInfo.quartier', 'Non renseigné'] },
                    nbClients: { $addToSet: '$client' },
                    depenseTotale: { $sum: '$prixTotal' },
                    nbAchats: { $sum: 1 }
                }
            },
            {
                $project: {
                    _id: 0,
                    quartier: '$_id',
                    nbClients: { $size: '$nbClients' },
                    depenseTotale: 1,
                    nbAchats: 1
                }
            },
            { $sort: { depenseTotale: -1 } }
        ]);

        res.status(200).json(quartiers);
});

// @desc    Relancer un client par email personnalisé
exports.relancerClient = asyncHandler(async (req, res) => {
        const client = await Client.findById(req.params.id);
        if (!client) return res.status(404).json({ message: "Client introuvable" });
        if (!client.email) return res.status(400).json({ message: "Ce client n'a pas d'adresse email." });

        // Récupérer les habitudes du client
        const analytics = await Vente.aggregate([
            { $match: { client: client._id, isCancelled: { $ne: true } } },
            {
                $lookup: {
                    from: 'articles',
                    localField: 'article',
                    foreignField: '_id',
                    as: 'articleInfo'
                }
            },
            { $unwind: { path: '$articleInfo', preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: null,
                    depenseTotale: { $sum: '$prixTotal' },
                    nbAchats: { $sum: 1 },
                    dernierAchat: { $max: '$createdAt' },
                    categories: { $push: '$articleInfo.categorie' }
                }
            }
        ]);

        const data = analytics[0] || {};
        const joursInactif = data.dernierAchat ? Math.floor((Date.now() - new Date(data.dernierAchat)) / (1000 * 60 * 60 * 24)) : 0;

        // Top catégorie préférée
        const catCount = {};
        (data.categories || []).filter(Boolean).forEach(cat => { catCount[cat] = (catCount[cat] || 0) + 1; });
        const topCategorie = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'vos produits';

// Message personnalisé (généré selon l'activité du client)
        const messageParDefaut = `Bonjour ${client.nom},

Nous vous avons manqué ! Cela fait ${joursInactif} jours depuis votre dernier achat.

Vous avez dépensé au total ${(data.depenseTotale || 0).toLocaleString()} GNF chez nous en ${data.nbAchats || 0} achats.

Nous avons de nouvelles offres sur ${topCategorie} qui pourraient vous intéresser. Passez nous voir !

Cordialement,
Votre équipe`;

        // Utiliser le message personnalisé envoyé par le gérant/admin si fourni, sinon le message généré par défaut
        const customMessage = (req.body && req.body.message && req.body.message.trim()) ? req.body.message.trim() : '';
        const message = customMessage || messageParDefaut;

        // Envoyer l'email
        await notificationService.sendRelanceClientEmail(client, message);

        res.status(200).json({ success: true, message: `Relance envoyée à ${client.nom} par email.` });
});
