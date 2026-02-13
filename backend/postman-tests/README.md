# Tests Postman - Backend Gestion de Stock et Ventes

Collection de tests Postman pour valider le bon fonctionnement du backend.

## 📋 **Prérequis**

1. **Backend démarré** sur `http://localhost:3001`
2. **MongoDB** en cours d'exécution
3. **Postman** installé

## 🚀 **Importation de la Collection**

1. Ouvrez Postman
2. Cliquez sur "Import" en haut à gauche
3. Sélectionnez le fichier `backend.postman_collection.json`
4. Cliquez sur "Import"

## 🔧 **Variables d'Environnement**

Créez un environnement Postman avec les variables suivantes :

```json
{
  "baseUrl": "http://localhost:3001/api",
  "adminToken": "",
  "gerantToken": "",
  "userId": "",
  "boutiqueId": "",
  "articleId": "",
  "venteId": ""
}
```

## 📊 **Structure de la Collection**

### **1. Setup & Cleanup**
- Reset Database
- Create Test Data

### **2. Authentification**
- Register User
- Login User
- Create Manager (Admin)
- Get Users List (Admin)

### **3. Boutiques (Admin)**
- Create Boutique
- Get All Boutiques
- Update Boutique
- Get Boutique by ID

### **4. Articles (Admin)**
- Create Article
- Get All Articles
- Update Article
- Delete Article

### **5. Ventes (Gérant)**
- Register Sale
- Get Sales History
- Get Sales Logs (Admin)

### **6. Dashboard (Admin)**
- Get Dashboard Stats

## 🧪 **Tests Automatisés**

Chaque requête contient des tests Postman pour valider :
- Les codes de statut HTTP
- La structure de la réponse JSON
- La présence des champs obligatoires
- La cohérence des données

## 📈 **Scénarios de Test**

### **Scenario 1: Flux Complet Admin**
1. Login Admin
2. Create Boutique
3. Create Manager
4. Create Article
5. Get Dashboard Stats

### **Scenario 2: Flux Complet Gérant**
1. Login Gérant
2. Get Articles
3. Register Sale
4. Get Sales History

### **Scenario 3: Validation des Erreurs**
1. Test authentification invalide
2. Test accès refusé
3. Test validation données
4. Test stock insuffisant

## 🔄 **Exécution des Tests**

### **Tests Individuels**
Exécutez chaque requête individuellement pour tester spécifiquement une fonctionnalité.

### **Collection Runner**
1. Cliquez sur "Collections"
2. Sélectionnez la collection "Backend Tests"
3. Cliquez sur "Run"
4. Choisissez votre environnement
5. Lancez l'exécution

### **Tests en Séquence**
Utilisez l'ordre des requêtes pour tester des flux complets d'utilisation.

## 📝 **Exemples de Tests**

### **Test de Login Réussi**
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Response has token", function () {
    const jsonData = pm.response.json();
    pm.expect(jsonData).to.have.property('token');
    pm.expect(jsonData).to.have.property('role');
    pm.expect(jsonData).to.have.property('nom');
});

pm.test("Token is valid JWT", function () {
    const token = pm.response.json().token;
    const parts = token.split('.');
    pm.expect(parts).to.have.lengthOf(3);
});
```

### **Test de Validation des Données**
```javascript
pm.test("Article validation - prix vente > prix achat", function () {
    pm.expect(pm.response.code).to.equal(400);
    const jsonData = pm.response.json();
    pm.expect(jsonData.message).to.include("prix de vente doit être supérieur");
});
```

## ⚠️ **Points de Vigilance**

1. **Ordre d'exécution** : Certaines requêtes dépendent de données créées par d'autres
2. **Nettoyage** : Utilisez "Reset Database" entre les tests pour éviter les conflits
3. **Tokens** : Les tokens expirent après 24h, reconnectez-vous si nécessaire
4. **Données de test** : Les IDs changent à chaque exécution, utilisez les variables Postman

## 🐛 **Dépannage**

### **Erreur: Connection Refused**
- Vérifiez que le backend est démarré sur le bon port
- Vérifiez que MongoDB est en cours d'exécution

### **Erreur: Token Invalide**
- Reconnectez-vous pour obtenir un nouveau token
- Vérifiez que le token est bien stocké dans les variables d'environnement

### **Erreur: Email déjà utilisé**
- Utilisez "Reset Database" pour nettoyer les données de test
- Ou utilisez des emails différents pour chaque test

## 📋 **Checklist de Validation**

- [ ] Toutes les routes retournent les bons codes HTTP
- [ ] Les tokens JWT sont générés correctement
- [ ] Les validations côté serveur fonctionnent
- [ ] Les transactions MongoDB sont atomiques
- [ ] Les logs de ventes sont générés
- [ ] Le dashboard calcule correctement les statistiques
- [ ] Les rôles et permissions sont respectés
- [ ] Les erreurs sont bien gérées et formatées

## 🎯 **Prochaines Étapes**

1. **Frontend** : Utilisez cette collection pour tester l'intégration frontend
2. **Tests Unitaires** : Complétez avec des tests unitaires Node.js
3. **Monitoring** : Configurez des tests de monitoring en production
4. **Documentation** : Générez automatiquement la documentation API à partir de ces tests