# Architecture des paiements - StockDash

## 📊 Diagramme de flux

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            FRONTEND (React)                              │
│                                                                          │
│  SaleTab.js                                                              │
│  ├── Sélection client → téléphone auto-rempli                           │
│  ├── Ajout articles → calcul total                                      │
│  ├── Mode paiement → Orange Money, Cash, etc.                           │
│  └── Validation → POST /api/ventes                                      │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                            BACKEND (Node.js/Express)                     │
│                                                                          │
│  venteRoutes.js → POST /api/ventes                                      │
│       │                                                                  │
│       ▼                                                                  │
│  venteController.js → createVente()                                     │
│       │                                                                  │
│       ▼                                                                  │
│  venteService.js → traiterPanier()                                      │
│       │                                                                  │
│       ├── Validation (téléphone obligatoire si Fintech)                 │
│       ├── Vérification stock                                             │
│       │                                                                  │
│       ├── [NOUVEAU] Si mode Fintech → fintechService.initierPaiement()  │
│       │         │                                                        │
│       │         ├── Orange Money → API Orange                            │
│       │         ├── MobiCash → API MTN                                   │
│       │         └── PayCard → API PayCard                               │
│       │                                                                  │
│       ├── Création Vente dans MongoDB                                    │
│       ├── Mise à jour stock                                              │
│       └── Mise à jour caisse                                             │
└──────────────────────────────────────────────────────────────────────────┘
```

## 📁 Structure des fichiers

```
backend/
├── services/
│   ├── venteService.js          ← Logique métier des ventes
│   └── fintechService.js        ← [À CRÉER] Service Mobile Money
├── models/
│   └── Vente.js                  ← Modèle de données
├── controllers/
│   └── venteController.js       ← Contrôleur API
├── routes/
│   └── venteRoutes.js           ← Routes API
└── middleware/
    └── venteMiddleware.js       ← Validation des données
```

## 🔌 Point d'intégration Mobile Money

### Où ajouter l'appel API dans `venteService.js`

```javascript
// Dans traiterPanier(), juste après la validation du téléphone
// (~ ligne 76-78)

// Validation : Pour les paiements Fintech
const fintechModes = ['Orange Money', 'MobiCash', 'PayCard', 'Virement'];
if (fintechModes.includes(modePaiementSaisi) && !transactionRefSaisi) {
    throw new Error(`Le numéro de téléphone est obligatoire...`);
}

// ═══════════════════════════════════════════════
// 🔴 C'EST ICI QU'IL FAUT AJOUTER L'APPEL API
// ═══════════════════════════════════════════════
// Avant la boucle for (const item of items) { ... }
// Appeler fintechService.initierPaiement(...)
// et gérer la réponse
// ═══════════════════════════════════════════════

// 2. BOUCLE SUR LES ARTICLES DU PANIER
for (const item of items) {
    // ...
}
```

## 📦 Modèle de données Vente (champs existants)

```javascript
{
    modePaiement: String,        // 'Cash', 'Orange Money', 'MobiCash', 'PayCard', 'Virement', 'Dette'
    transactionRef: String,      // Numéro de téléphone du client pour Fintech
    numeroFacture: String,       // FAC-XXXXXX-2024
    montantPaye: Number,         // Montant payé
    prixTotal: Number,           // Prix total de la vente
    client: ObjectId,            // Référence client
    statut: String,              // 'commande', 'en_preparation', 'finalisee', 'annulee'
}
```

## 🛡️ Sécurité

- **Clés API jamais exposées au frontend** → stockées uniquement dans `backend/.env`
- **Validation côté backend** → téléphone obligatoire pour Fintech
- **Retry automatique** → à implémenter si le premier appel échoue
- **Logs d'audit** → toutes les transactions enregistrées avec succès/échec