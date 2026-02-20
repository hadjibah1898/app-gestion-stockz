const mongoose = require('mongoose');

const fournisseurSchema = new mongoose.Schema({
    nom: { 
        type: String, 
        required: [true, 'Le nom du fournisseur est requis'], 
        unique: true, 
        trim: true 
    },
    telephone: { 
        type: String, 
        required: [true, 'Le numéro de téléphone est requis'] 
    },
    email: { 
        type: String, 
        trim: true 
    },
    // Liste des noms de produits que ce fournisseur propose habituellement
    produitsProposes: [{
        type: String,
        trim: true
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('Fournisseur', fournisseurSchema);