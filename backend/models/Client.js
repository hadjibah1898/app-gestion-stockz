const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
    nom: {
        type: String,
        required: [true, 'Le nom du client est obligatoire.'],
        trim: true,
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
    },
    telephone: {
        type: String,
        trim: true,
    },
    adresse: {
        type: String,
        trim: true,
    },
    photo: {
        type: String, // Stockage en Base64
        default: ''
    },
    type: {
        type: String,
        enum: ['Client', 'Ouvrier'],
        default: 'Client',
    },
    dette: {
        type: Number,
        default: 0,
    },
    echeanceDette: {
        type: Date,
        required: false,
    },
    commission: {
        type: Number,
        default: 0,
    },
    totalAchats: {
        type: Number,
        default: 0,
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('Client', clientSchema);