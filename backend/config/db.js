const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        // Connexion à MongoDB en utilisant la variable d'environnement
        // La chaîne de connexion doit être dans un fichier .env 
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`✅ MongoDB connecté avec succès sur : ${conn.connection.host}`);
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