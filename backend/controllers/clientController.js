const Client = require('../models/Client');
const DebtMovement = require('../models/DebtMovement');
const { logAction } = require('../services/auditLogService');
const DebtPayment = require('../models/DebtPayment');
const notificationService = require('../services/notificationService');
const CaisseAdmin = require('../models/CaisseAdmin');
const User = require('../models/User');
const Boutique = require('../models/Boutique');

/**
 * @desc    Créer un client
 * @route   POST /api/clients
 * @access  Private
 */
exports.createClient = async (req, res) => {
    try {
        // Ajout de l'ID du créateur pour la traçabilité
        const clientData = { ...req.body, createur: req.user.id };
        const client = await Client.create(clientData);

        await logAction({
            req,
            user: req.user,
            action: 'CREATE_CLIENT',
            entity: 'Client',
            entityId: client._id,
            details: { data: client.toObject() },
            status: 'SUCCESS'
        });

        res.status(201).json(client);
    } catch (error) {
        // Gestion spécifique de l'erreur d'email en double (Règles JS natives)
        if (error.code === 11000 && error.keyPattern && error.keyPattern.email) {
            return res.status(400).json({ message: "Un client avec cet email existe déjà." });
        }
        // Gestion des erreurs de validation Mongoose
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ message: messages.join(', ') });
        }
        res.status(500).json({ message: "Erreur interne du serveur.", error: error.message });
    }
};

/**
 * @desc    Lister les clients (Filtre par Gérant)
 * @route   GET /api/clients
 * @access  Private
 */
exports.getAllClients = async (req, res) => {
    try {
        const query = {};
        
        // Sécurité : Le gérant ne voit que les clients qu'il a créés
        if (req.user.role === 'Gérant' || req.user.role === 'Gerant') {
            query.createur = req.user.id;
        }

        const clients = await Client.find(query)
            .populate('createur', 'nom')
            .populate('dernierModificateur', 'nom')
            .sort({ createdAt: -1 });

        res.status(200).json(clients);
    } catch (error) {
        res.status(500).json({ message: "Impossible de récupérer les clients.", error: error.message });
    }
};

/**
 * @desc    Modifier un client
 * @route   PUT /api/clients/:id
 * @access  Private
 */
exports.updateClient = async (req, res) => {
    try {
        const clientBefore = await Client.findById(req.params.id).lean();
        if (!clientBefore) {
            return res.status(404).json({ message: "Client introuvable." });
        }

        const updateData = {
            ...req.body,
            dernierModificateur: req.user.id 
        };

        const client = await Client.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });

        await logAction({
            req,
            user: req.user,
            action: 'UPDATE_CLIENT',
            entity: 'Client',
            entityId: client._id,
            details: { before: clientBefore, after: client.toObject() },
            status: 'SUCCESS'
        });

        res.status(200).json(client);
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ message: "Email déjà utilisé." });
        }
        res.status(500).json({ message: "Erreur lors de la mise à jour.", error: error.message });
    }
};

/**
 * @desc    Supprimer un client
 * @route   DELETE /api/clients/:id
 * @access  Private
 */
exports.deleteClient = async (req, res) => {
    try {
        const client = await Client.findById(req.params.id).lean();
        if (!client) {
            return res.status(404).json({ message: "Client introuvable." });
        }
        
        // Vérification de la dette avant suppression (Sécurité financière)
        if (client.dette > 0) {
            return res.status(400).json({ 
                message: `Suppression impossible : dette de ${client.dette.toLocaleString()} GNF.` 
            });
        }

        await Client.findByIdAndDelete(req.params.id);

        await logAction({
            req,
            user: req.user,
            action: 'DELETE_CLIENT',
            entity: 'Client',
            entityId: client._id,
            details: { deletedClient: client },
            status: 'SUCCESS'
        });

        res.status(200).json({ message: "Client supprimé avec succès." });
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la suppression.", error: error.message });
    }
};

/**
 * @desc    Rembourser une dette
 * @route   POST /api/clients/:id/pay-dette
 * @access  Private
 */
exports.payDette = async (req, res) => {
    try {
        const { montant } = req.body;
        const clientId = req.params.id;
 
        if (!montant || parseFloat(montant) <= 0) {
            return res.status(400).json({ message: "Montant invalide." });
        }
 
        const client = await Client.findById(clientId);
        if (!client) return res.status(404).json({ message: "Client introuvable." });
 
        const montantRembourse = parseFloat(montant);
        if (montantRembourse > client.dette) {
            return res.status(400).json({ message: "Le remboursement dépasse la dette restante." });
        }
 
        // Crée un paiement en attente au lieu de modifier directement la dette
        const debtPayment = await DebtPayment.create({
            client: clientId,
            montant: montantRembourse,
            gerant: req.user.id,
            boutique: req.user.boutique,
        });
 
        // Notifier les administrateurs
        await notificationService.sendDebtPaymentPendingAlert(req.user, client, montantRembourse);
 
        res.status(200).json({ message: "Paiement enregistré. En attente de validation par l'administrateur.", debtPayment });
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de l'enregistrement du paiement.", error: error.message });
    }
};

/**
 * @desc    Lister les clients ayant une dette
 * @route   GET /api/clients/debts
 * @access  Private
 */
exports.getDebts = async (req, res) => {
    try {
        const query = { dette: { $gt: 0 } };
        // Le gérant ne voit que les clients qu'il a créés
        if (req.user.role === 'Gérant') {
            query.createur = req.user.id;
        }
        const debts = await Client.find(query).sort({ echeanceDette: 1 });
        res.status(200).json(debts);
    } catch (error) {
        res.status(500).json({ message: "Erreur lors du chargement des dettes.", error: error.message });
    }
};

/**
 * @desc    Lister les paiements de dette en attente de validation
 * @route   GET /api/clients/debt-payments/pending
 * @access  Private/Admin
 */
exports.getPendingDebtPayments = async (req, res) => {
    try {
        const payments = await DebtPayment.find({ statut: 'EN_ATTENTE' })
            .populate('client', 'nom telephone')
            .populate('gerant', 'nom')
            .populate('boutique', 'nom')
            .sort({ createdAt: -1 });
        res.status(200).json(payments);
    } catch (error) {
        res.status(500).json({ message: "Erreur lors du chargement des validations.", error: error.message });
    }
};

/**
 * @desc    Valider un paiement de dette
 * @route   PUT /api/clients/debt-payments/:id/validate
 * @access  Private/Admin
 */
exports.validateDebtPayment = async (req, res) => {
    try {
        const payment = await DebtPayment.findById(req.params.id).populate('gerant', 'nom').populate('boutique', 'nom');
        if (!payment || payment.statut !== 'EN_ATTENTE') {
            return res.status(404).json({ message: "Paiement introuvable ou déjà traité." });
        }

        const client = await Client.findById(payment.client);
        if (!client) {
            return res.status(404).json({ message: "Client associé introuvable." });
        }

        // Mettre à jour la dette du client
        client.dette -= payment.montant;
        await client.save();

        // Mettre à jour le statut du paiement
        payment.statut = 'VALIDEE';
        payment.adminValidateur = req.user.id;
        payment.dateValidation = new Date();
        await payment.save();

        // Mettre à jour la caisse admin
        const caisseAdmin = await CaisseAdmin.getInstance();
        caisseAdmin.soldeActuel += payment.montant;
        caisseAdmin.historique.push({
            // Pas de rapport ici, on utilise la description
            description: `Encaissement dette de ${client.nom}`,
            montant: payment.montant,
            dateValidation: payment.dateValidation,
            gerant: payment.gerant?.nom || 'Gérant supprimé',
            boutique: payment.boutique?.nom || 'Boutique supprimée',
            admin: req.user.nom,
        });
        await caisseAdmin.save();

        // Notifier le gérant
        await notificationService.sendDebtPaymentValidatedAlert(payment.gerant, client, payment.montant);

        res.status(200).json({ message: "Paiement validé avec succès." });
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la validation.", error: error.message });
    }
};

/**
 * @desc    Calculer l'évolution du total des dettes dans le temps
 * @route   GET /api/clients/debt-evolution
 * @access  Private
 */
exports.getDebtEvolution = async (req, res) => {
    try {
        const debtChanges = await DebtMovement.aggregate([
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    dailyChange: {
                        $sum: {
                            $cond: [{ $eq: ["$type", "CREATION"] }, "$montant", { $multiply: ["$montant", -1] }]
                        }
                    }
                }
            },
            { $sort: { _id: 1 } } // Sort by date ascending
        ]);

        let runningTotal = 0;
        const evolution = debtChanges.map(change => {
            runningTotal += change.dailyChange;
            return {
                date: change._id,
                totalDebt: runningTotal
            };
        });

        res.status(200).json(evolution);
    } catch (error) {
        res.status(500).json({ message: "Erreur lors du calcul de l'évolution des dettes.", error: error.message });
    }
};

/**
 * @desc    Historique des dettes (Filtre par Gérant)
 * @route   GET /api/clients/debt-history
 * @access  Private
 */
exports.getDebtHistory = async (req, res) => {
    try {
        const query = {};

        // Sécurité : Chaque gérant ne voit que son historique d'opérations
        if (req.user.role === 'Gérant' || req.user.role === 'Gerant') {
            query.operateur = req.user.id;
        }

        const history = await DebtMovement.find(query)
            .populate('client', 'nom')
            .populate('operateur', 'nom')
            .sort({ createdAt: -1 });

        res.status(200).json(history);
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la récupération de l'historique.", error: error.message });
    }
};