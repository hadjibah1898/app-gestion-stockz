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
    // Utile pour le calcul rapide du solde théorique
    totalDepenses: {
        type: Number,
        default: 0,
    },
    // NOUVEAU : Cumul des dettes encaissées durant cette session
    totalRecouvrements: {
        type: Number,
        default: 0,
    }
}, { timestamps: true });

// Index de sécurité (Excellent choix de ta part)
ouvertureCaisseSchema.index(
    { gerant: 1, statut: 1 }, 
    { unique: true, partialFilterExpression: { statut: 'OUVERTE' } }
);

const OuvertureCaisse = mongoose.model('OuvertureCaisse', ouvertureCaisseSchema);
module.exports = OuvertureCaisse;