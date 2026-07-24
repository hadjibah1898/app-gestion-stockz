/**
 * @file db.js
 * @description Configuration de la connexion à MongoDB via Mongoose.
 */

const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        // 1. Détermination intelligente de l'URI selon l'environnement
        const mongoUri = (process.env.NODE_ENV === 'production' ? process.env.MONGO_URI_REMOTE : process.env.MONGO_URI_LOCAL) || process.env.MONGO_URI;
        
        if (!mongoUri) {
            throw new Error("Aucune URI MongoDB n'est définie dans le fichier .env (MONGO_URI_LOCAL, MONGO_URI_REMOTE ou MONGO_URI manquant)");
        }

        // 2. Configuration des écouteurs d'événements globaux (Une seule fois)
        mongoose.connection.on('disconnected', () => {
            console.error('⚠️ MongoDB a perdu la connexion ! Tentative de reconnexion automatique...');
        });

        mongoose.connection.on('reconnected', () => {
            console.log('🔄 MongoDB s\'est reconnecté avec succès.');
        });

        mongoose.connection.on('error', (err) => {
            console.error(`❌ Erreur de runtime MongoDB : ${err.message}`);
        });

        // 3. Tentative de connexion initiale
        const conn = await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 5000, // Évite de bloquer IIS au démarrage (5 secondes max)
            maxPoolSize: 10,                 // Limite le nombre de connexions simultanées
        });

        console.log(`✅ MongoDB connecté avec succès sur : ${conn.connection.host} (${process.env.NODE_ENV === 'production' ? 'Distant' : 'Local'})`);
    } catch (err) {
        console.error("❌ Erreur critique de connexion initiale MongoDB:", err.message);

        // Détection spécifique pour Atlas (Cloud)
        if (err.message.includes('querySrv') || err.message.includes('TIMEOUT')) {
            console.log("💡 ASTUCE ATLAS : Vérifiez le pare-feu du serveur, la Whitelist IP sur Atlas (0.0.0.0/0 si IP dynamique) ou la résolution DNS.");
        } 
        // Détection spécifique pour Local
        else if (err.code === 'ECONNREFUSED') {
            console.log("💡 ASTUCE LOCAL : Assurez-vous que le service MongoDB local est bien démarré.");
            console.log("   👉 Windows : Ouvrez 'Services' et démarrez 'MongoDB Server' (ou tapez 'net start MongoDB' en admin).");
        }

        // Stratégie adaptative selon l'environnement
        if (process.env.NODE_ENV === 'production') {
            console.error("🚨 MODE PRODUCTION : Arrêt immédiat du processus pour forcer IIS / PM2 à redémarrer l'application.");
            process.exit(1); 
        } else {
            console.log("⚠️ MODE DEV : Le serveur reste allumé pour les tests Postman (mode déconnecté).");
        }
    }
};

module.exports = connectDB;