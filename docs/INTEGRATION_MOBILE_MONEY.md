# Guide d'intégration Mobile Money - StockDash

## Objectif
Intégrer les paiements Mobile Money (Orange Money, MTN Mobile Money / MobiCash, PayCard) dans l'application StockDash.

---

## 🏗️ Architecture actuelle

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                        │
│  SaleTab.js → Affiche le mode de paiement + téléphone client    │
│             → Envoie les données au backend                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND (Node.js)                       │
│  venteService.js → Reçoit la vente, valide, enregistre          │
│                  → C'EST ICI qu'on doit appeler l'API Fintech   │
│                                                                 │
│  fintechService.js [NOUVEAU] → Service dédié aux appels API     │
│                               Mobile Money                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📂 Fichiers concernés

### 🟢 NE PAS TOUCHER (déjà fonctionnel)

| Fichier | Rôle |
|---------|------|
| `stock-gestion-frontend/src/components/SaleTab.js` | Interface de vente (déjà prête) |
| `backend/models/Vente.js` | Modèle de données Vente |
| `backend/services/venteService.js` | Logique métier existante |

### 🟡 À MODIFIER (uniquement pour ajouter l'appel API)

| Fichier | Ce qu'il faut ajouter |
|---------|----------------------|
| `backend/services/venteService.js` | Ligne ~190 : Appeler `fintechService.initierPaiement()` |
| `backend/.env` | Ajouter les clés API Fintech |

### 🟢 À CRÉER

| Fichier | Rôle |
|---------|------|
| `backend/services/fintechService.js` | Service contenant les appels API vers les prestataires |

---

## 🔄 Flux de paiement Mobile Money

```
1. Caissier → Sélectionne client (téléphone pré-rempli)
2. Caissier → Ajoute articles au panier
3. Caissier → Choisit "Orange Money" comme mode de paiement
4. Caissier → Clique "Valider la Vente"
5. Frontend → Envoie POST /api/ventes avec { modePaiement: "Orange Money", transactionRef: "623456789", montantPaye: 10000 }
6. Backend → Reçoit la vente
7. Backend → Appelle fintechService.initierPaiement("623456789", 10000, "Orange Money")
8. FintechService → Appelle API Orange Money avec clé API
9. API Orange → Retourne { success: true, transactionId: "OM123456" }
10. Backend → Enregistre la vente avec transactionId
11. Frontend → Reçoit confirmation, affiche succès
```

### En cas d'échec (étape 8)

```
9bis. API Orange → Retourne { success: false, message: "Solde insuffisant" }
10bis. Backend → Retourne erreur 400 au frontend
11bis. Frontend → Affiche "Paiement échoué : Solde insuffisant"
```

---

## 🛠️ Spécifications techniques

### Structure de la réponse API Mobile Money attendue

```javascript
{
  success: boolean,        // true si paiement réussi
  transactionId: string,   // ID de transaction unique côté opérateur
  message: string,         // Message d'erreur si success = false
  providerRef: string      // Référence opérateur (optionnel)
}
```

### Structure de la requête à envoyer

```javascript
{
  phone: string,           // Numéro de téléphone du client
  amount: number,          // Montant à débiter
  merchantId: string,      // ID marchand (configuré dans .env)
  description: string      // Description de la transaction
}
```

---

## 🔑 Configuration (.env)

Ajouter dans `backend/.env` :

```env
# --- CONFIG MOBILE MONEY ---
FINTECH_API_URL=https://api.orange.com/money/v1

# Orange Money
ORANGE_MONEY_API_KEY=votre_cle_api_orange
ORANGE_MONEY_MERCHANT_ID=votre_id_marchand_orange
ORANGE_MONEY_MERCHANT_SECRET=votre_secret_orange

# MTN Mobile Money / MobiCash
MOBICASH_API_KEY=votre_cle_api_mobicash
MOBICASH_MERCHANT_ID=votre_id_marchand_mobicash
MOBICASH_MERCHANT_SECRET=votre_secret_mobicash
```

---

## 📝 Étapes

1. **Lire ce document**
2. **Ouvrir `backend/services/fintechService.js`** (template fourni)
3. **Remplacer les appels API simulés** par les vrais appels API
4. **Ajouter les clés API** dans `backend/.env`
5. **Tester** : Créer une vente avec mode Orange Money → Vérifier l'appel API