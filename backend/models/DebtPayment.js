const mongoose = require('mongoose');
const Client = require('./Client');
const OuvertureCaisse = require('./OuvertureCaisse');
const User = require('./User'); // Assuming User model is needed for gerant population
const Boutique = require('./Boutique'); // Assuming Boutique model is needed for boutique population

// Helper to safely convert Decimal128 to number
const toNum = (val) => {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') return parseFloat(val) || 0;
    // If it's a Mongoose Decimal128 object
    if (typeof val === 'object' && val.constructor.name === 'Decimal128') {
        return parseFloat(val.toString()); // Decimal128.toString() gives "123.45"
    }
    if (typeof val === 'object' && val.$numberDecimal) return parseFloat(val.$numberDecimal);
    return 0;
};

const DebtMovement = require('./DebtMovement');

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
        res.status(200).json({ success: true, data: clients });
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
        const boutique = await Boutique.findById(boutiqueId);

        const client = await Client.create({
            ...req.body,
            createur: req.user.id,
            boutique: boutiqueId,
            codeBoutique: boutique?.codeBoutique // Tag de l'organisation
        });
        res.status(201).json({ success: true, data: client });
    } catch (error) {
        const msg = error.code === 11000 ? "Ce client existe déjà." : error.message;
        res.status(400).json({ success: false, message: msg });
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
        res.status(200).json({ success: true, data: debts });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
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
        const formattedHistory = history.map(h => ({ // Ensure client.dette is also converted
            ...h.toObject(),
            montant: parseFloat(h.montant?.toString()) || 0
        }));
        res.status(200).json({ success: true, data: formattedHistory });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @desc    Supprimer un client (uniquement si solde à zéro)
 */
DebtPayment.deleteClient = async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        if (!client) return res.status(404).json({ success: false, message: "Client introuvable." });
        if (client.dette > 0) return res.status(400).json({ success: false, message: "Impossible de supprimer un client ayant une dette." });

        await Client.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: "Client supprimé avec succès." });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- Exports de compatibilité ---
DebtPayment.getClient = async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        res.status(200).json({ success: true, data: { ...client.toObject(), dette: toNum(client.dette) } });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

DebtPayment.updateClient = async (req, res) => {
    try {
        const client = await Client.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json({ success: true, data: { ...client.toObject(), dette: toNum(client.dette) } });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

DebtPayment.getDebtEvolution = async (req, res) => {
    try {
        const movements = await DebtMovement.find().sort({ createdAt: 1 });
        res.status(200).json({ success: true, data: movements });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

module.exports = DebtPayment;