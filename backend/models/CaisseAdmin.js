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
        required: false // Rendu optionnel pour les anciens enregistrements
    },
    montant: {
        type: Number,
        required: true,
    },
    dateTransaction: { 
        type: Date, 
        default: Date.now 
    },
    // Changement en Mixed pour accepter les noms (anciens) et les IDs (nouveaux)
    gerant: { type: mongoose.Schema.Types.Mixed },
    boutique: { type: mongoose.Schema.Types.Mixed },
    admin: { type: mongoose.Schema.Types.Mixed }
}, { _id: true }); // On garde l'ID pour pouvoir identifier une transaction précise

const caisseAdminSchema = new mongoose.Schema({
    soldeActuel: {
        type: Number,
        required: true,
        default: 0,
    },
    historique: [historiqueCaisseAdminSchema]
}, { timestamps: true });

const CAISSE_ADMIN_SINGLETON_ID = new mongoose.Types.ObjectId('60c728b2f9b1c6a7e8d9f0a1');

/**
 * Pattern Singleton optimisé : 
 * Garantit qu'un seul document de caisse centrale existe.
 */
caisseAdminSchema.statics.getInstance = async function() {
    let instance = await this.findById(CAISSE_ADMIN_SINGLETON_ID);
    if (!instance) {
        instance = await this.findOneAndUpdate(
            { _id: CAISSE_ADMIN_SINGLETON_ID }, 
            { $setOnInsert: { soldeActuel: 0, historique: [] } },
            { upsert: true, new: true }
        );
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