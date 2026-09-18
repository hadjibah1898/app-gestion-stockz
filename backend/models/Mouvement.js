const mongoose = require('mongoose');

const mouvementSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['Approvisionnement', 'Transfert', 'Vente', 'Annulation Vente', 'Modification Prix', 'Reception Transfert', 'Ajustement Stock'],
        required: true
    },
    details: { type: String }, // Ex: "Réapprovisionnement", "Retour marchandise", "Vente #123"
    boutiqueSource: { type: mongoose.Schema.Types.ObjectId, ref: 'Boutique' },
    boutiqueDestination: { type: mongoose.Schema.Types.ObjectId, ref: 'Boutique' },
    fournisseur: { type: mongoose.Schema.Types.ObjectId, ref: 'Fournisseur' },
    articles: [{
        articleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Article' },
        nomArticle: { type: String, required: true },
        quantite: { type: Number, required: true },
        prixAchatUnitaire: { type: Number },
        prixVenteUnitaire: { type: Number }
    }],
    statutTransfert: {
        type: String,
        enum: ['EXPEDIE', 'RECU', 'ANNULE', 'REJETE', 'LIVRAISON_PARTIELLE', 'SANS_OBJET'],
        default: 'SANS_OBJET'
    },
    operateur: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    nomTransporteur: { type: String },
    isCancelled: { type: Boolean, default: false },
    // Isolation multi-tenant : Admin propriétaire (déduit de la boutique si absent)
    createur: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    }
}, { timestamps: true });

// Injection automatique du createur (Admin) à partir de la boutique rattachée.
// NB : hook asynchrone — ne PAS appeler next() (il est undefined pour un hook async).
mouvementSchema.pre('save', async function () {
    if (!this.createur) {
        const Boutique = mongoose.model('Boutique');
        const bId = this.boutiqueSource || this.boutiqueDestination;
        if (bId) {
            try {
                const boutique = await Boutique.findById(bId).select('createur').lean();
                if (boutique && boutique.createur) this.createur = boutique.createur;
            } catch (e) { /* noop */ }
        }
    }
});

module.exports = mongoose.model('Mouvement', mouvementSchema);