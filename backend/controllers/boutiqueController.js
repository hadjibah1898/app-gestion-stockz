const mongoose = require('mongoose');
const Boutique = require('../models/Boutique');
const Article = require('../models/Article');
const User = require('../models/User');
const { logAction } = require('../services/auditLogService');

/**
 * @desc    Créer une boutique
 */
exports.createBoutique = async (req, res) => {
    try {
        // 1. Unicité de la Boutique Centrale
        if (req.body.type === 'Centrale') {
            const centraleExists = await Boutique.findOne({ type: 'Centrale' });
            if (centraleExists) {
                return res.status(400).json({ message: "Un Dépôt Principal existe déjà." });
            }
        }

        const { nom, adresse, active, type, vendeurs, latitude, longitude, tipPercentage, tipsEnabled } = req.body;
        
        // 2. Préparation et filtrage des gérants
        let managersToCheck = Array.isArray(vendeurs) ? vendeurs : (vendeurs ? [vendeurs] : []);
        // Filtrer les IDs non valides avant de les utiliser
        managersToCheck = managersToCheck.filter(id => id && mongoose.Types.ObjectId.isValid(id));

        // Vérification que les utilisateurs sont bien des gérants
        const validManagers = await User.find({ _id: { $in: managersToCheck }, role: 'Gérant' });
        if (validManagers.length !== managersToCheck.length) {
            return res.status(400).json({ message: "Certains utilisateurs sélectionnés ne sont pas des gérants valides." });
        }

        // 3. CONTRAINTE : Un gérant ne gère qu'une seule boutique
        if (managersToCheck.length > 0) {
            const alreadyAssigned = await Boutique.findOne({ vendeurs: { $in: managersToCheck } });
            if (alreadyAssigned) {
                return res.status(400).json({ 
                    message: `L'un des gérants sélectionnés est déjà assigné à : ${alreadyAssigned.nom}` 
                });
            }
        }

        const boutiqueData = {
            nom,
            adresse,
            active: active !== undefined ? active : true,
            type: type || 'Secondaire',
            vendeurs: managersToCheck,
            tipPercentage: tipPercentage !== undefined ? Math.min(Math.max(Number(tipPercentage), 0), 100) : 5,
            tipsEnabled: tipsEnabled !== undefined ? tipsEnabled : true,
            latitude: (latitude !== undefined && latitude !== "") ? Number(latitude) : 9.6412,
            longitude: (longitude !== undefined && longitude !== "") ? Number(longitude) : -13.5784,
            createur: req.user.id
        };

        const boutique = await Boutique.create(boutiqueData);

        // SYNCHRONISATION : Mettre à jour le champ boutique sur les gérants assignés
        if (managersToCheck.length > 0) {
            await User.updateMany(
                { _id: { $in: managersToCheck } },
                { $set: { boutique: boutique._id } }
            );
        }

        await logAction({
            req,
            user: req.user,
            action: 'CREATE_BOUTIQUE',
            entity: 'Boutique',
            entityId: boutique._id,
            details: { data: boutique.toObject() },
            status: 'SUCCESS'
        });

        res.status(201).json(boutique);
    } catch (error) {
        if (error.code === 11000) return res.status(400).json({ message: "Nom de boutique déjà utilisé." });
        res.status(400).json({ message: error.message });
    }
};

/**
 * @desc    Modifier une boutique
 */
exports.updateBoutique = async (req, res) => {
    try {
        const boutiqueId = req.params.id;
        const boutiqueToUpdate = await Boutique.findById(boutiqueId).lean();
        
        if (!boutiqueToUpdate) return res.status(404).json({ message: "Boutique introuvable." });

        // 1. Validation du type (Centrale)
        if (req.body.type) {
            if (req.body.type === 'Centrale' && boutiqueToUpdate.type !== 'Centrale') {
                const centraleExists = await Boutique.findOne({ type: 'Centrale' });
                if (centraleExists) return res.status(400).json({ message: "Un Dépôt Principal existe déjà." });
            }
            if (req.body.type !== 'Centrale' && boutiqueToUpdate.type === 'Centrale') {
                return res.status(400).json({ message: "Le type du Dépôt Principal ne peut pas être modifié." });
            }
        }

        // 2. Gestion des gérants (Tableau)
        let newManagers = Array.isArray(req.body.vendeurs) ? req.body.vendeurs : (req.body.vendeurs ? [req.body.vendeurs] : []);
        newManagers = newManagers.filter(id => id && id.length === 24);

        // 3. CONTRAINTE : Un gérant ne gère qu'une seule boutique
        // On vérifie si les gérants choisis sont déjà dans une AUTRE boutique
        if (newManagers.length > 0) {
            const alreadyAssigned = await Boutique.findOne({ 
                _id: { $ne: boutiqueId }, 
                vendeurs: { $in: newManagers } 
            });

            if (alreadyAssigned) {
                return res.status(400).json({ 
                    message: `L'un des gérants est déjà affecté à "${alreadyAssigned.nom}".` 
                });
            }
        }

        // SYNCHRONISATION DES GÉRANTS
        // 1. Retirer la boutique des anciens gérants qui ne sont plus dans la liste
        const oldManagers = boutiqueToUpdate.vendeurs.map(id => id.toString());
        const removedManagers = oldManagers.filter(id => !newManagers.includes(id));
        if (removedManagers.length > 0) {
            await User.updateMany({ _id: { $in: removedManagers } }, { $set: { boutique: null } });
        }

        // 2. Ajouter la boutique aux nouveaux gérants
        if (newManagers.length > 0) {
            await User.updateMany({ _id: { $in: newManagers } }, { $set: { boutique: boutiqueId } });
        }

        // SÉCURITÉ : Bloquer le changement de taux si une caisse est ouverte dans cette boutique
        if (req.body.tipPercentage !== undefined && Number(req.body.tipPercentage) !== boutiqueToUpdate.tipPercentage) {
            const sessionActive = await mongoose.model('OuvertureCaisse').findOne({ 
                boutique: boutiqueId, 
                statut: 'OUVERTE' 
            });
            if (sessionActive) {
                return res.status(400).json({ message: "Action refusée : Une caisse est actuellement ouverte dans cette boutique. Clôturez la session avant de modifier le taux de pourboire." });
            }
        }

        const { nom, adresse, active, type, latitude, longitude, tipPercentage, tipsEnabled } = req.body;

        const updateObject = {
            $set: {
                nom: nom || boutiqueToUpdate.nom,
                adresse: adresse || boutiqueToUpdate.adresse,
                active: active !== undefined ? active : boutiqueToUpdate.active,
                type: type || boutiqueToUpdate.type,
                tipPercentage: tipPercentage !== undefined ? Math.min(Math.max(Number(tipPercentage), 0), 100) : boutiqueToUpdate.tipPercentage,
                tipsEnabled: tipsEnabled !== undefined ? tipsEnabled : boutiqueToUpdate.tipsEnabled,
                vendeurs: newManagers,
                latitude: (latitude !== "" && !isNaN(Number(latitude))) ? Number(latitude) : boutiqueToUpdate.latitude,
                longitude: (longitude !== "" && !isNaN(Number(longitude))) ? Number(longitude) : boutiqueToUpdate.longitude,
                dernierModificateur: req.user.id
            },
            $unset: { vendeur: "" } // Nettoyage de l'ancien champ singulier
        };

        const boutique = await Boutique.findByIdAndUpdate(boutiqueId, updateObject, { new: true, runValidators: true })
            .populate('vendeurs', 'nom email')
            .lean();

        await logAction({
            req, user: req.user, action: 'UPDATE_BOUTIQUE', entity: 'Boutique', entityId: boutique._id,
            details: { before: boutiqueToUpdate, after: boutique }, status: 'SUCCESS'
        });

        res.status(200).json(boutique);
    } catch (error) {
        res.status(400).json({ message: "Erreur lors de la mise à jour", error: error.message });
    }
};

/**
 * @desc    Lister toutes les boutiques (avec agrégation)
 */
exports.getAllBoutiques = async (req, res) => {
    try {
        const boutiques = await Boutique.aggregate([
            { $sort: { type: 1, nom: 1 } },
            {
                $lookup: {
                    from: 'articles',
                    localField: '_id',
                    foreignField: 'boutique',
                    as: 'articles'
                }
            },
            {
                $addFields: {
                    // Fusion et nettoyage des anciens/nouveaux gérants pour l'affichage
                    vendeurs: {
                        $map: {
                            input: {
                                $setUnion: [
                                    { $cond: [{ $isArray: "$vendeurs" }, "$vendeurs", []] },
                                    { $cond: [
                                        { $and: [{ $gt: ["$vendeur", null] }, { $ne: ["$vendeur", ""] }] },
                                        ["$vendeur"],
                                        []
                                    ]}
                                ]
                            },
                            as: "v",
                            in: { 
                                $convert: { 
                                    input: "$$v", 
                                    to: "objectId", 
                                    onError: null, // Gère les IDs malformés sans faire planter
                                    onNull: null 
                                } 
                            }
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'vendeurs',
                    foreignField: '_id',
                    as: 'vendeurs'
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: 'boutique',
                    as: 'allUsers'
                }
            },
            {
                $lookup: {
                    from: 'ouverturecaisses',
                    let: { bId: '$_id' },
                    pipeline: [
                        { $match: { $expr: { $and: [{ $eq: ['$boutique', '$$bId'] }, { $eq: ['$statut', 'OUVERTE'] }] } } },
                        { $project: { _id: 1 } },
                        { $limit: 1 }
                    ],
                    as: 'openSession'
                }
            },
            { 
                $addFields: { 
                    articleCount: { $size: '$articles' },
                    isSessionOpen: { $gt: [{ $size: '$openSession' }, 0] },
                    serverCount: {
                        $size: {
                            $filter: {
                                input: "$allUsers",
                                as: "u",
                                cond: { $eq: ["$$u.role", "Serveur"] }
                            }
                        }
                    }
                } 
            },
            { $project: { articles: 0, allUsers: 0, openSession: 0 } }
        ]);
        res.status(200).json(boutiques);
    } catch (error) {
        res.status(500).json({ message: "Erreur serveur", error: error.message });
    }
};

/**
 * @desc    Supprimer une boutique
 */
exports.deleteBoutique = async (req, res) => {
    try {
        const boutiqueToDelete = await Boutique.findById(req.params.id).lean();
        if (!boutiqueToDelete) return res.status(404).json({ message: "Boutique introuvable." });
        if (boutiqueToDelete.type === 'Centrale') return res.status(400).json({ message: "Action interdite sur le Dépôt Principal." });

        const articlesCount = await Article.countDocuments({ boutique: req.params.id });
        if (articlesCount > 0) {
            return res.status(400).json({ message: `Boutique non vide (${articlesCount} articles).` });
        }

        await Boutique.findByIdAndDelete(req.params.id);
        await logAction({ req, user: req.user, action: 'DELETE_BOUTIQUE', entity: 'Boutique', entityId: req.params.id, status: 'SUCCESS' });

        res.status(200).json({ message: "Supprimée avec succès" });
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la suppression", error: error.message });
    }
};