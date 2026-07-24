require('dotenv').config();
const connectDB = require('./config/db');
const User = require('./models/User');
const Boutique = require('./models/Boutique');
const mongoose = require('mongoose');

const seedNewOrg = async () => {
  try {
    // Connexion à la base de données
    await connectDB();

    // 1. Création ou récupération de l'Admin
    let newAdmin = await User.findOne({ email: "admin.sud@test.com" });
    if (!newAdmin) {
      newAdmin = await User.create({
        nom: "Jean Admin",
        email: "admin.sud@test.com",
        password: "password123", // Le modèle hachera le mot de passe via pre-save
        role: "Admin",
        mustChangePassword: false
      });
      console.log("Admin 'Jean Admin' créé.");
    } else {
      console.log("Admin 'Jean Admin' existe déjà, utilisation du compte existant.");
    }

    // 2. Création ou récupération de la Boutique Centrale
    let centrale = await Boutique.findOne({ codeBoutique: "DCS" });
    if (!centrale) {
      centrale = await Boutique.create({
        nom: "Dépôt Central Sud",
        adresse: "Quartier Kaloum, Conakry",
        type: "Centrale",
        codeBoutique: "DCS", // Préfixe unique pour les codes articles
        secteur: "Général",
        createur: newAdmin._id,
        active: true
      });
      console.log("Boutique 'Dépôt Central Sud' créée.");
    } else {
      console.log("Boutique 'Dépôt Central Sud' existe déjà, utilisation de la boutique existante.");
      // Mettre à jour le créateur si l'admin a été recréé ou modifié
      if (centrale.createur.toString() !== newAdmin._id.toString()) {
          centrale.createur = newAdmin._id;
          await centrale.save();
          console.log("Boutique 'Dépôt Central Sud' mise à jour avec le nouvel Admin.");
      }
    }

    // 3. Création des 2 Gérants
    const gerantsData = [
      {
        nom: "Gérant Alpha",
        email: "gerant.a@test.com",
        password: "password123",
        role: "Gérant",
        boutique: centrale._id,
        createur: newAdmin._id,
        mustChangePassword: false // Ajout pour éviter la modale de changement de mot de passe à chaque connexion de test
      },
      {
        nom: "Gérant Beta",
        email: "gerant.b@test.com",
        password: "password123",
        role: "Gérant",
        boutique: centrale._id,
        createur: newAdmin._id,
        mustChangePassword: false
      }
    ];

    for (const data of gerantsData) {
      let gerant = await User.findOne({ email: data.email });
      if (!gerant) {
        await User.create(data);
        console.log(`Gérant '${data.nom}' créé.`);
      } else {
        console.log(`Gérant '${data.nom}' existe déjà, utilisation du compte existant.`);
        // Optionnel: Mettre à jour le gérant existant si des propriétés ont changé
        if (gerant.boutique.toString() !== data.boutique.toString() || gerant.createur.toString() !== data.createur.toString() || gerant.nom !== data.nom) {
            Object.assign(gerant, data);
            await gerant.save();
            console.log(`Gérant '${data.nom}' mis à jour.`);
        }
      }
    }

    // 4. Création des 2 Serveurs
    const serveursData = [
      {
        nom: "Serveur 1",
        email: "serveur1@test.com",
        password: "password123",
        role: "Serveur",
        boutique: centrale._id,
        createur: newAdmin._id,
        mustChangePassword: false
      },
      {
        nom: "Serveur 2",
        email: "serveur2@test.com",
        password: "password123",
        role: "Serveur",
        boutique: centrale._id,
        createur: newAdmin._id,
        mustChangePassword: false
      }
    ];

    for (const data of serveursData) {
      let serveur = await User.findOne({ email: data.email });
      if (!serveur) {
        await User.create(data);
        console.log(`Serveur '${data.nom}' créé.`);
      } else {
        console.log(`Serveur '${data.nom}' existe déjà, utilisation du compte existant.`);
        // Optionnel: Mettre à jour le serveur existant si des propriétés ont changé
        if (serveur.boutique.toString() !== data.boutique.toString() || serveur.createur.toString() !== data.createur.toString() || serveur.nom !== data.nom) {
            Object.assign(serveur, data);
            await serveur.save();
            console.log(`Serveur '${data.nom}' mis à jour.`);
        }
      }
    }

    console.log("Organisation créée avec succès !");
    process.exit(0); // Sortie propre
  } catch (err) {
    console.error("Erreur lors de la création :", err);
    process.exit(1); // Sortie avec erreur
  }
};

// Exécution du script
seedNewOrg();
