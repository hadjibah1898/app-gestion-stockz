const mongoose = require('mongoose');

const ajustementStockSchema = new mongoose.Schema({
    article: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', required: true },
    boutique: { type: mongoose.Schema.Types.ObjectId, ref: 'Boutique', required: true },
    gerant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    quantite: { type: Number, required: true }, // Quantité à retirer du stock
    raison: { 
        type: String, 
        enum: ['Perte', 'Vol', 'Casse', 'Péremption', 'Erreur Inventaire'], 
        required: true 
    },
    justification: { type: String, required: true }, // Explication textuelle
    imageJustificatif: { type: String }, // Stockage Base64
    statut: { 
        type: String, 
        enum: ['EN_ATTENTE', 'VALIDE', 'REJETE'], 
        default: 'EN_ATTENTE' 
    },
    adminValidateur: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    dateValidation: { type: Date },
    commentaireAdmin: { type: String },
    // Isolation multi-tenant : Admin propriétaire (déduit de la boutique si absent)
    createur: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    }
}, { timestamps: true });

// Injection automatique du createur (Admin) à partir de la boutique rattachée.
// NB : hook asynchrone — ne PAS appeler next() (il est undefined pour un hook async).
ajustementStockSchema.pre('save', async function () {
    if (!this.createur && this.boutique) {
        try {
            const Boutique = mongoose.model('Boutique');
            const boutique = await Boutique.findById(this.boutique).select('createur').lean();
            if (boutique && boutique.createur) this.createur = boutique.createur;
        } catch (e) { /* noop */ }
    }
});

module.exports = mongoose.model('AjustementStock', ajustementStockSchema);