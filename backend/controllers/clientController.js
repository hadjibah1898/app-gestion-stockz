const Client = require('../models/Client');
const DebtMovement = require('../models/DebtMovement');

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
        res.status(201).json(client);
    } catch (error) {
        // Gestion spécifique de l'erreur d'email en double
        if (error.code === 11000 && error.keyPattern && error.keyPattern.email) {
            return res.status(400).json({ message: "Un client avec cet email existe déjà. Veuillez utiliser une autre adresse." });
        }
        // Gestion des autres erreurs de validation Mongoose
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ message: messages.join(', ') });
        }
        res.status(500).json({ message: "Erreur interne du serveur.", error: error.message });
    }
};

/**
 * @desc    Lister tous les clients
 * @route   GET /api/clients
 * @access  Private
 */
exports.getAllClients = async (req, res) => {
    try {
        const query = {};
        // Si l'utilisateur connecté est un Gérant, on ne lui montre que les clients qu'il a créés.
        // L'administrateur n'aura pas ce filtre et verra tous les clients.
        if (req.user.role === 'Gérant') {
            query.createur = req.user.id;
        }

        const clients = await Client.find(query).sort({ createdAt: -1 });
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
        const client = await Client.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!client) {
            return res.status(404).json({ message: "Client introuvable." });
        }
        res.status(200).json(client);
    } catch (error) {
        // Gestion spécifique de l'erreur d'email en double
        if (error.code === 11000 && error.keyPattern && error.keyPattern.email) {
            return res.status(400).json({ message: "Un client avec cet email existe déjà. Veuillez utiliser une autre adresse." });
        }
        // Gestion des autres erreurs de validation Mongoose
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ message: messages.join(', ') });
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
        const client = await Client.findById(req.params.id);
        if (!client) {
            return res.status(404).json({ message: "Client introuvable." });
        }
        if (client.dette > 0) {
            return res.status(400).json({ message: `Suppression impossible : ce client a encore une dette de ${client.dette.toLocaleString()} GNF.` });
        }
        await Client.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Client supprimé avec succès." });
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la suppression.", error: error.message });
    }
};

/**
 * @desc    Rembourser une partie ou la totalité d'une dette
 * @route   POST /api/clients/:id/pay-dette
 * @access  Private
 */
exports.payDette = async (req, res) => {
    try {
        const { montant } = req.body;
        const clientId = req.params.id;
        const operateurId = req.user.id;

        if (!montant || parseFloat(montant) <= 0) {
            return res.status(400).json({ message: "Le montant du remboursement doit être positif." });
        }

        const client = await Client.findById(clientId);
        if (!client) {
            return res.status(404).json({ message: "Client introuvable." });
        }

        const montantRembourse = parseFloat(montant);
        if (montantRembourse > client.dette) {
            return res.status(400).json({ message: `Le montant du remboursement (${montantRembourse.toLocaleString()} GNF) ne peut pas dépasser la dette actuelle (${client.dette.toLocaleString()} GNF).` });
        }

        const soldeAnterieur = client.dette;
        client.dette -= montantRembourse;
        const nouveauSolde = client.dette;

        await client.save();

        await DebtMovement.create({
            client: clientId,
            type: 'REMBOURSEMENT',
            montant: montantRembourse,
            soldeAnterieur,
            nouveauSolde,
            operateur: operateurId
        });

        res.status(200).json({ message: "Remboursement enregistré avec succès.", client });

    } catch (error) {
        res.status(500).json({ message: "Erreur lors de l'enregistrement du remboursement.", error: error.message });
    }
};

/**
 * @desc    Lister l'historique des mouvements de dettes
 * @route   GET /api/clients/debt-history
 * @access  Private
 */
exports.getDebtHistory = async (req, res) => {
    try {
        const history = await DebtMovement.find({})
            .populate('client', 'nom')
            .populate('operateur', 'nom')
            .sort({ createdAt: -1 });
        res.status(200).json(history);
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la récupération de l'historique des dettes.", error: error.message });
    }
};