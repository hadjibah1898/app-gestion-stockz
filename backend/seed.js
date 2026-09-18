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
        ville: "Conakry",
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

    // 3. Création ou récupération de la Boutique Bar
    let bar = await Boutique.findOne({ codeBoutique: "BAR" });
    if (!bar) {
      bar = await Boutique.create({
        nom: "Bar Central",
        adresse: "Quartier Kaloum, Conakry",
        ville: "Conakry",
        type: "Bar",
        codeBoutique: "BAR",
        secteur: "Bar",
        createur: newAdmin._id,
        active: true
      });
      console.log("Boutique 'Bar Central' créée.");
    } else {
      console.log("Boutique 'Bar Central' existe déjà, utilisation de la boutique existante.");
      if (bar.createur.toString() !== newAdmin._id.toString()) {
          bar.createur = newAdmin._id;
          await bar.save();
          console.log("Boutique 'Bar Central' mise à jour avec le nouvel Admin.");
      }
    }

    // 4. Création des 2 Gérants
    const gerantsData = [
      {
        nom: "Gérant Alpha",
        email: "gerant.a@test.com",
        password: "password123",
        role: "Gérant",
        boutique: centrale._id,
        createur: newAdmin._id,
        mustChangePassword: false
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
        if (gerant.boutique.toString() !== data.boutique.toString() || gerant.createur.toString() !== data.createur.toString() || gerant.nom !== data.nom) {
            Object.assign(gerant, data);
            await gerant.save();
            console.log(`Gérant '${data.nom}' mis à jour.`);
        }
      }
    }

    // 5. Création des 2 Serveurs
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
        if (serveur.boutique.toString() !== data.boutique.toString() || serveur.createur.toString() !== data.createur.toString() || serveur.nom !== data.nom) {
            Object.assign(serveur, data);
            await serveur.save();
            console.log(`Serveur '${data.nom}' mis à jour.`);
        }
      }
    }

    // 6. Création des 2 Caissiers
    const caissiersData = [
      {
        nom: "Caissier 1",
        email: "caissier1@test.com",
        password: "password123",
        role: "Caissier",
        boutique: centrale._id,
        createur: newAdmin._id,
        mustChangePassword: false
      },
      {
        nom: "Caissier 2",
        email: "caissier2@test.com",
        password: "password123",
        role: "Caissier",
        boutique: centrale._id,
        createur: newAdmin._id,
        mustChangePassword: false
      }
    ];

    for (const data of caissiersData) {
      let caissier = await User.findOne({ email: data.email });
      if (!caissier) {
        await User.create(data);
        console.log(`Caissier '${data.nom}' créé.`);
      } else {
        console.log(`Caissier '${data.nom}' existe déjà, utilisation du compte existant.`);
        if (caissier.boutique.toString() !== data.boutique.toString() || caissier.createur.toString() !== data.createur.toString() || caissier.nom !== data.nom) {
            Object.assign(caissier, data);
            await caissier.save();
            console.log(`Caissier '${data.nom}' mis à jour.`);
        }
      }
    }

    // 7. Création de l'Admin Bar
    let adminBar = await User.findOne({ email: "adminbar@test.com" });
    if (!adminBar) {
      adminBar = await User.create({
        nom: "Admin Bar",
        email: "adminbar@test.com",
        password: "password123",
        role: "AdminBar",
        typeCompte: "Bar",
        boutique: bar._id,
        createur: newAdmin._id,
        mustChangePassword: false
      });
      console.log("Admin Bar 'Admin Bar' créé.");
    } else {
      console.log("Admin Bar 'Admin Bar' existe déjà, utilisation du compte existant.");
      if (adminBar.boutique.toString() !== bar._id.toString() || adminBar.createur.toString() !== newAdmin._id.toString()) {
          adminBar.boutique = bar._id;
          adminBar.createur = newAdmin._id;
          await adminBar.save();
          console.log("Admin Bar 'Admin Bar' mis à jour.");
      }
    }

    // 8. Création du Gérant Bar
    let gerantBar = await User.findOne({ email: "gerantbar@test.com" });
    if (!gerantBar) {
      gerantBar = await User.create({
        nom: "Gérant Bar",
        email: "gerantbar@test.com",
        password: "password123",
        role: "GérantBar",
        typeCompte: "Bar",
        boutique: bar._id,
        createur: newAdmin._id,
        mustChangePassword: false
      });
      console.log("Gérant Bar 'Gérant Bar' créé.");
    } else {
      console.log("Gérant Bar 'Gérant Bar' existe déjà, utilisation du compte existant.");
      if (gerantBar.boutique.toString() !== bar._id.toString() || gerantBar.createur.toString() !== newAdmin._id.toString()) {
          gerantBar.boutique = bar._id;
          gerantBar.createur = newAdmin._id;
          await gerantBar.save();
          console.log("Gérant Bar 'Gérant Bar' mis à jour.");
      }
    }

    console.log("Organisation créée avec succès !");
    console.log("=== Résumé des comptes ===");
    console.log("Admin:          admin.sud@test.com / password123");
    console.log("Gérant:         gerant.a@test.com / password123");
    console.log("Gérant:         gerant.b@test.com / password123");
    console.log("Serveur:        serveur1@test.com / password123");
    console.log("Serveur:        serveur2@test.com / password123");
    console.log("Caissier:       caissier1@test.com / password123");
    console.log("Caissier:       caissier2@test.com / password123");
    console.log("AdminBar:       adminbar@test.com / password123");
    console.log("GérantBar:      gerantbar@test.com / password123");
    process.exit(0); // Sortie propre
  } catch (err) {
    console.error("Erreur lors de la création :", err);
    process.exit(1); // Sortie avec erreur
  }
};

// Exécution du script
seedNewOrg();