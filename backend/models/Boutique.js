const mongoose = require('mongoose');

const boutiqueSchema = new mongoose.Schema({
    nom: { type: String, required: [true, 'Le nom de la boutique est requis'], unique: true, trim: true },
    adresse: { type: String, required: [true, "L'adresse est requise"] },
    active: { type: Boolean, default: true },
    type: {
        type: String,
        enum: ['Centrale', 'Secondaire'],
        default: 'Secondaire'
    },
    // Géolocalisation (Par défaut : Conakry)
    latitude: { type: Number, default: 9.6412 },
    longitude: { type: Number, default: -13.5784 },
}, {
    timestamps: true // Ajoute createdAt et updatedAt automatiquement
});

module.exports = mongoose.model('Boutique', boutiqueSchema);