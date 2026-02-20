const Mouvement = require('../models/Mouvement');
const articleService = require('../services/articleService');

exports.getAllMouvements = async (req, res) => {
    try {
        // Basic filtering example
        const { type, boutique, startDate, endDate } = req.query;
        const filter = {};
        if (type) filter.type = type;
        if (boutique) {
            filter.$or = [
                { boutiqueSource: boutique },
                { boutiqueDestination: boutique }
            ];
        }

        // Filtre par date
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) {
                filter.createdAt.$gte = new Date(startDate);
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999); // Fin de la journée
                filter.createdAt.$lte = end;
            }
        }

        const mouvements = await Mouvement.find(filter)
            .populate('boutiqueSource', 'nom')
            .populate('boutiqueDestination', 'nom')
            .populate('fournisseur', 'nom')
            .populate('operateur', 'nom')
            .sort({ createdAt: -1 })
            .limit(200); // Limit to avoid performance issues on large datasets
        res.status(200).json(mouvements);
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la récupération des mouvements de stock.", error: error.message });
    }
};

exports.cancelMouvement = async (req, res) => {
    try {
        const Mouvement = require('../models/Mouvement');
        const mvt = await Mouvement.findById(req.params.id);
        if (!mvt) return res.status(404).json({ message: "Mouvement introuvable." });

        let result;
        if (mvt.type === 'Transfert') {
            result = await articleService.annulerTransfert(req.params.id, req.user.id);
        } else if (mvt.type === 'Approvisionnement') {
            result = await articleService.annulerApprovisionnement(req.params.id, req.user.id);
        } else {
            return res.status(400).json({ message: "Ce type de mouvement ne peut pas être annulé." });
        }
        res.status(200).json(result);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};