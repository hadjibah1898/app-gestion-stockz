# Guide d'Exécution des Tests Postman

## 🚀 **Lancement des Tests**

### **Méthode 1: Tests Individuels**
1. Ouvrez Postman
2. Importez la collection `backend.postman_collection.json`
3. Cliquez sur une requête spécifique
4. Cliquez sur "Send" pour exécuter le test

### **Méthode 2: Collection Runner (Recommandé)**
1. Dans Postman, cliquez sur "Collections"
2. Sélectionnez "Backend Gestion de Stock et Ventes"
3. Cliquez sur "Run"
4. Choisissez votre environnement
5. Cliquez sur "Run Backend Gestion de Stock et Ventes"

### **Méthode 3: Ligne de Commande (Newman)**
```bash
# Installez Newman si ce n'est pas déjà fait
npm install -g newman

# Exécutez la collection
newman run backend.postman_collection.json --environment your-environment.json

# Avec rapport HTML
newman run backend.postman_collection.json --environment your-environment.json --reporters html --reporter-html-export report.html
```

## 📊 **Interprétation des Résultats**

### **Codes de Statut Attendus**

| Code | Signification | Exemple d'Usage |
|------|---------------|-----------------|
| **200** | OK - Requête réussie | GET, PUT, DELETE réussis |
| **201** | Created - Ressource créée | POST pour création |
| **400** | Bad Request - Données invalides | Validation échouée |
| **401** | Unauthorized - Token manquant/invalide | Accès sans authentification |
| **403** | Forbidden - Rôle insuffisant | Gérant accédant à fonction Admin |
| **404** | Not Found - Ressource introuvable | ID invalide |
| **500** | Internal Server Error - Erreur serveur | Problème base de données |

### **Structure des Réponses**

#### **Succès**
```json
{
    "success": true,
    "data": { /* données spécifiques */ },
    "message": "Opération réussie"
}
```

#### **Erreur**
```json
{
    "success": false,
    "error": "Description de l'erreur",
    "code": 400
}
```

## 🧪 **Scénarios de Test Recommandés**

### **Scenario 1: Flux Admin Complet (15 minutes)**

1. **Setup** (2 min)
   - Reset Database
   - Create Test Data

2. **Authentification** (3 min)
   - Login Admin
   - Get Users List

3. **Gestion Boutiques** (3 min)
   - Create Boutique
   - Get All Boutiques
   - Update Boutique

4. **Gestion Articles** (4 min)
   - Create Article
   - Get All Articles
   - Update Article
   - Delete Article

5. **Dashboard** (3 min)
   - Get Dashboard Stats

**Total: 15 minutes**

### **Scenario 2: Flux Gérant Complet (10 minutes)**

1. **Authentification** (2 min)
   - Login Gérant
   - Get Articles

2. **Ventes** (6 min)
   - Register Sale (Simple)
   - Register Sale (Panier)
   - Get Sales History

3. **Validation Erreurs** (2 min)
   - Insufficient Stock
   - Invalid Data

**Total: 10 minutes**

### **Scenario 3: Tests de Sécurité (5 minutes)**

1. **Authentification** (2 min)
   - Unauthorized Access
   - Invalid Token

2. **Contrôle d'Accès** (3 min)
   - Wrong Role Access
   - Invalid ObjectId

**Total: 5 minutes**

## 📈 **Monitoring des Performances**

### **Temps de Réponse Attendus**

| Type de Requête | Temps Max Attendu |
|-----------------|-------------------|
| **Simple GET** | < 100ms |
| **POST/PUT/DELETE** | < 500ms |
| **Agrégations Complexes** | < 1000ms |
| **Transactions** | < 2000ms |

### **Indicateurs de Performance**

- **Taux de réussite**: > 95%
- **Temps de réponse moyen**: < 500ms
- **Temps de réponse maximum**: < 2000ms
- **Erreurs serveur**: < 1%

## 🔍 **Dépannage des Erreurs Courantes**

### **Erreur: Connection Refused**
```bash
# Vérifiez que le backend est démarré
curl http://localhost:3001/api/auth/login

# Vérifiez le port dans .env
cat backend/.env | grep PORT
```

### **Erreur: Token Invalide**
```javascript
// Vérifiez la structure du token
const token = pm.response.json().token;
console.log('Token parts:', token.split('.').length);
console.log('Token valid:', token.split('.').length === 3);
```

### **Erreur: Email déjà utilisé**
```bash
# Réinitialisez la base de données
curl -X DELETE http://localhost:3001/api/test/reset
```

### **Erreur: Stock insuffisant**
```javascript
// Vérifiez le stock disponible
pm.test('Check available stock', function () {
    const jsonData = pm.response.json();
    console.log('Available stock:', jsonData.quantite);
    console.log('Requested quantity:', pm.request.body.raw);
});
```

## 📋 **Checklist de Validation**

### **Fonctionnalités de Base**
- [ ] **Authentification** : Login/Register fonctionnels
- [ ] **Rôles** : Admin/Gérant bien séparés
- [ ] **Boutiques** : CRUD complet pour Admin
- [ ] **Articles** : CRUD avec validation prix
- [ ] **Ventes** : Enregistrement et historique
- [ ] **Dashboard** : Statistiques calculées

### **Sécurité**
- [ ] **JWT** : Tokens générés et validés
- [ ] **Autorisation** : Accès refusé selon rôle
- [ ] **Validation** : Données contrôlées
- [ ] **Erreurs** : Gestion appropriée

### **Performance**
- [ ] **Temps de réponse** : Dans les délais
- [ ] **Transactions** : Atomiques et rapides
- [ ] **Base de données** : Pas de fuites de connexion
- [ ] **Mémoire** : Pas de fuites mémoire

### **Qualité du Code**
- [ ] **Tests** : Tous les tests passent
- [ ] **Logs** : Informations pertinentes
- [ ] **Documentation** : Endpoints documentés
- [ ] **Erreurs** : Messages clairs et utiles

## 🎯 **Bonnes Pratiques**

### **Avant les Tests**
1. **Redémarrez le backend** pour un état propre
2. **Vérifiez MongoDB** est en cours d'exécution
3. **Nettoyez les variables** d'environnement Postman
4. **Utilisez des données de test** uniques

### **Pendant les Tests**
1. **Exécutez dans l'ordre** indiqué
2. **Vérifiez les logs** du backend
3. **Notez les anomalies** pour correction
4. **Testez les limites** (données invalides, etc.)

### **Après les Tests**
1. **Analysez les résultats** détaillés
2. **Générez les rapports** de performance
3. **Documentez les bugs** trouvés
4. **Planifiez les correctifs** nécessaires

## 📊 **Exemples de Rapports**

### **Rapport de Test Simple**
```
Tests exécutés: 25
Tests réussis: 23 (92%)
Tests échoués: 2 (8%)
Temps total: 45s
Temps moyen: 1.8s
```

### **Rapport de Performance**
```
Requêtes rapides (<100ms): 60%
Requêtes moyennes (100-500ms): 35%
Requêtes lentes (>500ms): 5%
Erreurs serveur: 0%
Erreurs client: 2%
```

### **Rapport de Sécurité**
```
Authentification: ✅ OK
Autorisation: ✅ OK
Validation données: ✅ OK
Erreurs appropriées: ✅ OK
Tokens JWT: ✅ OK
```

## 🔧 **Configuration Avancée**

### **Variables d'Environnement**
```json
{
  "baseUrl": "http://localhost:3001/api",
  "adminEmail": "admin@test.com",
  "adminPassword": "admin123",
  "gerantEmail": "gerant@test.com", 
  "gerantPassword": "gerant123",
  "testPrefix": "TEST_"
}
```

### **Scripts de Pré-requête**
```javascript
// Génération d'emails uniques
pm.environment.set('uniqueEmail', `test_${Date.now()}@example.com`);
```

### **Scripts de Test Avancés**
```javascript
// Validation complexe de la réponse
pm.test('Response schema validation', function () {
    const schema = {
        type: "object",
        properties: {
            _id: { type: "string" },
            nom: { type: "string" },
            createdAt: { type: "string", format: "date-time" }
        },
        required: ["_id", "nom"]
    };
    
    const jsonData = pm.response.json();
    pm.expect(tv4.validate(jsonData, schema)).to.be.true;
});
```

## 🚨 **Alertes et Monitoring**

### **Alertes à Surveiller**
- **Temps de réponse > 2s** : Problème performance
- **Taux d'échec > 5%** : Problème fonctionnel
- **Erreurs 500** : Problème serveur
- **Erreurs 401/403** : Problème sécurité

### **Monitoring en Production**
```bash
# Surveiller les endpoints critiques
watch -n 30 'curl -s http://localhost:3001/api/health || echo "DOWN"'

# Logs en temps réel
tail -f /var/log/backend/access.log | grep ERROR
```

Ce guide vous permettra de tester votre backend de manière complète et systématique, en s'assurant que toutes les fonctionnalités sont opérationnelles et sécurisées.