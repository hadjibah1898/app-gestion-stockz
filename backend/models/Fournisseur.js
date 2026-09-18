const mongoose = require('mongoose');

const fournisseurSchema = new mongoose.Schema({
    nom: { 
        type: String, 
        required: [true, 'Le nom du fournisseur est requis'], 
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
    }],
    createur: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Unicité par créateur (par boutique) : même nom autorisé entre boutiques différentes
fournisseurSchema.index({ nom: 1, createur: 1 }, { unique: true });

module.exports = mongoose.model('Fournisseur', fournisseurSchema);
