const Article = require('../models/Article');

const articleRepository = {
    // Trouver un article par son ID
    findById: async (id) => {
        return await Article.findById(id);
    },

    // Mettre à jour un article (utile pour le stock)
    update: async (id, data) => {
        return await Article.findByIdAndUpdate(id, data, { new: true });
    },

    // Créer un nouvel article
    create: async (data) => {
        const article = new Article(data);
        return await article.save();
    },

    // Lister tous les articles
    findAll: async () => {
        return await Article.find();
    },

    // Supprimer un article par son ID
    deleteById: async (id) => {
        return await Article.findByIdAndDelete(id);
    }
};

module.exports = articleRepository;
