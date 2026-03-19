const mongoose = require('mongoose');

const debtPaymentSchema = new mongoose.Schema({
    // Référence au client concerné par la dette
    client: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Client', 
        required: true 
    },

    // Le montant versé (utilisé pour les calculs de caisse)
    montant: { 
        type: Number, 
        required: true 
    },

    // Date du versement effectif (par défaut : maintenant)
    datePaiement: { 
        type: Date, 
        default: Date.now, 
        required: true 
    },

    // Le gérant/vendeur qui a encaissé l'argent
    gerant: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },

    // La boutique où la transaction a eu lieu
    boutique: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Boutique', 
        required: true 
    },

    // Cycle de vie du paiement
    statut: {
        type: String,
        enum: ['EN_ATTENTE', 'VALIDEE', 'REJETEE'],
        default: 'EN_ATTENTE'
    },

    // Informations de validation (Admin uniquement)
    adminValidateur: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User' 
    },

    dateValidation: { 
        type: Date 
    }

}, { 
    // Ajoute automatiquement createdAt et updatedAt
    timestamps: true 
});

const DebtPayment = mongoose.model('DebtPayment', debtPaymentSchema);

module.exports = DebtPayment;