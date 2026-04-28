const OuvertureCaisse = require('../models/OuvertureCaisse');
const RapportCaisse = require('../models/RapportCaisse');

/**
 * Vérifie si le gérant a une caisse ouverte.
 */
exports.checkCaisseOuverte = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: "Utilisateur non authentifié." });
        }

        const userId = req.user.id || req.user._id;

        // Vérification de l'existence d'une boutique rattachée
        if (!req.user.boutique) {
            return res.status(403).json({ 
                message: "Accès refusé : Votre compte n'est rattaché à aucune boutique." 
            });
        }

        const query = {
            boutique: req.user.boutique,
            statut: 'OUVERTE' 
        };

        // SÉCURITÉ : Pour le gérant, on vérifie sa propre caisse (responsabilité financière).
        // Pour le serveur, on vérifie simplement qu'une caisse est ouverte dans la boutique.
        if (req.user.role === 'Gérant') {
            query.gerant = userId;
        }

        const ouverture = await OuvertureCaisse.findOne(query);

        if (!ouverture) {
            const errorMsg = req.user.role === 'Serveur' 
                ? "Opération impossible : La caisse de la boutique n'est pas encore ouverte. Demandez au gérant de l'ouvrir."
                : "Opération impossible : Vous devez d'abord ouvrir votre caisse pour la journée.";
            return res.status(403).json({ 
                message: errorMsg
            });
        }

        req.ouvertureCaisse = ouverture;
        next();
    } catch (error) {
        res.status(500).json({ 
            message: "Erreur technique lors de la vérification de la caisse.", 
            error: error.message 
        });
    }
};

/**
 * Empêche l'ouverture d'une nouvelle caisse si l'ancien rapport n'est pas validé.
 */
exports.checkAucunRapportEnAttente = async (req, res, next) => {
    try {
        const userId = req.user.id || req.user._id;

        const rapportEnAttente = await RapportCaisse.findOne({
            gerant: userId,
            statut: 'EN_ATTENTE'
        });

        if (rapportEnAttente) {
            return res.status(403).json({ 
                message: "Action bloquée : Votre rapport de caisse précédent doit être validé par l'administration avant d'ouvrir une nouvelle session." 
            });
        }

        next();
    } catch (error) {
        res.status(500).json({ 
            message: "Erreur technique lors du contrôle des rapports.", 
            error: error.message 
        });
    }
};