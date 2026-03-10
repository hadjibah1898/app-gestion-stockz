const mongoose = require('mongoose');

const depenseSchema = new mongoose.Schema({
    ouvertureCaisse: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'OuvertureCaisse',
        required: true,
    },
    gerant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    boutique: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Boutique',
        required: true,
    },
    montant: {
        type: Number,
        required: true,
    },
    motif: {
        type: String,
        required: true,
    },
    justificatif: { // URL vers une image/fichier uploadé
        type: String,
    },
    statut: {
        type: String,
        default: 'VALIDEE', // Les dépenses sont validées directement si les fonds sont suffisants
    }
}, { timestamps: true });

const Depense = mongoose.model('Depense', depenseSchema);
module.exports = Depense;