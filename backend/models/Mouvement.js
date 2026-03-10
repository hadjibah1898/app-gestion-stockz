const mongoose = require('mongoose');

const mouvementSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['Approvisionnement', 'Transfert', 'Vente', 'Annulation Vente', 'Modification Prix'],
        required: true
    },
    details: { type: String }, // Ex: "Réapprovisionnement", "Retour marchandise", "Vente #123"
    boutiqueSource: { type: mongoose.Schema.Types.ObjectId, ref: 'Boutique' },
    boutiqueDestination: { type: mongoose.Schema.Types.ObjectId, ref: 'Boutique' },
    fournisseur: { type: mongoose.Schema.Types.ObjectId, ref: 'Fournisseur' },
    articles: [{
        nomArticle: { type: String, required: true },
        quantite: { type: Number, required: true }
    }],
    operateur: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    isCancelled: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Mouvement', mouvementSchema);