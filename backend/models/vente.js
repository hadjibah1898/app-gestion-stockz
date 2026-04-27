const mongoose = require('mongoose');

const venteSchema = new mongoose.Schema({
    article: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', required: true },
    quantite: { type: Number, required: true },
    prixTotal: { type: Number, required: true },
    gerant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    boutique: { type: mongoose.Schema.Types.ObjectId, ref: 'Boutique' },
    ouvertureCaisse: { type: mongoose.Schema.Types.ObjectId, ref: 'OuvertureCaisse' }, // Lien vers la session de caisse
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
    statut: { 
        type: String, 
        enum: ['finalisee', 'en_attente_remise', 'refusee'], 
        default: 'finalisee' 
    },
    isCancelled: { type: Boolean, default: false },
    remiseAppliquee: { type: Number, default: 0 },
    remiseType: { type: String, enum: ['montant', 'pourcentage'], default: 'montant' } // Nouveau champ
}, { timestamps: true });

module.exports = mongoose.model('Vente', venteSchema);