const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); // Chemin absolu vers le .env du backend
const mongoose = require('mongoose');
const User = require('../models/User'); // Assurez-vous que le chemin est correct

const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'superadmin@example.com';
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'SuperAdmin@2024';
const SUPERADMIN_NOM = process.env.SUPERADMIN_NOM || 'Super Administrateur';

// Modification ici : Ajout de process.env.MONGO_URI en repli pour accepter votre configuration actuelle
const MONGO_URI = process.env.MONGO_URI_REMOTE || process.env.MONGO_URI_LOCAL || process.env.MONGO_URI;

const createSuperAdmin = async () => {
    try {
        if (!MONGO_URI) {
            throw new Error("La variable de connexion (MONGO_URI, MONGO_URI_REMOTE ou MONGO_URI_LOCAL) est manquante dans le fichier .env");
        }

        // Connexion simplifiée (les options obsolètes ont été retirées pour Mongoose v6+)
        await mongoose.connect(MONGO_URI);
        console.log('Connexion à la base de données réussie.');

        // Vérifier si un SuperAdmin existe déjà
        const existingSuperAdmin = await User.findOne({ role: 'SuperAdmin' });
        if (existingSuperAdmin) {
            console.log('Un SuperAdmin existe déjà:', existingSuperAdmin.email);
            return; // Le bloc 'finally' s'occupera de la déconnexion
        }

        // Vérifier si un utilisateur avec l'email SuperAdmin existe déjà mais n'est pas SuperAdmin
        const existingUserWithEmail = await User.findOne({ email: SUPERADMIN_EMAIL });
        if (existingUserWithEmail) {
            console.log(`Un utilisateur avec l'email ${SUPERADMIN_EMAIL} existe déjà. Mise à jour de son rôle en SuperAdmin.`);
            existingUserWithEmail.role = 'SuperAdmin';
            existingUserWithEmail.password = SUPERADMIN_PASSWORD; // Mettre à jour le mot de passe également
            existingUserWithEmail.active = true;
            existingUserWithEmail.mustChangePassword = false;
            await existingUserWithEmail.save();
            console.log('Utilisateur mis à jour en SuperAdmin avec succès.');
            return;
        }

        // Créer le SuperAdmin
        const superAdmin = new User({
            nom: SUPERADMIN_NOM,
            email: SUPERADMIN_EMAIL,
            password: SUPERADMIN_PASSWORD, // Le pre-save hook du modèle hashira le mot de passe
            role: 'SuperAdmin',
            active: true, // SuperAdmin est toujours actif
            mustChangePassword: false, // Pas besoin de changer le mot de passe au premier login pour un SuperAdmin
        });
        await superAdmin.save();
        console.log('SuperAdmin créé avec succès:', superAdmin.email);
    } catch (error) {
        console.error('Erreur lors de la création du SuperAdmin:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Déconnexion de la base de données.');
    }
};

createSuperAdmin();