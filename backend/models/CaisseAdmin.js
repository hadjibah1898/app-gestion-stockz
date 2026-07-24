const mongoose = require('mongoose');

const historiqueCaisseAdminSchema = new mongoose.Schema({
    rapport: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'RapportCaisse',
        required: false,
    },
    typeMouvement: {
        type: String,
        enum: ['ENTREE', 'SORTIE'],
        default: 'ENTREE'
    },
    description: { 
        type: String,
        required: false
    },
    montant: {
        type: Number,
        required: true,
    },
    dateTransaction: { 
        type: Date, 
        default: Date.now 
    },
    gerant: { type: mongoose.Schema.Types.Mixed },
    boutique: { type: mongoose.Schema.Types.Mixed },
    admin: { type: mongoose.Schema.Types.Mixed }
}, { _id: true });

const caisseAdminSchema = new mongoose.Schema({
    admin: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    soldeActuel: {
        type: Number,
        required: true,
        default: 0,
    },
    historique: [historiqueCaisseAdminSchema]
}, { timestamps: true });

/**
 * Récupère ou crée la caisse centrale pour un admin donné.
 * Chaque admin a sa propre caisse isolée.
 */
caisseAdminSchema.statics.getOrCreateForAdmin = async function(adminId) {
    let instance = await this.findOne({ admin: adminId });
    if (!instance) {
        instance = await this.create({ admin: adminId, soldeActuel: 0, historique: [] });
    }
    return instance;
};

/**
 * Méthode helper pour ajouter un mouvement proprement
 */
caisseAdminSchema.methods.ajouterMouvement = async function(data, options = {}) {
    if (data.typeMouvement === 'ENTREE') {
        this.soldeActuel += data.montant;
    } else {
        this.soldeActuel -= data.montant;
    }
    this.historique.push(data);
    return this.save(options);
};

const CaisseAdmin = mongoose.model('CaisseAdmin', caisseAdminSchema);
module.exports = CaisseAdmin;