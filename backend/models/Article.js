const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({
    nom: {
        type: String,
        required: true,
        trim: true
    },
    prixAchat: {
        type: Number,
        required: true,
        min: 0
    },
    prixVente: {
        type: Number,
        required: true,
        min: 0
    },
    quantite: {
        type: Number,
        default: 0,
        min: 0
    },
    boutique: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Boutique',
        required: true
    },
    image: {
        type: String, // Stockage de l'image en Base64
        default: ''
    },
    code: {
        type: String,
        trim: true,
        sparse: true
    },
    // Champ pour la promotion (admin)
    promo: {
        type: Number, // en %
        default: 0
    },
    promoActive: {
        type: Boolean,
        default: false
    },
    dateDebutPromo: Date,
    dateFinPromo: Date,
    // Champ pour la remise ponctuelle (gérant)
    remise: {
        type: Number, // en %
        default: 0
    },// Dans le schéma Article
    remiseEnAttente: {
        valeur: Number,
        clientNom: String,
        gerant: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        dateDemande: Date
    },
    fournisseur: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Fournisseur'
    },
    datePeremption: {
        required :false, 
        type: Date,
    },
    categorie: {
        type: String,
        trim: true,
        default: 'Divers'
    },
    seuilAlerte: {
        type: Number,
        default: 10,
        min: 0
    },
    // Isolation multi-tenant : Admin propriétaire (déduit de la boutique si absent)
    createur: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    }
}, {
    timestamps: true
});

// Injection automatique du createur (Admin) à partir de la boutique rattachée.
// NB : hook asynchrone — sous kareem/Mongoose v6+, le retour de la promesse
// attend la fin du hook ; ne PAS appeler next() (il est undefined pour un hook async).
articleSchema.pre('save', async function () {
    if (!this.createur && this.boutique) {
        try {
            const Boutique = mongoose.model('Boutique');
            const boutique = await Boutique.findById(this.boutique).select('createur').lean();
            if (boutique && boutique.createur) this.createur = boutique.createur;
        } catch (e) { /* on laisse createur vide, la validation d'appartenance reste active */ }
    }
});

// Index unique composé : empêche le même nom dans la même boutique
articleSchema.index({ nom: 1, boutique: 1 }, { unique: true });

// Index unique composé pour le code : permet le même code dans différentes boutiques mais pas dans la même
articleSchema.index({ code: 1, boutique: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Article', articleSchema);