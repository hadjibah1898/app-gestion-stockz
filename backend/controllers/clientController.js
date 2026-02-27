const Client = require('../models/Client');
const nodemailer = require('nodemailer');

// @desc    Créer un nouveau client
// @route   POST /api/clients
// @access  Private (Admin, Gérant)
exports.createClient = async (req, res) => {
    try {
        // On enregistre l'ID du créateur (le gérant connecté)
        const client = await Client.create({ ...req.body, createur: req.user.id });

        // Envoi de l'email de bienvenue si l'email est fourni
        if (client.email) {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                }
            });

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: client.email,
                subject: 'Bienvenue chez StockDash !',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
                        <h2 style="color: #0d6efd; text-align: center;">Bienvenue ${client.nom} !</h2>
                        <p>Nous sommes ravis de vous compter parmi nos clients.</p>
                        <p>Votre fiche client a été créée avec succès.</p>
                        <p>À très bientôt !</p>
                        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                        <p style="font-size: 12px; color: #999; text-align: center;">StockDash - Gestion de stock</p>
                    </div>
                `
            };

            // Envoi asynchrone sans bloquer la réponse HTTP
            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.error("Erreur d'envoi d'email client:", error);
                } else {
                    console.log('Email client envoyé: ' + info.response);
                }
            });
        }

        res.status(201).json(client);
    } catch (error) {
        res.status(400).json({ message: "Erreur lors de la création du client", error: error.message });
    }
};

// @desc    Récupérer tous les clients
// @route   GET /api/clients
// @access  Private (Admin, Gérant)
exports.getClients = async (req, res) => {
    try {
        let query = {};

        // Si l'utilisateur est un Gérant, on applique le filtre de confidentialité
        if (req.user.role === 'Gérant') {
            query = { createur: req.user.id };
        }

        const clients = await Client.find(query).sort({ createdAt: -1 });
        res.status(200).json(clients);
    } catch (error) {
        res.status(500).json({ message: "Erreur serveur lors de la récupération des clients." });
    }
};

// @desc    Mettre à jour un client
// @route   PUT /api/clients/:id
// @access  Private (Admin, Gérant)
exports.updateClient = async (req, res) => {
    try {
        const client = await Client.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true,
        });
        if (!client) {
            return res.status(404).json({ message: "Client non trouvé." });
        }
        res.status(200).json(client);
    } catch (error) {
        res.status(400).json({ message: "Erreur lors de la mise à jour du client", error: error.message });
    }
};

// @desc    Supprimer un client
// @route   DELETE /api/clients/:id
// @access  Private (Admin, Gérant)
exports.deleteClient = async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        if (!client) {
            return res.status(404).json({ message: "Client non trouvé." });
        }

        // Règle métier : on ne peut pas supprimer un client qui a une dette.
        if (client.dette > 0) {
            return res.status(400).json({ message: "Impossible de supprimer un client avec une dette en cours." });
        }

        await Client.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Client supprimé avec succès." });
    } catch (error) {
        res.status(500).json({ message: "Erreur serveur lors de la suppression du client." });
    }
};