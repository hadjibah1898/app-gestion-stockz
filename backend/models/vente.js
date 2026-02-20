const mongoose = require('mongoose');

const venteSchema = new mongoose.Schema({
    article: { // Renommé de 'articleId' pour correspondre au service
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Article', 
        required: true 
    },
    quantite: { // Renommé de 'quantiteVendue'
        type: Number, 
        required: true 
    },
    prixTotal: { // Renommé de 'prixTotal' pour la cohérence
        type: Number, 
        required: true 
    },
    gerant: { // Ajout du champ 'gerant' qui est crucial pour savoir qui a fait la vente
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    boutique: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Boutique',
        required: true
    },
    isCancelled: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Vente', venteSchema);
