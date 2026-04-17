const mongoose = require('mongoose');

const debtMovementSchema = new mongoose.Schema({
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
    type: { type: String, enum: ['CREATION', 'REMBOURSEMENT', 'ANNULATION'], required: true },
    montant: { type: Number, required: true },
    soldeAnterieur: { type: Number, required: true },
    nouveauSolde: { type: Number, required: true },
    venteAssociee: { type: mongoose.Schema.Types.ObjectId, ref: 'Vente' },
    boutique: { type: mongoose.Schema.Types.ObjectId, ref: 'Boutique' },
    operateur: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

debtMovementSchema.index({ client: 1, createdAt: -1 });
debtMovementSchema.index({ boutique: 1, createdAt: 1 });

const DebtMovement = mongoose.model('DebtMovement', debtMovementSchema);

module.exports = DebtMovement;