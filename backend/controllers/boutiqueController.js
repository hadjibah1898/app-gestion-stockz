const Boutique = require('../models/Boutique');
const Article = require('../models/Article');

/**
 * @desc    Créer une boutique
 * @route   POST /api/boutiques
 * @access  Private/Admin
 */
exports.createBoutique = async (req, res) => {
    try {
        // Logique pour s'assurer qu'il n'y a qu'une seule Boutique Centrale
        if (req.body.type === 'Centrale') {
            const centraleExists = await Boutique.findOne({ type: 'Centrale' });
            if (centraleExists) {
                return res.status(400).json({ message: "Une Boutique Centrale existe déjà. Il ne peut y en avoir qu'une." });
            }
        }

        const boutique = await Boutique.create(req.body);
        res.status(201).json(boutique);
    } catch (error) {
        res.status(400).json({ message: "Erreur lors de la création de la boutique", error: error.message });
    }
};

/**
 * @desc    Lister toutes les boutiques
 * @route   GET /api/boutiques
 * @access  Private/Admin
 */
exports.getAllBoutiques = async (req, res) => {
    try {
        // Utilisation d'une agrégation pour inclure le nombre d'articles par boutique
        const boutiques = await Boutique.aggregate([
            {
                $lookup: {
                    from: 'articles', // Nom de la collection des articles
                    localField: '_id',
                    foreignField: 'boutique',
                    as: 'articles'
                }
            },
            {
                $addFields: {
                    articleCount: { $size: '$articles' } // Ajoute le champ articleCount
                }
            },
            {
                $project: {
                    articles: 0 // Exclut le tableau complet des articles de la réponse finale
                }
            },
            { $sort: { type: 1, nom: 1 } } // Trie pour mettre la boutique Centrale en premier, puis par nom
        ]);
        res.status(200).json(boutiques);
    } catch (error) {
        res.status(500).json({ message: "Impossible de récupérer les boutiques", error: error.message });
    }
};

/**
 * @desc    Modifier une boutique (nom, adresse, statut actif/inactif)
 * @route   PUT /api/boutiques/:id
 * @access  Private/Admin
 */
exports.updateBoutique = async (req, res) => {
    try {
        // Logique de validation avancée pour le changement de type
        if (req.body.type) {
            const boutiqueToUpdate = await Boutique.findById(req.params.id);
            if (!boutiqueToUpdate) {
                return res.status(404).json({ message: "Boutique introuvable." });
            }

            // Cas 1 : On essaie de passer une boutique en 'Centrale'
            if (req.body.type === 'Centrale' && boutiqueToUpdate.type !== 'Centrale') {
                const centraleExists = await Boutique.findOne({ type: 'Centrale' });
                if (centraleExists) {
                    return res.status(400).json({ message: "Une Boutique Centrale existe déjà. Impossible d'en définir une deuxième." });
                }
            }

            // Cas 2 : On essaie de changer le type de la boutique 'Centrale' actuelle
            if (req.body.type !== 'Centrale' && boutiqueToUpdate.type === 'Centrale') {
                return res.status(400).json({ message: "Le type de la Boutique Centrale ne peut pas être modifié. C'est le pilier du système." });
            }
        }

        const boutique = await Boutique.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!boutique) return res.status(404).json({ message: "Boutique introuvable." });
        res.status(200).json(boutique);
    } catch (error) {
        res.status(400).json({ message: "Erreur lors de la mise à jour", error: error.message });
    }
};

/**
 * @desc    Supprimer une boutique
 * @route   DELETE /api/boutiques/:id
 * @access  Private/Admin
 */
exports.deleteBoutique = async (req, res) => {
    try {
        const boutiqueToDelete = await Boutique.findById(req.params.id);
        if (!boutiqueToDelete) {
            return res.status(404).json({ message: "Boutique introuvable." });
        }

        // On ne peut pas supprimer la boutique centrale
        if (boutiqueToDelete.type === 'Centrale') {
            return res.status(400).json({ message: "La Boutique Centrale ne peut pas être supprimée." });
        }

        // Vérifier s'il reste des articles dans la boutique avant de supprimer
        const articlesCount = await Article.countDocuments({ boutique: req.params.id });
        
        if (articlesCount > 0) {
            return res.status(400).json({ 
                message: `⚠️ Suppression impossible : Cette boutique contient encore ${articlesCount} article(s). Veuillez utiliser le bouton "Transférer Stock" pour déplacer les articles vers une autre boutique avant de la supprimer.` 
            });
        }

        await Boutique.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Boutique supprimée avec succès" });
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la suppression", error: error.message });
    }
};