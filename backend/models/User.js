const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    nom: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { 
        type: String, 
        enum: ['Admin', 'Gérant'], 
        default: 'Gérant' // Par défaut, un nouvel inscrit est gérant [cite: 22]
    },
    boutique: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Boutique' // Liaison avec la boutique du gérant [cite: 38]
    }
}, { timestamps: true });

// Hashage du mot de passe avant sauvegarde [cite: 16]
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
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