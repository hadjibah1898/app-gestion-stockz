const Boutique = require('../models/Boutique');
const Article = require('../models/Article');

/**
 * @desc    Créer une boutique
 * @route   POST /api/boutiques
 * @access  Private/Admin
 */
exports.createBoutique = async (req, res) => {
    try {
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
        const boutiques = await Boutique.find();
        res.status(200).json(boutiques);
    } catch (error) {
        res.status(500).json({ message: "Impossible de récupérer les boutiques" });
    }
};

/**
 * @desc    Modifier une boutique (nom, adresse, statut actif/inactif)
 * @route   PUT /api/boutiques/:id
 * @access  Private/Admin
 */
exports.updateBoutique = async (req, res) => {
    try {
        const boutique = await Boutique.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!boutique) return res.status(404).json({ message: "Boutique introuvable" });
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
        // Vérifier s'il reste des articles dans la boutique avant de supprimer
        const articlesCount = await Article.countDocuments({ boutique: req.params.id });
        
        if (articlesCount > 0) {
            return res.status(400).json({ 
                message: `Impossible de supprimer cette boutique : elle contient encore ${articlesCount} article(s). Veuillez transférer ou vider le stock avant.` 
            });
        }

        await Boutique.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Boutique supprimée avec succès" });
    } catch (error) {
        res.status(500).json({ message: "Erreur lors de la suppression", error: error.message });
    }
};