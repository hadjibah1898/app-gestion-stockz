const mongoose = require('mongoose');

const rapportCaisseSchema = new mongoose.Schema({
    ouvertureCaisse: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'OuvertureCaisse',
        required: true,
        unique: true, // Un seul rapport par session de caisse
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
    totalVentes: { 
        type: Number, // Total des ventes de la session (CA brut)
        required: true,
        default: 0
    },
    totalMobileMoney: { 
        type: Number, // Somme des paiements via Orange Money/MobiCash/PayCard
        required: true,
        default: 0
    },
    totalMobileMoneyRecoveries: { 
        type: Number, // Part des recouvrements de dettes reçue par OM/MobiCash
        required: true,
        default: 0
    },
    totalDettes: { 
        type: Number, // Crédits accordés aux clients durant la session
        required: true,
        default: 0
    },
    totalRecouvrement: { 
        type: Number, // Somme des dettes payées par les clients (DebtPayment)
        required: true,
        default: 0
    },
    totalDepensesApprouvees: { 
        type: Number, 
        required: true,
        default: 0
    },
    /**
     * FORMULE : 
     * soldeTheorique = (fondInitial + totalVentes + totalRecouvrements) - totalDepenses
     */
    soldeTheorique: { 
        type: Number, 
        required: true,
    },
    montantCloture: { 
        type: Number, // Montant réel en liquide déclaré par le gérant
        required: true,
    },
    ecart: { 
        type: Number, // montantCloture - soldeTheorique
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
    commentairesGérant: { type: String },
    commentairesAdmin: { type: String },
}, { timestamps: true });

// Index pour accélérer les recherches de l'admin
rapportCaisseSchema.index({ gerant: 1, statut: 1 });
rapportCaisseSchema.index({ boutique: 1, createdAt: -1 });

const RapportCaisse = mongoose.model('RapportCaisse', rapportCaisseSchema);
module.exports = RapportCaisse;
