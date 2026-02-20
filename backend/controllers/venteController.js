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
        // Accepte soit un panier (tableau), soit un article unique (rétrocompatibilité)
        const items = req.body.panier || (req.body.articleId ? [{ articleId: req.body.articleId, quantiteVendue: req.body.quantiteVendue }] : []);

        if (!items || items.length === 0) {
            return res.status(400).json({ message: "Le panier est vide." });
        }

        if (!req.user.boutique && req.user.role !== 'Admin') {
             return res.status(400).json({ message: "Aucune boutique associée à ce vendeur." });
        }

        // Appel du service qui gère la transaction globale pour le panier
        const resultats = await venteService.traiterPanier(items, req.user.id, req.user.boutique);

        // Logging après succès
        resultats.forEach(result => {
            const logMessage = `✅ [SUIVI VENTE] ID: ${result._id} | Article: ${result.article} | Qté: ${result.quantite} | Vendeur: ${req.user.id} | Date: ${new Date().toISOString()}`;
            console.log(logMessage);
            fs.appendFile(logFilePath, logMessage + '\n', (err) => {
                if (err) console.error("Erreur d'écriture du log:", err);
            });
        });

        res.status(201).json(resultats);

    } catch (error) {
        console.error("Erreur Vente:", error);
        
        // Gestion spécifique pour ID invalide (CastError de Mongoose)
        if (error.name === 'CastError') {
            return res.status(400).json({ message: "L'ID de l'article est invalide (format incorrect)." });
        }

        // Gestion des erreurs métier (Stock, ID invalide...) vs erreurs serveur
        const status = error.message.includes("Stock insuffisant") || error.message.includes("introuvable") ? 400 : 500;
        res.status(status).json({ message: error.message });
    }
};

// ✅ On définit aussi getHistorique pour éviter un crash sur la ligne suivante des routes
exports.getHistorique = async (req, res) => {
    try {
        const filter = {};
        if (req.user.role === 'Gérant') {
            if (!req.user.boutique) {
                return res.status(200).json([]);
            }
            filter.boutique = req.user.boutique;
        }

        // Ajout du filtre par date
        const { startDate, endDate, gerantId } = req.query;
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) {
                filter.createdAt.$gte = new Date(startDate);
            }
            if (endDate) {
                // On met la fin de la journée pour inclure toutes les ventes du jour sélectionné
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = end;
            }
        }

        // Filtre par gérant spécifique (utile pour l'admin)
        if (gerantId) {
            filter.gerant = gerantId;
        }

        const ventes = await venteService.listerVentes(filter);
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

exports.annulerVente = async (req, res) => {
    try {
        const result = await venteService.annulerVente(req.params.id, req.user);
        res.status(200).json(result);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};
