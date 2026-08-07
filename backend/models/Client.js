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
    quartier: {
        type: String,
        trim: true,
        default: '',
    },
    ville: {
        type: String,
        trim: true,
        default: '',
    },
   
    type: {
        type: String,
        enum: ['Client', 'Ouvrier'],
        default: 'Client',
    },
    boutique: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Boutique',
        required: [true, 'La boutique est obligatoire pour associer le client.']
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
        ref: 'User',
        default: null
    },
    dernierModificateur: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true,
});

module.exports = mongoose.model('Client', clientSchema);
