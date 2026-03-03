const venteService = require('../services/venteService');
const Client = require('../models/Client');
const Vente = require('../models/Vente');
const fs = require('fs');
const path = require('path');

const logFilePath = path.join(__dirname, '../logs/ventes.log');

exports.effectuerVente = async (req, res) => {
    try {
        const { panier, clientId, montantPaye, echeanceDette, hasRemise } = req.body;
        const resultats = await venteService.traiterPanier(
            panier,
            req.user.id,
            req.user.boutique,
            hasRemise,
            clientId,
            montantPaye,
            echeanceDette
        );
        res.status(201).json(resultats);
    } catch (error) {
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


exports.getPendingSales = async (req, res) => {
    try {
        const filter = req.user.role === 'Gérant' ? { gerant: req.user.id } : {};
        const ventes = await venteService.listerVentesEnAttente(filter);
        res.status(200).json(ventes);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.annulerVente = async (req, res) => {
    try {
        const result = await venteService.annulerVente(req.params.id, req.user);
        res.status(200).json(result);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.validateRemise = async (req, res) => {
    try {
        const vente = await venteService.validerRemise(req.params.id);
        res.status(200).json(vente);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.rejectRemise = async (req, res) => {
    try {
        const result = await venteService.refuserRemise(req.params.id, req.user);
        res.status(200).json(result);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.getLogs = async (req, res) => {
    try {
        const data = fs.readFileSync(logFilePath, 'utf8');
        res.status(200).json({ logs: data.split('\n').reverse() });
    } catch (error) {
        res.status(500).json({ message: "Erreur logs" });
    }
};