const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    nom: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    telephone: { type: String, required: false }, // Nouveau champ téléphone
    businessType: { // Pour stocker le type de compte choisi à l'inscription
        type: String,
        enum: ['Marchand', 'Bar'],
    },
    password: { type: String, required: true },
    role: { 
        type: String, 
        enum: ['Admin', 'Gérant', 'Caissier',               // Type Marchand
               'AdminBar', 'GérantBar', 'ServeurBar',        // Type Bar
               'SuperAdmin'], 
        default: 'Gérant'
    },
    typeCompte: { // Nouveau champ : Marchand ou Bar
        type: String,
        enum: ['Marchand', 'Bar'],
        default: 'Marchand'
    },
    boutique: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Boutique' // Liaison avec la boutique du gérant [cite: 38]
    },
    createur: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User' // L'Admin qui a créé ce compte
    },
    active: {
        type: Boolean,
        default: false // Par défaut, le compte est inactif en attente de validation SuperAdmin
    },
    deleted: {
        type: Boolean,
        default: false
    },
    mustChangePassword: {
        type: Boolean,
        default: false
    },
    lastLogin: {
        type: Date,
        default: null
    },
    isSynced: {
        type: Boolean,
        default: false
    },
    syncedAt: {
        type: Date,
        default: null
    },
}, { timestamps: true });

// Hashage du mot de passe avant sauvegarde [cite: 16]
userSchema.pre('save', async function() {
    if (!this.isModified('password')) return;
    this.password = await bcrypt.hash(this.password, 10);
});

// Méthode pour comparer les mots de passe lors de la connexion [cite: 28]
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Transformation de l'objet User avant de l'envoyer en JSON
userSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.password; // On ne renvoie jamais le hash du mot de passe
        return ret;
    }
});

module.exports = mongoose.model('User', userSchema);