const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const Boutique = require('../models/Boutique');
// On importe le modèle User. Note: Ajustez le chemin si nécessaire
const User = mongoose.model('users', new mongoose.Schema({ 
    nom: String, 
    role: String, 
    boutique: mongoose.Schema.Types.ObjectId 
}));

const migrate = async () => {
    try {
        console.log('Connexion à la base de données...');
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27014/stock-gestion');
        console.log('Connexion réussie.');

        // --- PHASE 1 : Synchronisation depuis les Utilisateurs (Gérants) ---
        console.log('Analyse des gérants pour synchronisation...');
        const gerants = await User.find({ role: 'Gérant', boutique: { $exists: true, $ne: null } });
        console.log(`${gerants.length} gérants trouvés.`);

        for (const gerant of gerants) {
            await Boutique.updateOne(
                { _id: gerant.boutique },
                { $addToSet: { vendeurs: gerant._id } } // $addToSet évite les doublons
            );
            console.log(`Gérant "${gerant.nom}" synchronisé avec sa boutique.`);
        }

        // --- PHASE 2 : Migration des anciens champs "vendeur" sur les Boutiques ---
        // Trouver les boutiques qui ont encore le champ "vendeur"
        const boutiques = await Boutique.find({ vendeur: { $exists: true } });
        console.log(`${boutiques.length} boutiques à migrer trouvées.`);

        let count = 0;
        for (const boutique of boutiques) {
            // Récupérer l'ID de l'ancien gérant (vendeur est stocké en brut dans l'objet car hors schéma)
            const ancienGerantId = boutique.get('vendeur');

            if (ancienGerantId) {
                // S'assurer que vendeurs est un tableau
                if (!Array.isArray(boutique.vendeurs)) {
                    boutique.vendeurs = [];
                }

                // Ajouter l'ID au tableau s'il n'y est pas déjà
                if (!boutique.vendeurs.includes(ancienGerantId)) {
                    boutique.vendeurs.push(ancienGerantId);
                }
            }

            // Supprimer l'ancien champ
            boutique.set('vendeur', undefined);
            
            await boutique.save();
            count++;
            console.log(`[${count}/${boutiques.length}] Boutique "${boutique.nom}" migrée.`);
        }

        console.log('Migration terminée avec succès.');
        process.exit(0);
    } catch (error) {
        console.error('Erreur pendant la migration :', error);
        process.exit(1);
    }
};

migrate();