const mongoose = require('mongoose');

const historiqueCaisseAdminSchema = new mongoose.Schema({
    rapport: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'RapportCaisse',
        required: false, // Rendu optionnel pour d'autres types d'entrées
    },
    description: { // Description de la transaction pour plus de clarté
        type: String,
    },
    montant: {
        type: Number,
        required: true,
    },
    dateValidation: {
        type: Date,
        required: true,
    },
    gerant: {
        type: String,
        required: true,
    },
    boutique: {
        type: String,
        required: true,
    },
    admin: {
        type: String,
        required: true,
    }
}, { _id: false });

const caisseAdminSchema = new mongoose.Schema({
    soldeActuel: {
        type: Number,
        required: true,
        default: 0,
    },
    historique: [historiqueCaisseAdminSchema]
}, { timestamps: true });

// Utilisation d'un singleton pattern pour s'assurer qu'il n'y a qu'une seule caisse admin
caisseAdminSchema.statics.getInstance = async function() {
    let instance = await this.findOne();
    if (!instance) {
        instance = await this.create({});
    }
    return instance;
};

const CaisseAdmin = mongoose.model('CaisseAdmin', caisseAdminSchema);
module.exports = CaisseAdmin;