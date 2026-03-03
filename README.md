# Application de Gestion de Stock et de Ventes

## 📋 Description

Application web complète de gestion de stock et de ventes pour un réseau de boutiques. Cette solution permet de centraliser et d'automatiser la gestion commerciale avec des interfaces adaptées aux différents profils d'utilisateurs.

## 🎯 Fonctionnalités

### Pour les Administrateurs
- **Tableau de bord** avec statistiques et analytics
- **Gestion des gérants** (création, modification, désactivation)
- **Gestion des boutiques** (ajout, modification, suppression)
- **Gestion des articles** (catalogue, prix, stocks)
- **Historique des ventes** et logs détaillés
- **Reporting** et indicateurs de performance

### Pour les Gérants
- **Tableau de bord** de suivi quotidien
- **Interface de caisse** simplifiée pour les ventes
- **Consultation du stock** de sa boutique
- **Historique des ventes** locales
- **Alertes** de seuil de stock

### Fonctionnalités Communes
- **Authentification sécurisée** avec JWT
- **Gestion de profil** utilisateur
- **Changement de mot de passe**
- **Thème clair/sombre**

## 🏗️ Architecture Technique

### Frontend (React)
- **React 19** - Bibliothèque UI
- **React Router 7** - Navigation
- **Axios** - Appels API
- **Bootstrap 5** - Styling et responsive
- **Chart.js** - Visualisation de données
- **Context API** - Gestion d'état

### Backend (Node.js)
- **Node.js** - Runtime JavaScript
- **Express** - Framework web
- **MongoDB** - Base de données NoSQL
- **Mongoose** - ODM (Object Document Mapper)
- **JWT** - Authentification
- **bcrypt** - Hachage des mots de passe
- **Nodemailer** - Envoi d'emails

### Architecture
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │   Database      │
│   (React)       │◄──►│   (Node.js)     │◄──►│   (MongoDB)     │
│                 │    │                 │    │                 │
│ • UI Components │    │ • Controllers   │    │ • Collections   │
│ • Routes        │    │ • Services      │    │ • Schemas       │
│ • API Calls     │    │ • Middleware    │    │ • Indexes       │
│ • State Mgmt    │    │ • Models        │    │ • Aggregations  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🚀 Installation

### Prérequis
- **Node.js** (version 18.0.0 ou supérieure)
- **MongoDB** (version 6.0 ou supérieure)
- **Git** (pour le versionnement)

### Backend
```bash
# 1. Cloner le projet
git clone <repository-url>
cd backend

# 2. Installer les dépendances
npm install

# 3. Configuration de l'environnement
cp .env.example .env
# Modifier les variables suivantes dans .env :
# PORT=3001
# MONGO_URI=mongodb://localhost:27017/app-gestion-stock
# JWT_SECRET=une_phrase_secrete_tres_longue_et_aleatoire
# EMAIL_USER=votre@email.com
# EMAIL_PASS=votre_mot_de_passe_app

# 4. Démarrer MongoDB (si installation locale)
# Windows : net start MongoDB
# Linux : sudo systemctl start mongod
# macOS : brew services start mongodb/brew/mongodb-community

# 5. Démarrer le serveur
npm run dev
```

### Frontend
```bash
# 1. Accéder au répertoire frontend
cd ../stock-gestion-frontend

# 2. Installer les dépendances
npm install

# 3. Configuration de l'environnement
cp .env.example .env
# Modifier la variable suivante dans .env :
# REACT_APP_API_URL=http://localhost:3001/api

# 4. Démarrer l'application
npm start
```

### Initialisation de la Base de Données
```bash
# 1. Créer les données de test et l'administrateur
cd backend
node seed.js

# Identifiants par défaut créés :
# Administrateur : admin@example.com / admin123
# Gérant 1 : manager1@example.com / manager123
# Gérant 2 : manager2@example.com / manager123
```

## 📖 Documentation

### Documentation Technique
Consultez le dossier `backend/postman-tests/` pour :
- **Collection Postman** complète de tests API
- **Guide d'exécution** des tests
- **Documentation** des endpoints

### Manuel Utilisateur
- **[Guide Administrateur](docs/guide-admin.md)** - Fonctionnalités avancées
- **[Guide Gérant](docs/guide-gerant.md)** - Utilisation quotidienne
- **[Guide Installation](docs/installation.md)** - Procédures de déploiement

### Rapport de Stage
Consultez `docs/rapport-stage.md` pour une description détaillée du projet, de l'analyse au déploiement.

## 🔐 Sécurité

### Authentification
- **JWT** (JSON Web Tokens) pour l'authentification
- **Durée de validité** : 24 heures
- **Stockage** : localStorage (frontend)
- **Transmission** : Header Authorization Bearer

### Autorisation
- **Rôles** : Admin, Gérant
- **Middleware** d'autorisation par rôles
- **Accès restreint** selon le profil utilisateur

### Validation
- **Email** : Format valide et unique
- **Mots de passe** : Hachage bcrypt (salt rounds: 10)
- **IDs MongoDB** : Validation ObjectId
- **Prix** : Vérification prixVente > prixAchat

## 🧪 Tests

### Tests Postman
```bash
# 1. Importer la collection
# Fichier : backend/postman-tests/backend.postman_collection.json

# 2. Configurer l'environnement
# Variables : baseUrl, adminToken, gerantToken

# 3. Exécuter les tests
# Collection Runner → Sélectionner l'environnement → Run
```

### Scénarios de Test
- **Authentification** complète
- **CRUD** pour chaque entité
- **Sécurité** et autorisation
- **Validation** des données
- **Performance** et temps de réponse

## 📊 Performance

### Temps de Réponse
- **Requêtes simples** : < 100ms
- **Requêtes complexes** : < 500ms
- **Temps de chargement** frontend : < 2s

### Capacité
- **Utilisateurs simultanés** : 50+
- **Transactions par minute** : 100+
- **Temps de réponse sous charge** : < 1s

## 🚀 Déploiement

### Environnement de Production

#### Backend (Node.js)
```bash
# 1. Installation en production
npm install --production

# 2. Configuration production
NODE_ENV=production
PORT=3001
MONGO_URI=mongodb://prod-server:27017/app-gestion-stock

# 3. Démarrage avec PM2
pm2 start server.js --name "stock-backend"
pm2 save
pm2 startup
```

#### Frontend (React)
```bash
# 1. Build production
npm run build

# 2. Serveur statique (ex: Nginx)
# Configuration Nginx pour React SPA
server {
    listen 80;
    server_name your-domain.com;
    root /path/to/build;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 🤝 Contribution

### Processus de Contribution
1. **Fork** le projet
2. Créer une **branche** (`git checkout -b feature/nouvelle-fonctionnalité`)
3. **Commit** vos changements (`git commit -m 'Ajout de la fonctionnalité X'`)
4. **Push** vers la branche (`git push origin feature/nouvelle-fonctionnalité`)
5. Créer une **Pull Request**

### Bonnes Pratiques
- **Code** : Respecter les conventions de nommage
- **Tests** : Ajouter des tests pour les nouvelles fonctionnalités
- **Documentation** : Mettre à jour la documentation
- **Commit** : Messages clairs et descriptifs

## 🐛 Support

### Problèmes Courants

#### Backend
- **Connection Refused** : Vérifier MongoDB et PORT
- **JWT Invalid** : Vérifier JWT_SECRET et expiration
- **Email déjà utilisé** : Reset Database ou utiliser emails uniques

#### Frontend
- **API unreachable** : Vérifier REACT_APP_API_URL
- **Auth failed** : Vérifier token et expiration
- **UI not loading** : Vérifier dépendances et build

### Contact
- **Email** : hadjibah1898@gmail.com
- **Disponibilité** : Sur demande
- **Réponse** : Sous 48h

## 📄 License

Ce projet est sous license MIT. Consultez le fichier [LICENSE](LICENSE) pour plus de détails.

## 🙏 Remerciements

Un grand merci à :
- Mon encadrant entreprise pour son accompagnement

**Projet réalisé dans le cadre de  mon  stage**  
**Auteur** : Hadjibah Mohamed  
**Date** : Février 2024