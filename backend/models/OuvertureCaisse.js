const mongoose = require('mongoose');

const ouvertureCaisseSchema = new mongoose.Schema({
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
        default: 0,
    },
    dateOuverture: {
        type: Date,
        default: Date.now,
    },
    dateFermeture: {
        type: Date,
    },
    statut: {
        type: String,
        enum: ['OUVERTE', 'FERMEE'],
        default: 'OUVERTE',
    },
    rapportGenere: {
        type: Boolean,
        default: false,
    },
    totalDepenses: {
        type: Number,
        default: 0,
    },
}, { timestamps: true });

// Index pour s'assurer qu'un gérant ne peut avoir qu'une seule caisse ouverte à la fois
ouvertureCaisseSchema.index({ gerant: 1, statut: 1 }, { unique: true, partialFilterExpression: { statut: 'OUVERTE' } });

const OuvertureCaisse = mongoose.model('OuvertureCaisse', ouvertureCaisseSchema);
module.exports = OuvertureCaisse;