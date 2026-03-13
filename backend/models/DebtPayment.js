const mongoose = require('mongoose');

const debtPaymentSchema = new mongoose.Schema({
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
    montant: { type: Number, required: true },
    datePaiement: { type: Date, default: Date.now },
    gerant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    boutique: { type: mongoose.Schema.Types.ObjectId, ref: 'Boutique', required: true },
    statut: {
        type: String,
        enum: ['EN_ATTENTE', 'VALIDEE', 'REJETEE'],
        default: 'EN_ATTENTE'
    },
    adminValidateur: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    dateValidation: { type: Date }
}, { timestamps: true });

const DebtPayment = mongoose.model('DebtPayment', debtPaymentSchema);

module.exports = DebtPayment;