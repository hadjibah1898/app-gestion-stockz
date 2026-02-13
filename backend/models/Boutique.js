const mongoose = require('mongoose');

const boutiqueSchema = new mongoose.Schema({
    nom: { type: String, required: [true, 'Le nom de la boutique est requis'], unique: true },
    adresse: { type: String, required: [true, "L'adresse est requise"] },
    active: { type: Boolean, default: true },
}, {
    timestamps: true // Ajoute createdAt et updatedAt automatiquement
});

module.exports = mongoose.model('Boutique', boutiqueSchema);