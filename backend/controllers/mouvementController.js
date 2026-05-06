const Mouvement = require('../models/Mouvement');
const articleService = require('../services/articleService');
const Boutique = require('../models/Boutique');

exports.getAllMouvements = async (req, res) => {
    try {
        // Basic filtering example
        const { type, boutique, startDate, endDate, page = 1, limit = 15 } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);

        const filter = {};
        if (type) filter.type = type;

        // SÉCURITÉ MULTI-TENANT
        if (req.user.role === 'Gérant' || req.user.role === 'Serveur') {
            // On récupère l'ID de la boutique de l'utilisateur connecté
            const userBoutiqueId = req.user.boutique?._id || req.user.boutique;
            filter.$or = [
                { boutiqueSource: userBoutiqueId },
                { boutiqueDestination: userBoutiqueId }
            ];
        } else if (req.user.role === 'Admin') {
            const myBoutiques = await Boutique.find({ createur: req.user.id }).select('_id');
            const myIds = myBoutiques.map(b => b._id);
            
            if (boutique) {
                if (!myIds.map(id => id.toString()).includes(boutique.toString())) {
                    return res.status(403).json({ message: "Accès refusé : Cette boutique ne vous appartient pas." });
                }
                filter.$or = [{ boutiqueSource: boutique }, { boutiqueDestination: boutique }];
            } else {
                filter.$or = [{ boutiqueSource: { $in: myIds } }, { boutiqueDestination: { $in: myIds } }];
            }
        } else if (boutique) {
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

        // Cas spécial Export : Si limit est 0, on renvoie tout sans pagination
        if (limitNum === 0) {
            const mouvementsAll = await Mouvement.find(filter)
                .populate('boutiqueSource boutiqueDestination fournisseur operateur', 'nom')
                .sort({ createdAt: -1 });
            
            return res.status(200).json({ data: mouvementsAll, totalCount: mouvementsAll.length });
        }

        const totalCount = await Mouvement.countDocuments(filter);
        const mouvements = await Mouvement.find(filter)
            .populate('boutiqueSource', 'nom')
            .populate('boutiqueDestination', 'nom')
            .populate('fournisseur', 'nom')
            .populate('operateur', 'nom')
            .sort({ createdAt: -1 })
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum);

        res.status(200).json({
            data: mouvements,
            totalPages: Math.ceil(totalCount / limitNum),
            currentPage: pageNum,
            totalCount
        });
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la récupération des mouvements de stock.", error: error.message });
    }
};

exports.cancelMouvement = async (req, res) => {
    try {
        const mvt = await Mouvement.findById(req.params.id);
        if (!mvt) return res.status(404).json({ message: "Mouvement introuvable." });

        let result;
        if (mvt.type === 'Transfert') {
            result = await articleService.annulerTransfert(req.params.id, req.user);
        } else if (mvt.type === 'Approvisionnement') {
            result = await articleService.annulerApprovisionnement(req.params.id, req.user);
        } else {
            return res.status(400).json({ message: "Ce type de mouvement ne peut pas être annulé." });
        }
        res.status(200).json(result);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.confirmerReception = async (req, res) => {
    try {
        // Appel du service de confirmation de réception
        const result = await articleService.confirmerReceptionTransfert(req.params.id, req.user);
        res.status(200).json(result);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};