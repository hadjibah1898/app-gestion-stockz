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
    },
    type: {
        type: String,
        trim: true,
        default: 'Divers'
    },
    // Champ pour la promotion (admin)
    promo: {
        type: Number, // en %
        default: 0
    },
    promoActive: {
        type: Boolean,
        default: false
    },
    dateDebutPromo: Date,
    dateFinPromo: Date,
    // Champ pour la remise ponctuelle (gérant)
    remise: {
        type: Number, // en %
        default: 0
    },// Dans le schéma Article
    remiseEnAttente: {
        valeur: Number,
        clientNom: String,
        gerant: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        dateDemande: Date
    },
    fournisseur: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Fournisseur'
    },
    datePeremption: {
        required :false, 
        type: Date,
    
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Article', articleSchema);