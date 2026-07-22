/**
 * Script d'ajout automatique de commentaires d'en-tête JSDoc
 * Ajoute une description standardisée aux fichiers sans en-tête.
 * Usage: node backend/scripts/add-headers.js
 */
const fs = require('fs');
const path = require('path');

const descriptions = {
  'routes/articleRoutes.js': "Routes API pour la gestion des articles (CRUD, transferts, ajustements, remises).",
  'routes/authRoutes.js': "Routes d'authentification : login, register, gestion utilisateurs, notifications.",
  'routes/cacheRoutes.js': "Routes d'administration du cache (invalidation manuelle).",
  'routes/caisseRoutes.js': "Routes de gestion des caisses (ouverture, fermeture, dépenses, rapports).",
  'routes/clientRoutes.js': "Routes CRUD des clients et gestion des dettes/créances.",
  'routes/dashboardRoutes.js': "Route API pour les statistiques du tableau de bord global.",
  'routes/fournisseursRoute.js': "Routes CRUD des fournisseurs et approvisionnement.",
  'routes/mouvementsRoute.js': "Routes de consultation et annulation des mouvements de stock.",
  'routes/auditRoutes.js': "Routes d'accès au journal d'audit (logs).",
  'routes/serveurRoutes.js': "Routes spécifiques au rôle Serveur.",
  'routes/venteRoutes.js': "Routes de création et gestion des ventes (historique, annulation, statut de groupe).",
  'services/venteService.js': "Service de traitement des ventes : création panier, annulation, listing, clôture caisse.",
  'services/articleService.js': "Service métier articles : listing, modification, transferts, ajustements, promotions.",
  'services/notificationService.js': "Service d'envoi de notifications (email, WebSocket, alertes stock).",
  'services/caisseService.js': "Service de gestion des sessions de caisse (ouverture, fermeture, rapports).",
  'services/mouvementService.js': "Service de gestion des mouvements de stock.",
  'services/reminderService.js': "Service de rappels automatiques (échéances, transferts en attente).",
  'services/syncService.js': "Service de synchronisation des données locales vers le cloud.",
  'middleware/authMiddleware.js': "Middleware d'authentification JWT et d'autorisation par rôle.",
  'middleware/venteMiddleware.js': "Middleware de validation des données de vente avant traitement.",
  'middleware/caisseMiddleware.js': "Middleware de vérification de l'état d'ouverture de la caisse.",
  'middleware/passwordMiddleware.js': "Middleware de vérification du changement obligatoire de mot de passe.",
  'config/db.js': "Configuration de la connexion à MongoDB via Mongoose.",
  'controllers/authController.js': "Contrôleur d'authentification : register, login, gestion utilisateurs, validation SuperAdmin.",
  'controllers/articlesController.js': "Contrôleur articles : CRUD, remises, transferts, ajustements de stock.",
  'controllers/caisseController.js': "Contrôleur caisse : ouverture, fermeture, dépenses, rapports financiers.",
  'controllers/boutiqueController.js': "Contrôleur boutiques : CRUD et gestion des établissements.",
  'controllers/cacheController.js': "Contrôleur pour l'invalidation manuelle du cache.",
  'controllers/clientController.js': "Contrôleur clients : CRUD, dettes, commissions, historique.",
  'controllers/dashboardController.js': "Contrôleur du tableau de bord : agrégation des statistiques globales.",
  'controllers/fournisseurController.js': "Contrôleur fournisseurs : CRUD et approvisionnement de la centrale.",
  'controllers/mouvementController.js': "Contrôleur des mouvements de stock : consultation, annulation, pertes.",
  'controllers/serveurController.js': "Contrôleur spécifique au rôle Serveur.",
  'controllers/venteController.js': "Contrôleur des ventes : création, historique, annulation, statut de groupe.",
};

const dirs = [
  'backend/routes',
  'backend/services',
  'backend/middleware',
  'backend/config',
  'backend/controllers',
];

let count = 0;

for (const dir of dirs) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const relPath = fullPath.replace(/\\/g, '/');
    let content = fs.readFileSync(fullPath, 'utf8');

    // Vérifier si un commentaire d'en-tête existe déjà
    if (content.startsWith('/**') || content.startsWith('// ') || content.startsWith('/*!')) {
      console.log(`✓ Déjà commenté: ${relPath}`);
      continue;
    }

    const desc = descriptions[relPath.replace('backend/', '')] || descriptions[relPath] || `${path.basename(file, '.js')} - ${dir.split('/').pop()}`;
    const header = `/**
 * @file ${file}
 * @description ${desc}
 */

`;
    content = header + content;
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`✓ Ajouté: ${relPath}`);
    count++;
  }
}

console.log(`\n${count} fichiers mis à jour avec un en-tête.`);