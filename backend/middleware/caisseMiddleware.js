const OuvertureCaisse = require('../models/OuvertureCaisse');
const RapportCaisse = require('../models/RapportCaisse');

/**
 * Vérifie si le gérant a une caisse ouverte.
 * Si oui, attache l'objet ouvertureCaisse à la requête.
 * Sinon, renvoie une erreur 403.
 */
exports.checkCaisseOuverte = async (req, res, next) => {
    try {
        const ouverture = await OuvertureCaisse.findOne({
            gerant: req.user.id,
            statut: 'OUVERTE'
        });

        if (!ouverture) {
            return res.status(403).json({ message: "Aucune caisse n'est actuellement ouverte. Veuillez en ouvrir une pour continuer." });
        }

        req.ouvertureCaisse = ouverture; // Attache l'objet complet
        next();
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la vérification du statut de la caisse.", error: error.message });
    }
};

/**
 * Vérifie si le gérant a un rapport en attente de validation.
 * Si oui, bloque l'ouverture d'une nouvelle caisse.
 */
exports.checkAucunRapportEnAttente = async (req, res, next) => {
    try {
        const rapportEnAttente = await RapportCaisse.findOne({
            gerant: req.user.id,
            statut: 'EN_ATTENTE'
        });

        if (rapportEnAttente) {
            return res.status(403).json({ message: "Action impossible. Vous avez un rapport de caisse précédent qui est toujours en attente de validation par un administrateur." });
        }

        next();
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la vérification des rapports en attente.", error: error.message });
    }
};