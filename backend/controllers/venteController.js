const venteService = require('../services/venteService');
const Client = require('../models/Client');
const Vente = require('../models/Vente');
const fs = require('fs').promises;
const path = require('path');

const logFilePath = path.join(__dirname, '../logs/ventes.log');

exports.effectuerVente = async (req, res) => {
    try {
        const { panier, clientId, montantPaye, echeanceDette, hasRemise } = req.body;
        const ouvertureCaisseId = req.ouvertureCaisse._id; // Fourni par le middleware checkCaisseOuverte
        const resultats = await venteService.traiterPanier(
            panier,
            req.user.id,
            req.user.boutique,
            hasRemise,
            clientId,
            montantPaye,
            echeanceDette,
            ouvertureCaisseId
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
        // On passe l'objet utilisateur au service
        const data = await venteService.listerVentes(req.query, req.user);
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

exports.getLogs = async (req, res) => {
    try {
        // Utilisation de la version asynchrone pour ne pas bloquer l'Event Loop
        const data = await fs.readFile(logFilePath, 'utf8');
        res.status(200).json({ logs: data.split('\n').reverse() });
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la lecture des logs." });
    }
};