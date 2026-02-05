const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        // Connexion à MongoDB en utilisant la variable d'environnement
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ MongoDB connecté avec succès !");
    } catch (err) {
        // On affiche l'erreur détaillée pour comprendre le problème DNS/IP
        console.error("❌ Erreur de connexion MongoDB:", err.message);
        console.log("⚠️ Le serveur reste allumé pour les tests Postman (mode déconnecté).");
        
        // COMMENTÉ POUR ÉVITER LE CRASH :
        // process.exit(1); 
    }
};

module.exports = connectDB;