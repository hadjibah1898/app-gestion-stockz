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
        unique: true, // Assure l'unicité de l'email
        sparse: true, // Permet d'avoir plusieurs clients sans email (null/undefined)
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
    tauxCommission: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    totalAchats: {
        type: Number,
        default: 0,
    },
    createur: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true,
});

module.exports = mongoose.model('Client', clientSchema);