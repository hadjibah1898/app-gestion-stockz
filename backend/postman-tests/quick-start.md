# Quick Start - Tests Postman Backend

## ⚡ **Démarrage Rapide (5 minutes)**

### **Étape 1: Préparation (1 minute)**
1. **Démarrez le backend**
   ```bash
   cd backend
   npm run dev
   ```

2. **Vérifiez MongoDB**
   ```bash
   # Vérifiez que MongoDB est en cours d'exécution
   mongo --version
   ```

### **Étape 2: Importation Postman (2 minutes)**
1. **Ouvrez Postman**
2. **Cliquez sur "Import"** en haut à gauche
3. **Sélectionnez** `backend/postman-tests/backend.postman_collection.json`
4. **Cliquez sur "Import"**

### **Étape 3: Configuration (1 minute)**
1. **Créez un environnement** nommé "Backend Test"
2. **Ajoutez les variables** :
   ```
   baseUrl: http://localhost:3001/api
   adminToken: (eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5ODljN2I0YTE0ODZlOWE1OTU0ZDc2MyIsInJvbGUiOiJBZG1pbiIsImlhdCI6MTc3MTI0NTQzNiwiZXhwIjoxNzcxMzMxODM2fQ.KzpD4dR0dadTHmpeQPYzpLlHg--8QFQznr7VzKlLyiw)
   gerantToken: (vide pour l'instant)
   ```

### **Étape 4: Premier Test (1 minute)**
1. **Allez dans la collection** "Backend Gestion de Stock et Ventes"
2. **Ouvrez** "2. Authentification" → "Register User"
3. **Cliquez sur "Send"**
4. **Vérifiez** le code 201 et le message de succès

### **Étape 5: Test Complet (5 minutes)**
1. **Cliquez sur "Run"** en haut de la collection
2. **Sélectionnez** votre environnement "Backend Test"
3. **Cliquez sur "Run Backend Gestion de Stock et Ventes"**
4. **Attendez** la fin de l'exécution
5. **Consultez** le rapport de résultats

## 🎯 **Tests Rapides par Fonctionnalité**

### **Authentification (30 secondes)**
```bash
# 1. Inscription
POST /api/auth/register
Body: {"nom":"Test","email":"test@test.com","password":"123"}

# 2. Connexion  
POST /api/auth/login
Body: {"email":"test@test.com","password":"123"}
```

### **Articles (45 secondes)**
```bash
# 1. Liste articles (nécessite token)
GET /api/articles
Headers: Authorization: Bearer <token>

# 2. Création article (Admin uniquement)
POST /api/articles
Headers: Authorization: Bearer <admin_token>
Body: {"nom":"T-shirt","prixAchat":10,"prixVente":20,"quantite":50}
```

### **Ventes (60 secondes)**
```bash
# 1. Enregistrement vente
POST /api/ventes
Headers: Authorization: Bearer <gerant_token>
Body: {"articleId":"<article_id>","quantiteVendue":2}

# 2. Historique ventes
GET /api/ventes/historique
Headers: Authorization: Bearer <gerant_token>
```

## 🚨 **Erreurs Fréquentes & Solutions**

### **Erreur: Connection Refused**
```bash
# Problème: Backend pas démarré
# Solution: 
cd backend && npm run dev

# Vérification:
curl http://localhost:3001/api/auth/login
```

### **Erreur: Token Invalide**
```bash
# Problème: Token expiré ou mal copié
# Solution: 
# 1. Refaites login
# 2. Copiez le nouveau token
# 3. Mettez à jour la variable d'environnement
```

### **Erreur: Email déjà utilisé**
```bash
# Problème: Données de test existantes
# Solution:
# 1. Allez dans "1. Setup & Cleanup"
# 2. Exécutez "Reset Database"
# 3. Recommencez les tests
```

### **Erreur: Accès refusé**
```bash
# Problème: Mauvais rôle ou token
# Solution:
# 1. Vérifiez que vous utilisez le bon token (admin vs gerant)
# 2. Vérifiez le rôle de l'utilisateur dans la base de données
```

## 📊 **Interprétation Rapide des Résultats**

### **Codes de Statut**
- ✅ **200/201** : Succès
- ⚠️ **400** : Données invalides
- 🔒 **401** : Non authentifié
- 🚫 **403** : Accès refusé
- ❌ **500** : Erreur serveur

### **Messages Courants**
- `"Utilisateur créé avec succès"` : ✅ OK
- `"Token invalide"` : 🔒 Problème authentification
- `"Stock insuffisant"` : ⚠️ Validation métier
- `"prix de vente doit être supérieur"` : ⚠️ Validation prix

## 🎖️ **Achievements - Objectifs à Atteindre**

### **Niveau 1: Fonctionnalités de Base (10 minutes)**
- [ ] Login/Register fonctionnels
- [ ] CRUD Articles pour Admin
- [ ] Enregistrement Ventes pour Gérant
- [ ] Historique Ventes accessible

### **Niveau 2: Sécurité (5 minutes)**
- [ ] Accès refusé pour mauvais rôle
- [ ] Token invalide rejeté
- [ ] Données invalides contrôlées
- [ ] Erreurs appropriées affichées

### **Niveau 3: Performance (5 minutes)**
- [ ] Temps de réponse < 1s
- [ ] Transactions atomiques
- [ ] Pas d'erreurs 500
- [ ] Logs générés correctement

### **Niveau 4: Dashboard (5 minutes)**
- [ ] Statistiques calculées
- [ ] CA et bénéfice affichés
- [ ] Performance par gérant
- [ ] Logs de ventes accessibles

## 🚀 **Prochaines Étapes**

### **Après les Tests**
1. **Analysez les échecs** et corrigez les bugs
2. **Optimisez les performances** si temps de réponse > 1s
3. **Renforcez la sécurité** si vulnérabilités détectées
4. **Documentez les endpoints** pour le frontend

### **Pour le Frontend**
1. **Utilisez cette collection** pour tester l'intégration
2. **Adaptez les endpoints** selon les besoins UI
3. **Testez les scénarios utilisateurs** complets
4. **Validez l'expérience utilisateur**

### **Pour la Production**
1. **Configurez le monitoring** avec ces tests
2. **Automatisez l'exécution** avec CI/CD
3. **Surveillez les performances** en continu
4. **Planifiez les tests de charge** pour l'évolutivité

## 💡 **Conseils Pro**

### **Tips de Développement**
- **Utilisez les variables** Postman pour éviter la duplication
- **Testez les limites** avec des données extrêmes
- **Vérifiez les logs** backend pendant les tests
- **Nettoyez l'environnement** entre chaque série de tests

### **Tips de Déploiement**
- **Testez en staging** avant la production
- **Surveillez les métriques** de performance
- **Ayez un plan de rollback** en cas de problème
- **Documentez les procédures** de test

Avec ce quick start, vous devriez pouvoir tester votre backend en moins de 15 minutes et identifier rapidement les éventuels problèmes à corriger !