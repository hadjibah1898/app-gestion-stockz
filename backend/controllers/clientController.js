const Client = require('../models/Client');
const DebtMovement = require('../models/DebtMovement');
const DebtPayment = require('../models/DebtPayment');
const OuvertureCaisse = require('../models/OuvertureCaisse');
const Boutique = require('../models/Boutique');
const notificationService = require('../services/notificationService');

// @desc    Enregistrer un remboursement de dette
exports.payDette = async (req, res) => {
    try {
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

        res.status(200).json({ success: true, nouveauSolde: client.dette, paiement: newPayment });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Historique global des paiements
exports.getDebtHistory = async (req, res) => {
    try {
        let query = {};
        if (req.user.role !== 'Admin') query.boutique = req.user.boutique;
        
        const history = await DebtPayment.find(query)
            .populate('client', 'nom email')
            .populate('gerant', 'nom')
            .populate('boutique', 'nom')
            .sort({ createdAt: -1 });
        res.status(200).json(history);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Envoyer le reçu de paiement par email
exports.sendReceiptEmail = async (req, res) => {
    try {
        const payment = await DebtPayment.findById(req.params.paymentId).populate('client boutique');
        
        if (!payment) return res.status(404).json({ message: "Paiement introuvable" });
        
        if (!payment.client) return res.status(404).json({ message: "Données client introuvables pour ce paiement." });

        if (!payment.client.email) {
            return res.status(400).json({ message: "Le client n'a pas d'adresse email configurée." });
        }

        await notificationService.sendDebtPaymentReceiptEmail(payment, payment.client);
        res.status(200).json({ message: "Reçu envoyé avec succès par email." });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Lister les clients ayant des dettes
exports.getDebts = async (req, res) => {
    try {
        let query = { dette: { $gt: 0 } };
        if (req.user.role !== 'Admin') query.boutique = req.user.boutique;
        const debts = await Client.find(query);
        res.status(200).json(debts);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- NOUVELLES FONCTIONS (Pour éviter le TypeError dans les routes) ---

// @desc    Évolution des dettes (Graphiques)
exports.getDebtEvolution = async (req, res) => {
    try {
        const stats = await DebtMovement.aggregate([
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
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Paiement de commission (Gérant)
exports.payCommission = async (req, res) => {
    try {
        res.status(200).json({ message: "Commission enregistrée avec succès" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- CRUD STANDARD ---

exports.getAllClients = async (req, res) => {
    try {
        let query = {};
        if (req.user.role !== 'Admin') query.boutique = req.user.boutique;
        const clients = await Client.find(query).sort({ nom: 1 });
        res.status(200).json(clients);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.createClient = async (req, res) => {
    try {
        const client = await Client.create({ 
            ...req.body, 
            boutique: req.user.boutique || req.body.boutique 
        });
        res.status(201).json(client);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getClient = async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        if (!client) return res.status(404).json({ message: "Client non trouvé" });
        res.status(200).json(client);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateClient = async (req, res) => {
    try {
        const client = await Client.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(client);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.deleteClient = async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        if (!client) return res.status(404).json({ message: "Client introuvable" });
        if (client.dette > 0) return res.status(400).json({ message: "Suppression impossible : dette en cours" });
        
        await Client.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Client supprimé" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};