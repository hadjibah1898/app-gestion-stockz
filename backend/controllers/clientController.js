/**
 * @file clientController.js
 * @description Contrôleur clients : CRUD, dettes, commissions, historique.
 */

const Client = require('../models/Client');
const DebtMovement = require('../models/DebtMovement');
const DebtPayment = require('../models/DebtPayment');
const OuvertureCaisse = require('../models/OuvertureCaisse');
const Boutique = require('../models/Boutique');
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
            boutique: req.user.boutique || client.boutique
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

// @desc    Historique global des paiements
exports.getDebtHistory = asyncHandler(async (req, res) => {
        let query = {};
        // SÉCURITÉ MULTI-TENANT
        if (req.user.role === 'Admin') {
            const myBoutiques = await Boutique.find({ createur: req.user.id }).select('_id');
            query.boutique = { $in: myBoutiques.map(b => b._id) };
        } else if (req.user.role !== 'SuperAdmin' && req.user.boutique) {
            query.boutique = req.user.boutique;
        }
        
        const history = await DebtPayment.find(query)
            .populate('client', 'nom email')
            .populate('gerant', 'nom')
            .populate('boutique', 'nom')
            .sort({ createdAt: -1 });
        res.status(200).json(history);
});

// @desc    Envoyer le reçu de paiement par email
exports.sendReceiptEmail = asyncHandler(async (req, res) => {
        const payment = await DebtPayment.findById(req.params.paymentId).populate('client boutique');
        
        if (!payment) return res.status(404).json({ message: "Paiement introuvable" });
        
        if (!payment.client) return res.status(404).json({ message: "Données client introuvables pour ce paiement." });

        if (!payment.client.email) {
            return res.status(400).json({ message: "Le client n'a pas d'adresse email configurée." });
        }

        await notificationService.sendDebtPaymentReceiptEmail(payment, payment.client);
        res.status(200).json({ message: "Reçu envoyé avec succès par email." });
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
            query.createur = req.user.id;
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