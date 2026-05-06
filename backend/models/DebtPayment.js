const mongoose = require('mongoose');
const Client = require('../models/Client');
const DebtMovement = require('../models/DebtMovement');
const OuvertureCaisse = require('../models/OuvertureCaisse');

const debtPaymentSchema = new mongoose.Schema({
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
    montant: { type: Number, required: true },
    gerant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    boutique: { type: mongoose.Schema.Types.ObjectId, ref: 'Boutique', required: true },
    ouvertureCaisse: { type: mongoose.Schema.Types.ObjectId, ref: 'OuvertureCaisse', required: true },
    statut: { type: String, enum: ['VALIDEE', 'ANNULEE'], default: 'VALIDEE' },
    datePaiement: { type: Date, default: Date.now },
    modePaiement: { type: String, default: 'Cash' },
    transactionRef: { type: String },
    commentaire: { type: String }
}, { timestamps: true });

debtPaymentSchema.index({ statut: 1, datePaiement: 1 });

const DebtPayment = mongoose.model('DebtPayment', debtPaymentSchema);

/**
 * @desc    Rembourser une dette avec sécurité transactionnelle
 * @route   POST /api/clients/:id/pay-dette
 */
DebtPayment.payDette = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        // 0. Restriction : Seul le gérant effectue les recouvrements
        if (req.user.role !== 'Gérant') {
            return res.status(403).json({ message: "Action interdite : Seul un gérant peut encaisser un remboursement." });
        }

        const { montant, modePaiement, transactionRef, commentaire } = req.body;
        const clientId = req.params.id;

        // 1. Validation de l'entrée
        const montantRembourse = parseFloat(montant);
        if (!montantRembourse || montantRembourse <= 0) {
            throw new Error("Le montant saisi est invalide.");
        }

        // 2. Vérification de la caisse (obligatoire pour la traçabilité)
        if (!req.ouvertureCaisse) {
            return res.status(403).json({ message: "Action refusée : Aucune session de caisse ouverte." });
        }

        // Récupération sécurisée de l'ID de session (supporte document Mongoose ou ID simple)
        const ouvertureCaisseId = req.ouvertureCaisse._id ? req.ouvertureCaisse._id.toString() : req.ouvertureCaisse.toString();

        if (!ouvertureCaisseId) {
            return res.status(400).json({ message: "Identifiant de session de caisse introuvable." });
        }

        // 3. Récupération et vérification du client
        const client = await Client.findById(clientId).session(session);
        if (!client) {
            return res.status(404).json({ message: "Client introuvable." });
        }

        // Utilisation d'une marge d'erreur minime pour les flottants
        if (montantRembourse > (client.dette + 0.01)) {
            return res.status(400).json({ message: `Le montant dépasse la dette actuelle (${client.dette.toFixed(2)}).` });
        }

        const soldeAnterieur = client.dette;

        // 4. Mise à jour du client
        const updatedClient = await Client.findByIdAndUpdate(
            clientId,
            { $inc: { dette: -montantRembourse } },
            { new: true, session }
        );

        // 5. Création de la pièce de paiement
        const paymentData = {
            client: clientId,
            montant: montantRembourse,
            gerant: req.user.id,
            boutique: req.user.boutique || client.boutique,
            ouvertureCaisse: ouvertureCaisseId,
            statut: 'VALIDEE',
            datePaiement: new Date(),
            modePaiement: modePaiement || 'Cash',
            transactionRef: transactionRef,
            commentaire: commentaire || "Remboursement de dette"
        };

        const [newPayment] = await DebtPayment.create([paymentData], { session });

        // 6. Mise à jour de la caisse sessionnelle
        await OuvertureCaisse.findByIdAndUpdate(
            ouvertureCaisseId,
            { $inc: { totalRecouvrements: montantRembourse } },
            { session }
        );

        // 7. Historique des mouvements (Audit)
        await DebtMovement.create([{
            client: clientId,
            boutique: req.user.boutique || client.boutique,
            type: 'REMBOURSEMENT',
            montant: montantRembourse,
            soldeAnterieur,
            nouveauSolde: updatedClient.dette,
            operateur: req.user.id
        }], { session });
        
        await session.commitTransaction();
        res.status(200).json({ 
            success: true,
            nouveauSolde: updatedClient.dette,
            paiement: newPayment
        });
    } catch (error) {
        await session.abortTransaction();
        res.status(500).json({ message: error.message });
    } finally {
        session.endSession();
    }
};

/**
 * @desc    Lister les clients (Filtré par boutique pour les gérants)
 */
DebtPayment.getAllClients = async (req, res) => {
    try {
        let query = {};
        // SÉCURITÉ MULTI-TENANT
        if (req.user.role === 'Admin') {
            query.createur = req.user.id;
        } else if (req.user.role !== 'SuperAdmin') {
            query.boutique = req.user.boutique;
        }

        const clients = await Client.find(query)
            .populate('createur', 'nom')
            .sort({ nom: 1 });
        res.status(200).json(clients);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Créer un client
 */
DebtPayment.createClient = async (req, res) => {
    try {
        const boutiqueId = req.user.role === 'Admin' ? req.body.boutique : req.user.boutique;
        const client = await Client.create({ 
            ...req.body, 
            createur: req.user.id,
            boutique: boutiqueId 
        });
        res.status(201).json(client);
    } catch (error) {
        const msg = error.code === 11000 ? "Ce client existe déjà." : error.message;
        res.status(400).json({ message: msg });
    }
};

/**
 * @desc    Lister les dettes actives
 */
DebtPayment.getDebts = async (req, res) => {
    try {
        const query = { dette: { $gt: 0 } };

        // SÉCURITÉ MULTI-TENANT
        if (req.user.role === 'Admin') {
            query.createur = req.user.id;
        } else if (req.user.role !== 'SuperAdmin') {
            query.boutique = req.user.boutique;
        }

        const debts = await Client.find(query).populate('boutique', 'nom');
        res.status(200).json(debts);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Historique des paiements
 */
DebtPayment.getDebtHistory = async (req, res) => {
    try {
        let query = {};
        if (req.user.role === 'Admin') {
            const myBoutiques = await Boutique.find({ createur: req.user.id }).select('_id');
            query.boutique = { $in: myBoutiques.map(b => b._id) };
        } else if (req.user.role !== 'SuperAdmin') {
            query.boutique = req.user.boutique;
        }

        const history = await DebtPayment.find(query)
            .populate('client', 'nom')
            .populate('gerant', 'nom')
            .sort({ createdAt: -1 });
        res.status(200).json(history);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * @desc    Supprimer un client (uniquement si solde à zéro)
 */
DebtPayment.deleteClient = async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        if (!client) return res.status(404).json({ message: "Client introuvable." });
        if (client.dette > 0) return res.status(400).json({ message: "Impossible de supprimer un client ayant une dette." });

        await Client.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Client supprimé avec succès." });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- Exports de compatibilité ---
DebtPayment.getClient = async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        res.status(200).json(client);
    } catch (e) { res.status(500).json({ message: e.message }); }
};

DebtPayment.updateClient = async (req, res) => {
    try {
        const client = await Client.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(client);
    } catch (e) { res.status(500).json({ message: e.message }); }
};

DebtPayment.getDebtEvolution = async (req, res) => {
    try {
        const movements = await DebtMovement.find().sort({ createdAt: 1 });
        res.status(200).json(movements);
    } catch (e) { res.status(500).json({ message: e.message }); }
};

module.exports = DebtPayment;