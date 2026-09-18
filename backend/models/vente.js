const mongoose = require('mongoose');

const venteSchema = new mongoose.Schema({
    article: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', required: true },
    quantite: { type: Number, required: true },
    prixTotal: { type: Number, required: true },
    gerant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    boutique: { type: mongoose.Schema.Types.ObjectId, ref: 'Boutique' },
    ouvertureCaisse: { type: mongoose.Schema.Types.ObjectId, ref: 'OuvertureCaisse' }, // Lien vers la session de caisse
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
    statut: { 
        type: String, 
        enum: ['commande', 'en_preparation', 'finalisee', 'annulee'], 
        default: 'finalisee'
    },
    isCancelled: { type: Boolean, default: false },
    remiseAppliquee: { type: Number, default: 0 },
    remiseType: { type: String, enum: ['montant', 'pourcentage'], default: 'montant' }, // Nouveau champ
    modePaiement: { type: String, default: 'Cash' },
    transactionRef: { type: String },
    numeroFacture: { type: String },
    pourboire: { type: Number, default: 0 },
    numeroTable: { type: String },
    isSynced: { type: Boolean, default: false },
    syncedAt: { type: Date },
    // Isolation multi-tenant : Admin propriétaire (déduit de la boutique si absent)
    createur: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    }
}, { timestamps: true });

// Injection automatique du createur (Admin) à partir de la boutique rattachée.
// NB : hook asynchrone — ne PAS appeler next() (il est undefined pour un hook async).
venteSchema.pre('save', async function () {
    if (!this.createur && this.boutique) {
        try {
            const Boutique = mongoose.model('Boutique');
            const boutique = await Boutique.findById(this.boutique).select('createur').lean();
            if (boutique && boutique.createur) this.createur = boutique.createur;
        } catch (e) { /* noop */ }
    }
});

module.exports = mongoose.model('Vente', venteSchema);