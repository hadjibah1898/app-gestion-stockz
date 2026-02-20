const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({
    nom: {
        type: String,
        required: true,
        trim: true
    },
    prixAchat: {
        type: Number,
        required: true,
        min: 0
    },
    prixVente: {
        type: Number,
        required: true,
        min: 0
    },
    quantite: {
        type: Number,
        default: 0,
        min: 0
    },
    boutique: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Boutique',
        required: true
    },
    image: {
        type: String, // Stockage de l'image en Base64
        default: ''
    },
    code: {
        type: String,
        trim: true,
        default: ''
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Article', articleSchema);