const mongoose = require('mongoose');

const rapportCaisseSchema = new mongoose.Schema({
    ouvertureCaisse: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'OuvertureCaisse',
        required: true,
        unique: true,
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
    fondInitial: {
        type: Number,
        required: true,
    },
    totalVentes: { // Total des ventes enregistrées
        type: Number,
        required: true,
    },
    totalDepensesApprouvees: { // Total des dépenses approuvées
        type: Number,
        required: true,
    },
    soldeTheorique: { // fondInitial + totalVentes - totalDepensesApprouvees
        type: Number,
        required: true,
    },
    montantCloture: { // Montant physique compté par le gérant
        type: Number,
        required: true,
    },
    ecart: { // montantCloture - soldeTheorique
        type: Number,
        required: true,
    },
    statut: {
        type: String,
        enum: ['EN_ATTENTE', 'VALIDE', 'REJETE'],
        default: 'EN_ATTENTE',
    },
    adminValidateur: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    dateValidation: {
        type: Date,
    },
    commentairesGérant: {
        type: String,
    },
    commentairesAdmin: {
        type: String,
    }
}, { timestamps: true });

rapportCaisseSchema.index({ gerant: 1, statut: 1 });

const RapportCaisse = mongoose.model('RapportCaisse', rapportCaisseSchema);
module.exports = RapportCaisse;