const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

// Charger les variables d'environnement
dotenv.config();

// Importer les modèles
const User = require('./models/User');
const Boutique = require('./models/Boutique');

// Se connecter à MongoDB
mongoose.connect(process.env.MONGO_URI);

async function seedDatabase() {
  try {
    console.log('--- Initialisation des comptes de haut niveau ---');

    // 1. Création du SuperAdmin (Accès global)
    const saEmail = 'superadmin@example.com';
    let superAdmin = await User.findOne({ email: saEmail });

    if (!superAdmin) {
      const saPassword = 'superadmin123';
      
      superAdmin = new User({
        nom: 'Super Administrateur',
        email: saEmail,
        password: saPassword, // Le modèle User.js s'occupera du hachage automatique
        role: 'SuperAdmin'
      });

      await superAdmin.save();
      console.log(`🚀 SuperAdmin créé : ${saEmail} / ${saPassword}`);
    } else {
      console.log(`ℹ️ Le SuperAdmin (${saEmail}) existe déjà.`);
    }

    // 2. Création du deuxième Admin (Deuxième entreprise)
    const admin2Email = 'admin2@example.com';
    let admin2 = await User.findOne({ email: admin2Email });

    if (!admin2) {
      const admin2Password = 'admin123';
      
      admin2 = new User({
        nom: 'Admin Entreprise B',
        email: admin2Email,
        password: admin2Password, // Le modèle User.js s'occupera du hachage automatique
        role: 'Admin'
      });

      await admin2.save();
      console.log(`✅ Deuxième Admin créé : ${admin2Email} / ${admin2Password}`);
    } else {
      console.log(`ℹ️ Le deuxième Admin (${admin2Email}) existe déjà.`);
    }
    
    // 3. Vérification de l'Admin existant
    const admin1 = await User.findOne({ email: 'admin@example.com' });
    if (admin1) {
      console.log('ℹ️ Admin principal (admin@example.com) est déjà présent.');
    }

    // 4. Assurer que chaque Admin (et SuperAdmin) a un Dépôt Principal
    const adminUsers = [superAdmin, admin1, admin2].filter(Boolean); // Filtrer les null si non créés

    for (const admin of adminUsers) {
        if (admin.role === 'Admin' || admin.role === 'SuperAdmin') {
            let centrale = await Boutique.findOne({ type: 'Centrale', createur: admin._id });
            if (!centrale) {
                centrale = new Boutique({
                    nom: `Dépôt Principal de ${admin.nom}`,
                    adresse: `Siège social de ${admin.nom}`,
                    type: 'Centrale',
                    createur: admin._id,
                    active: true
                });
                await centrale.save();
                console.log(`✅ Dépôt Principal créé pour ${admin.nom} : ${centrale.nom}`);
            } else {
                console.log(`ℹ️ Dépôt Principal (${centrale.nom}) existe déjà pour ${admin.nom}.`);
            }
        }
    }

    // 5. Créer des boutiques secondaires pour l'Admin principal si elles n'existent pas
    // (Pour les tests, on les lie à admin1)
    const existingSecondaryBoutiques = await Boutique.find({ createur: admin1?._id, type: 'Secondaire' });
    if (admin1 && existingSecondaryBoutiques.length === 0) {
        const boutiques = [
          { nom: 'Boutique Centre-ville', adresse: '123 Rue Principale', createur: admin1._id, type: 'Secondaire' },
          { nom: 'Boutique Nord', adresse: '456 Avenue du Nord', createur: admin1._id, type: 'Secondaire' }
        ];

        for (const boutiqueData of boutiques) {
          const boutique = new Boutique(boutiqueData); // Utilise les données avec createur
          await boutique.save();
          console.log(`✅ Boutique créée : ${boutique.nom}`);
        }
    } else if (admin1) {
        console.log(`ℹ️ Boutiques secondaires existent déjà pour ${admin1.nom}.`);
    }

    console.log('\n🎉 Base de données initialisée avec succès !');
    console.log('\nIdentifiants de connexion :');
    console.log('SuperAdmin : superadmin@example.com / superadmin123');
    console.log('Administrateur : admin@example.com / admin123');
    console.log('Gérant 1 : manager1@example.com / manager123');
    console.log('Gérant 2 : manager2@example.com / manager123');

  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation :', error);
  } finally {
    mongoose.connection.close();
  }
}

seedDatabase();