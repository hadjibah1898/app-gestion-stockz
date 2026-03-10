const mongoose = require('mongoose');

const debtMovementSchema = new mongoose.Schema({
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
    type: { type: String, enum: ['CREATION', 'REMBOURSEMENT'], required: true },
    montant: { type: Number, required: true },
    soldeAnterieur: { type: Number, required: true },
    nouveauSolde: { type: Number, required: true },
    venteAssociee: { type: mongoose.Schema.Types.ObjectId, ref: 'Vente' },
    operateur: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

debtMovementSchema.index({ client: 1, createdAt: -1 });

const DebtMovement = mongoose.model('DebtMovement', debtMovementSchema);

module.exports = DebtMovement;