const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// 1. Charger les variables d'environnement (le .env est à la racine du dossier backend)
dotenv.config({ path: path.join(__dirname, '../.env') });

// 2. Importer les modèles
const DebtMovement = require('../models/DebtMovement');
const Client = require('../models/Client');

async function fixHistoricalData() {
    try {
        console.log('🚀 Démarrage du script de correction des dettes...');
        
        if (!process.env.MONGO_URI) {
            throw new Error("MONGO_URI n'est pas défini dans le fichier .env");
        }
        
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connexion à MongoDB réussie.');

        // 3. Rechercher les mouvements de dette qui n'ont pas de boutique
        const movements = await DebtMovement.find({
            $or: [
                { boutique: { $exists: false } },
                { boutique: null }
            ]
        });

        console.log(`🔍 ${movements.length} mouvements anciens trouvés sans boutique.`);

        let updatedCount = 0;
        let skippedCount = 0;

        for (const mvt of movements) {
            // 4. On récupère la boutique rattachée au client du mouvement
            const client = await Client.findById(mvt.client);
            
            if (client && client.boutique) {
                mvt.boutique = client.boutique;
                await mvt.save();
                updatedCount++;
                if (updatedCount % 10 === 0) console.log(`⏳ Progression : ${updatedCount} mis à jour...`);
            } else {
                // Cas où le client a été supprimé ou n'a pas de boutique assignée
                skippedCount++;
            }
        }

        console.log('\n--- BILAN ---');
        console.log(`✅ Mise à jour terminée : ${updatedCount} mouvements corrigés.`);
        if (skippedCount > 0) {
            console.log(`⚠️ ${skippedCount} mouvements ignorés (client introuvable ou sans boutique).`);
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Erreur critique lors de la migration :', error.message);
        process.exit(1);
    }
}

fixHistoricalData();