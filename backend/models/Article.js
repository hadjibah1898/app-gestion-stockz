const mongoose = require('mongoose');


const articleSchema = new mongoose.Schema({
    nom: { 
        type: String, 
        required: [true, "Le nom de l'article est obligatoire"] 
    },
    prixAchat: { 
        type: Number, 
        required: true 
    },
    prixVente: { 
        type: Number, 
        required: true 
    },
    quantite: { 
        type: Number, 
        default: 0 
    },
    boutique: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Boutique',
        required: true
    }
    
}, { 
    timestamps: true // Ajoute automatiquement createdAt et updatedAt
});

module.exports = mongoose.model('Article', articleSchema);