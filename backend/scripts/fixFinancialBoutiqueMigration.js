const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Boutique = require('../models/Boutique');
const Client = require('../models/Client');
const User = require('../models/User');

const migrate = async () => {
    try {
        console.log('🚀 Démarrage de la migration de mise en conformité financière...');
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27014/stock-gestion');
        console.log('✅ Connexion MongoDB réussie.');

        // 1. Récupérer la boutique centrale pour le fallback
        const boutiqueCentrale = await Boutique.findOne({ type: 'Centrale' });
        if (!boutiqueCentrale) {
            console.warn('⚠️ Attention : Aucune boutique "Centrale" trouvée. Le fallback utilisera la première boutique disponible.');
        }

        // 2. SYNCHRONISATION BOUTIQUES -> GÉRANTS
        console.log('\n--- Étape 1 : Synchronisation des profils Gérants ---');
        const boutiques = await Boutique.find();
        for (const b of boutiques) {
            if (b.vendeurs && b.vendeurs.length > 0) {
                const result = await User.updateMany(
                    { _id: { $in: b.vendeurs } },
                    { $set: { boutique: b._id } }
                );
                console.log(`✅ Boutique "${b.nom}" : ${result.modifiedCount} gérant(s) synchronisé(s).`);
            }
        }

        // 3. SYNCHRONISATION CLIENTS -> BOUTIQUES
        console.log('\n--- Étape 2 : Réparation des liens Clients-Boutiques ---');
        const clients = await Client.find({ 
            $or: [{ boutique: { $exists: false } }, { boutique: null }] 
        }).populate('createur');

        let clientMigrated = 0;
        for (const client of clients) {
            let targetBoutiqueId = null;

            // Priorité 1 : Boutique du créateur
            if (client.createur && client.createur.boutique) {
                targetBoutiqueId = client.createur.boutique;
            } 
            // Priorité 2 : Boutique Centrale
            else if (boutiqueCentrale) {
                targetBoutiqueId = boutiqueCentrale._id;
            }
            // Priorité 3 : Première boutique trouvée
            else if (boutiques.length > 0) {
                targetBoutiqueId = boutiques[0]._id;
            }

            if (targetBoutiqueId) {
                await Client.updateOne({ _id: client._id }, { $set: { boutique: targetBoutiqueId } });
                clientMigrated++;
            }
        }
        console.log(`✅ ${clientMigrated} client(s) rattaché(s) à une boutique.`);

        // 4. NETTOYAGE DES ANCIENS CHAMPS
        console.log('\n--- Étape 3 : Nettoyage final ---');
        const cleanup = await Boutique.updateMany(
            { vendeur: { $exists: true } },
            { $unset: { vendeur: "" } }
        );
        console.log(`✅ ${cleanup.modifiedCount} ancienne(s) référence(s) "vendeur" supprimée(s).`);

        console.log('\n✨ Migration terminée avec succès ! Le paiement des dettes est maintenant opérationnel.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Erreur critique pendant la migration :', error);
        process.exit(1);
    }
};

migrate();