const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        // Priorité aux variables spécifiques, sinon repli sur MONGO_URI
        const mongoUri = (process.env.NODE_ENV === 'production' ? process.env.MONGO_URI_REMOTE : process.env.MONGO_URI_LOCAL) || process.env.MONGO_URI;
        
        if (!mongoUri) {
            throw new Error("Aucune URI MongoDB n'est définie dans le fichier .env (MONGO_URI_LOCAL, MONGO_URI_REMOTE ou MONGO_URI manquant)");
        }

        const conn = await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 5000 // Évite de bloquer le démarrage trop longtemps
        });
        console.log(`✅ MongoDB connecté avec succès sur : ${conn.connection.host} (${process.env.NODE_ENV === 'production' ? 'Distant' : 'Local'})`);
    } catch (err) {
        // On affiche l'erreur détaillée pour comprendre le problème DNS/IP
        console.error("❌ Erreur de connexion MongoDB:", err.message);

        // Détection spécifique pour Atlas (Cloud)
        if (err.message.includes('querySrv')) {
            console.log("💡 ASTUCE ATLAS : Vérifiez votre connexion internet et votre Whitelist IP.");
        } 
        // Détection spécifique pour Local (127.0.0.1 ou localhost)
        else if (err.code === 'ECONNREFUSED') {
            console.log("💡 ASTUCE LOCAL : Assurez-vous que le service MongoDB est bien démarré.");
            console.log("   👉 Windows : Ouvrez 'Services' et démarrez 'MongoDB Server' (ou tapez 'net start MongoDB' en admin).");
        }

        console.log("⚠️ Le serveur reste allumé pour les tests Postman (mode déconnecté).");
        
        // COMMENTÉ POUR ÉVITER LE CRASH :
        // process.exit(1); 
    }
};

module.exports = connectDB;