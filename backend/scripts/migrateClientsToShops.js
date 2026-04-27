const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Client = require('../models/Client');
const User = require('../models/User');
const Boutique = require('../models/Boutique');

const migrateClients = async () => {
    try {
        console.log('🚀 Démarrage de la migration des clients...');
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27014/stock-gestion');
        console.log('✅ Connexion à MongoDB réussie.');

        // 1. Récupérer tous les clients sans boutique
        const clients = await Client.find({ 
            $or: [
                { boutique: { $exists: false } }, 
                { boutique: null }
            ] 
        }).populate('createur');

        console.log(`🔍 ${clients.length} clients à migrer trouvés.`);

        // Récupérer la boutique centrale par défaut au cas où le créateur n'en a pas (Admin)
        const boutiqueCentrale = await Boutique.findOne({ type: 'Centrale' });

        let successCount = 0;
        let skipCount = 0;

        for (const client of clients) {
            let targetBoutiqueId = null;

            if (client.createur && client.createur.boutique) {
                targetBoutiqueId = client.createur.boutique;
            } else if (boutiqueCentrale) {
                targetBoutiqueId = boutiqueCentrale._id;
            }

            if (targetBoutiqueId) {
                client.boutique = targetBoutiqueId;
                // On utilise validateBeforeSave: false car certains anciens clients 
                // pourraient avoir des emails en double (avant l'ajout des contraintes)
                await client.save({ validateBeforeSave: false });
                successCount++;
                console.log(`✅ Client "${client.nom}" lié à la boutique.`);
            } else {
                skipCount++;
                console.log(`⚠️ Impossible de lier le client "${client.nom}" (Pas de créateur ni de dépôt central).`);
            }
        }

        console.log('\n--- RÉSULTAT ---');
        console.log(`✅ Migrés avec succès : ${successCount}`);
        console.log(`⚠️ Ignorés : ${skipCount}`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Erreur critique pendant la migration :', error);
        process.exit(1);
    }
};

migrateClients();