const venteService = require('../services/venteService');
const fs = require('fs');
const path = require('path');

const logFilePath = path.join(__dirname, '../logs/ventes.log');

// S'assurer que le dossier logs existe
if (!fs.existsSync(path.dirname(logFilePath))) {
    fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
}

// ✅ On s'assure que le nom est EXACTEMENT effectuerVente
exports.effectuerVente = async (req, res) => {
    try {
        const { articleId, quantiteVendue } = req.body;

        // 1. Validation des entrées avant d'appeler le service
        if (!articleId || !quantiteVendue || Number(quantiteVendue) <= 0) {  // Vérifie que la quantité est supérieure à 0
            return res.status(400).json({ message: "Données invalides : articleId requis et quantité doit être positive." });
        }

        // req.user.id vient du middleware protect
        const result = await venteService.traiterVente(articleId, quantiteVendue, req.user.id);

        const logMessage = `✅ [SUIVI VENTE] ID: ${result._id} | Article: ${articleId} | Qté: ${quantiteVendue} | Vendeur: ${req.user.id} | Date: ${new Date().toISOString()}`;
        
        // 1. Log console (pour le dev)
        console.log(logMessage);
        
        // 2. Log fichier (pour l'admin) - Ajout d'une nouvelle ligne
        fs.appendFile(logFilePath, logMessage + '\n', (err) => {
            if (err) console.error("Erreur d'écriture du log:", err);
        });

        res.status(201).json(result);
    } catch (error) {
        // 2. Distinction des erreurs (404 vs 400 vs 500)
        if (error.message === "Article introuvable") {
            return res.status(404).json({ message: error.message });
        }
        if (error.message.includes("Stock insuffisant")) {
            return res.status(400).json({ message: error.message });
        }
        
        // Erreur serveur non prévue (ex: Base de données inaccessible)
        console.error("Erreur Vente:", error);
        res.status(500).json({ message: "Une erreur interne est survenue." });
    }
};

// ✅ On définit aussi getHistorique pour éviter un crash sur la ligne suivante des routes
exports.getHistorique = async (req, res) => {
    try {
        const ventes = await venteService.listerVentes();
        res.status(200).json(ventes);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ✅ Nouvelle fonction pour lire les logs (Réservé Admin)
exports.getLogs = async (req, res) => {
    try {
        if (!fs.existsSync(logFilePath)) {
            return res.status(200).json({ logs: [] });
        }
        const data = fs.readFileSync(logFilePath, 'utf8');
        // On transforme le fichier texte en tableau de lignes
        const logs = data.split('\n').filter(line => line.trim() !== '').reverse(); // Plus récents en premier
        res.status(200).json({ logs });
    } catch (error) {
        res.status(500).json({ message: "Impossible de lire les logs." });
    }
};
