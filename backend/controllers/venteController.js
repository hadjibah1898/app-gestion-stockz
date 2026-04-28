const mongoose = require('mongoose');
const venteService = require('../services/venteService');
const Client = require('../models/Client');
const Vente = require('../models/Vente');
const fs = require('fs').promises;
const path = require('path');
const { logAction } = require('../services/auditLogService');

const logFilePath = path.join(__dirname, '../logs/ventes.log');

exports.effectuerVente = async (req, res) => {
    try {
        const { panier, clientId, montantPaye, echeanceDette, hasRemise, modePaiement, transactionRef, numeroTable } = req.body;
        const ouvertureCaisseId = req.ouvertureCaisse._id; // Fourni par le middleware checkCaisseOuverte
        const resultats = await venteService.traiterPanier(
            panier,
            req.user, // Passez l'objet user complet ici
            req.user.boutique,
            hasRemise,
            clientId,
            montantPaye,
            echeanceDette,
            ouvertureCaisseId,
            req,
            modePaiement,
            transactionRef,
            numeroTable
        );
        res.status(201).json(resultats);
    } catch (error) {
        // Si l'erreur provient d'un manque de stock ou d'une validation métier
        if (error.message.includes('insuffisant') || error.message.includes('introuvable') || error.message.includes('supérieure')) {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: error.message });
    }
};

// Fichier : backend/controllers/venteController.js (à modifier)
exports.getHistorique = async (req, res) => {
    try {
        const { transactionRefSearch, ...otherFilters } = req.query;
        
        // Sécurité supplémentaire : On s'assure que le gérant ne tente pas de passer un gerantId tiers
        const filters = { ...otherFilters };
        if (req.user.role === 'Serveur') {
            // On force le serveur à ne voir que SES propres ventes
            filters.gerantId = req.user.id || req.user._id;
            filters.boutique = req.user.boutique?._id || req.user.boutique;
        } else if (req.user.role === 'Gérant') {
            // Le gérant voit toute SA boutique mais rien d'autre
            filters.boutique = req.user.boutique?._id || req.user.boutique;
            // Si le gérant tente de filtrer par un autre gérantId, le service filtrera par boutique de toute façon
        }

        // On passe l'objet utilisateur au service
        const data = await venteService.listerVentes({ ...filters, transactionRefSearch }, req.user);
        res.json(data);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.annulerVente = async (req, res) => {
    try {
        const result = await venteService.annulerVente(req.params.id, req.user, req);
        res.status(200).json(result);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.updateStatus = async (req, res) => {
    try {
        const { status } = req.body;
        if (!status) throw new Error("Le nouveau statut est manquant.");

        const result = await venteService.updateStatus(req.params.id, status, req.user, req);
        res.status(200).json(result);
    } catch (error) {
        console.error("Echec updateStatus:", error.message);
        res.status(400).json({ message: error.message || "Erreur interne du serveur" });
    }
};

exports.updateGroupStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const { orderGroupId } = req.params;
        if (!status) throw new Error("Le nouveau statut est manquant.");

        const result = await venteService.updateGroupStatus(orderGroupId, status, req.user, req);
        res.status(200).json(result);
    } catch (error) {
        console.error("Echec updateGroupStatus:", error.message);
        res.status(400).json({ message: error.message || "Erreur interne du serveur" });
    }
};

exports.updateTipPercentage = async (req, res) => {
    try {
        const { percentage } = req.body;
        if (percentage === undefined || isNaN(percentage)) {
            return res.status(400).json({ message: "Le pourcentage fourni est invalide." });
        }

        // SÉCURITÉ GLOBALE : Vérifier si une session est ouverte n'importe où dans le réseau
        const sessionActive = await mongoose.model('OuvertureCaisse').findOne({ statut: 'OUVERTE' });
        if (sessionActive) {
            return res.status(400).json({ message: "Modification impossible : Des sessions de caisse sont actuellement ouvertes. Attendez que tous les gérants aient clôturé leur caisse pour changer le taux par défaut." });
        }

        await venteService.updateTipConfig(percentage);

        // Enregistrement du succès dans le journal d'audit
        await logAction({
            req,
            user: req.user,
            action: 'UPDATE_TIP_PERCENTAGE',
            entity: 'Setting',
            details: { newPercentage: percentage },
            status: 'SUCCESS'
        });

        res.status(200).json({ message: "Le taux de pourboire a été mis à jour et sauvegardé." });
    } catch (error) {
        // Enregistrement de l'échec dans le journal d'audit
        await logAction({
            req,
            user: req.user,
            action: 'UPDATE_TIP_PERCENTAGE',
            entity: 'Setting',
            status: 'FAILURE',
            errorMessage: error.message,
            details: { attemptedPercentage: req.body.percentage }
        });
        res.status(500).json({ message: error.message });
    }
};

exports.getLogs = async (req, res) => {
    try {
        // Utilisation de la version asynchrone pour ne pas bloquer l'Event Loop
        const data = await fs.readFile(logFilePath, 'utf8');
        res.status(200).json({ logs: data.split('\n').reverse() });
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la lecture des logs." });
    }
};