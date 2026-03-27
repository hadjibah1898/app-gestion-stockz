const Client = require('../models/Client');
const DebtMovement = require('../models/DebtMovement');
const { logAction } = require('../services/auditLogService');
const DebtPayment = require('../models/DebtPayment');
const notificationService = require('../services/notificationService');
const CaisseAdmin = require('../models/CaisseAdmin');
const User = require('../models/User');
const Boutique = require('../models/Boutique');
const Caisse = require('../models/OuvertureCaisse');
const Depense = require('../models/Depense');
const commissionService = require('../services/commissionService');

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
 * @desc    Obtenir un client par ID
 * @route   GET /api/clients/:id
 * @access  Private
 */
exports.getClient = async (req, res) => {
    try {
        const client = await Client.findById(req.params.id)
            .populate('createur', 'nom')
            .populate('dernierModificateur', 'nom');
            
        if (!client) {
            return res.status(404).json({ message: "Client introuvable." });
        }

        res.status(200).json(client);
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la récupération du client.", error: error.message });
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

        // AUDIT : Vérifier si le client a un historique de paiements (même soldés)
        const hasHistory = await DebtPayment.exists({ client: req.params.id });
        if (hasHistory) {
            return res.status(400).json({ 
                message: "Suppression impossible (Piste d'audit) : Ce client a des transactions historiques. Veuillez le désactiver plutôt." 
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
            datePaiement: new Date(), // FIX: Assurer que la date est enregistrée dès la création
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
        const query = { statut: 'EN_ATTENTE' };

        // Sécurité & Logique Comptable : Un gérant ne doit voir que les encaissements
        // qu'il a lui-même réalisés pour le calcul de sa propre caisse.
        // L'admin voit tout.
        if (req.user.role === 'Gérant' || req.user.role === 'Gerant') {
            query.gerant = req.user.id;
        }

        const payments = await DebtPayment.find(query)
            .populate('client', 'nom telephone dette')
            .populate('gerant', 'nom')
            .populate('boutique', 'nom')
            .sort({ createdAt: -1 });
        res.status(200).json(payments);
    } catch (error) {
        res.status(500).json({ message: "Erreur lors du chargement des validations.", error: error.message });
    }
};

/**
 * @desc    Rejeter un paiement de dette (Annulation)
 * @route   PUT /api/clients/debt-payments/:id/reject
 * @access  Private/Admin
 */
exports.rejectDebtPayment = async (req, res) => {
    try {
        const payment = await DebtPayment.findById(req.params.id).populate('client', 'nom').populate('gerant', 'nom');
        if (!payment || payment.statut !== 'EN_ATTENTE') {
            return res.status(404).json({ message: "Paiement introuvable ou déjà traité." });
        }

        payment.statut = 'REJETE';
        payment.adminValidateur = req.user.id;
        payment.dateValidation = new Date();
        await payment.save();

        await logAction({
            req,
            user: req.user,
            action: 'REJECT_DEBT_PAYMENT',
            entity: 'DebtPayment',
            entityId: payment._id,
            details: {
                client: payment.client?.nom,
                amount: payment.montant,
                gerant: payment.gerant?.nom
            },
            status: 'SUCCESS'
        });
        res.status(200).json({ message: "Paiement rejeté (annulé) avec succès." });
    } catch (error) {
        res.status(500).json({ message: "Erreur lors du rejet.", error: error.message });
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

        // AJOUT EXPERT : Créer un mouvement de dette (Ledger) pour l'historique complet du client
        // Cela permet de voir dans "Evolution Dette" quand la dette a baissé.
        await DebtMovement.create({
            client: client._id,
            type: 'REMBOURSEMENT', // Ou 'PAIEMENT'
            montant: payment.montant, // Montant négatif implicite pour la dette
            soldeAnterieur: client.dette + payment.montant,
            nouveauSolde: client.dette,
            operateur: req.user.id,
            details: `Paiement validé (Réf: ${payment._id})`
        });

        await logAction({
            req,
            user: req.user,
            action: 'VALIDATE_DEBT_PAYMENT',
            entity: 'DebtPayment',
            entityId: payment._id,
            details: {
                client: client.nom,
                amount: payment.montant,
                gerant: payment.gerant?.nom
            },
            status: 'SUCCESS'
        });
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
        if (payment.gerant) {
            // On passe l'ID explicitement pour éviter les erreurs si l'objet est peuplé
            notificationService.sendDebtPaymentValidatedAlert(payment.gerant._id || payment.gerant, client, payment.montant).catch(console.error);
        }

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
        // La méthode .find({}) sans condition est cruciale : elle sélectionne TOUS les documents.
        // C'est la bonne pratique pour un historique complet.
        const query = {};

        // FIX: Permettre le filtrage par client si demandé (ex: Fiche client)
        if (req.query.client) {
            query.client = req.query.client;
        }

        // Sécurité : Chaque gérant ne voit que les paiements qu'il a initiés.
        if (req.user.role === 'Gérant' || req.user.role === 'Gerant') {
            query.gerant = req.user.id;
        }

        const history = await DebtPayment.find(query)
            .sort({ datePaiement: -1 }) // Toujours trier du plus récent au plus ancien
            .populate('client', 'nom dette')
            .populate('gerant', 'nom')
            .populate('boutique', 'nom'); // Ajout de la population de la boutique
            
        res.status(200).json(history);
    } catch (error) {
        console.error("Erreur dans getDebtHistory:", error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération de l'historique." });
    }
};

/**
 * @desc    Payer une commission à un ouvrier (Transaction Atomique)
 * @route   POST /api/clients/pay-commission
 * @access  Private (Gérant)
 */
exports.payCommission = async (req, res) => {
    try {
        const { workerId, montant } = req.body;

        const result = await commissionService.payManualCommission({
            workerId,
            montant,
            gerantId: req.user.id,
            boutiqueId: req.user.boutique
        });

        res.status(200).json(result);
    } catch (error) {
        res.status(error.statusCode || 500).json({ message: error.message });
    }
};
