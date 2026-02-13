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
    // Vérifier si des utilisateurs existent déjà
    const userCount = await User.countDocuments();
    
    if (userCount > 0) {
      console.log('✅ La base de données contient déjà des utilisateurs');
      console.log('Utilisateurs existants :');
      const users = await User.find().select('nom email role');
      users.forEach(user => {
        console.log(`- ${user.nom} (${user.email}) - Rôle: ${user.role}`);
      });
      return;
    }

    // Créer un administrateur par défaut
    const adminPassword = 'admin123';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    
    const admin = new User({
      nom: 'Administrateur',
      email: 'admin@example.com',
      password: hashedPassword,
      role: 'Admin'
    });

    await admin.save();
    console.log('✅ Administrateur créé avec succès :');
    console.log(`Email: ${admin.email}`);
    console.log(`Mot de passe: ${adminPassword}`);
    console.log(`Rôle: ${admin.role}`);

    // Créer quelques gérants par défaut
    const managers = [
      {
        nom: 'Gérant Centre-ville',
        email: 'manager1@example.com',
        password: await bcrypt.hash('manager123', 10),
        role: 'Gérant'
      },
      {
        nom: 'Gérant Nord',
        email: 'manager2@example.com',
        password: await bcrypt.hash('manager123', 10),
        role: 'Gérant'
      }
    ];

    for (const managerData of managers) {
      const manager = new User(managerData);
      await manager.save();
      console.log(`✅ Gérant créé : ${manager.nom} (${manager.email})`);
    }

    // Créer quelques boutiques par défaut
    const boutiques = [
      {
        nom: 'Boutique Centre-ville',
        adresse: '123 Rue Principale, Centre-ville',
      },
      {
        nom: 'Boutique Nord',
        adresse: '456 Avenue du Nord, Quartier Nord',
      }
    ];

    for (const boutiqueData of boutiques) {
      const boutique = new Boutique(boutiqueData);
      await boutique.save();
      console.log(`✅ Boutique créée : ${boutique.nom}`);
    }

    console.log('\n🎉 Base de données initialisée avec succès !');
    console.log('\nIdentifiants de connexion :');
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