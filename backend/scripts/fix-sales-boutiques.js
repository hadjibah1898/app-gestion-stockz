const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// 1. Charger les variables d'environnement
dotenv.config({ path: path.join(__dirname, '../.env') });

// 2. Importer les modèles
const Vente = require('../models/Vente');
const User = require('../models/User');

async function fixSalesData() {
    try {
        console.log('🚀 Démarrage du script de correction des boutiques dans les ventes...');
        
        if (!process.env.MONGO_URI) {
            throw new Error("MONGO_URI n'est pas défini dans le fichier .env");
        }
        
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connexion à MongoDB réussie.');

        // 3. Rechercher les ventes qui n'ont pas de boutique renseignée
        const sales = await Vente.find({
            $or: [
                { boutique: { $exists: false } },
                { boutique: null }
            ]
        });

        console.log(`🔍 ${sales.length} ventes trouvées sans boutique.`);

        let updatedCount = 0;
        let skippedCount = 0;

        for (const sale of sales) {
            // 4. On récupère le gérant qui a effectué la vente
            const gérant = await User.findById(sale.gerant);
            
            if (gérant && gérant.boutique) {
                sale.boutique = gérant.boutique;
                await sale.save();
                updatedCount++;
                if (updatedCount % 50 === 0) console.log(`⏳ Progression : ${updatedCount} ventes mises à jour...`);
            } else {
                // Cas où le gérant n'est plus en base ou n'a pas de boutique rattachée
                skippedCount++;
            }
        }

        console.log('\n--- BILAN ---');
        console.log(`✅ Mise à jour terminée : ${updatedCount} ventes corrigées.`);
        if (skippedCount > 0) {
            console.log(`⚠️ ${skippedCount} ventes ignorées (gérant introuvable ou sans boutique rattachée).`);
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Erreur critique lors de la migration des ventes :', error.message);
        process.exit(1);
    }
}

fixSalesData();