# Workflow Caissier - Gestion de Caisse

## Vue d'ensemble

Cette fonctionnalité permet aux caissiers de gérer leur propre caisse de manière autonome et d'envoyer leurs rapports au gérant pour validation.

## Architecture du système

### Rôles et responsabilités

1. **Caissier**
   - Ouvre sa propre caisse avec un fond initial
   - Effectue des ventes et gère les recouvrements
   - Clôture sa caisse et soumet un rapport au gérant
   - Peut corriger un rapport rejeté par le gérant

2. **Gérant**
   - Reçoit des notifications quand un caissier ouvre/ferme sa caisse
   - Valide ou rejette les rapports des caissiers
   - Peut consulter tous les rapports des caissiers de sa boutique

3. **Admin**
   - Voit les rapports validés par les gérants
   - Peut valider ou rejeter les rapports (workflow classique)

## Workflow complet

```
┌─────────────┐
│   Caissier  │
└──────┬──────┘
       │
       │ 1. Ouvre sa caisse (fond initial)
       │
       ▼
┌─────────────────────────────────────┐
│  Notification envoyée au Gérant     │
└─────────────────────────────────────┘
       │
       │ 2. Effectue des ventes/recouvrements
       │
       ▼
┌─────────────────────────────────────┐
│  Caissier clôture sa caisse         │
│  et soumet le rapport               │
└──────┬──────────────────────────────┘
       │
       │ 3. Rapport soumis (statut: EN_ATTENTE)
       │
       ▼
┌─────────────────────────────────────┐
│  Notification envoyée au Gérant     │
└──────┬──────────────────────────────┘
       │
       │ 4. Gérant valide ou rejette
       │
       ▼
┌─────────────────────────────────────┐
│  Si VALIDÉ: statut = VALIDE_PAR_GERANT │
│  Si REJETÉ: statut = REJETE_PAR_GERANT │
└──────┬──────────────────────────────┘
       │
       │ 5. Si validé, l'Admin peut traiter
       │
       ▼
┌─────────────────────────────────────┐
│  Admin valide/rejette               │
│  (statut final: VALIDE ou REJETE)   │
└─────────────────────────────────────┘
```

## Modifications apportées

### Backend

#### 1. Modèle `RapportCaisse` (backend/models/RapportCaisse.js)
- Ajout de nouveaux statuts: `VALIDE_PAR_GERANT`, `REJETE_PAR_GERANT`
- Ajout des champs:
  - `gerantValidateur`: ID du gérant qui a validé/rejeté
  - `dateValidationGerant`: Date de validation/rejet par le gérant

#### 2. Contrôleur `caisseController.js` (backend/controllers/caisseController.js)
- **ouvrirCaisse**: Gestion spécifique pour les caissiers
  - Un caissier peut ouvrir sa propre caisse (pas de restriction de boutique)
  - Notification envoyée au gérant de la boutique
  
- **fermerCaisse**: 
  - Message adapté pour les caissiers
  - Notification envoyée au gérant quand un caissier soumet un rapport

- **Nouvelles méthodes**:
  - `validerRapportCaissier`: Le gérant valide un rapport de caissier
  - `rejeterRapportCaissier`: Le gérant rejette un rapport de caissier
  - `listerRapportsCaissiers`: Le gérant liste les rapports de ses caissiers

#### 3. Routes `caisseRoutes.js` (backend/routes/caisseRoutes.js)
- `GET /caisse/rapports/caissiers`: Liste des rapports des caissiers (Gérant)
- `PUT /caisse/rapports/caissiers/:id/valider`: Valider un rapport (Gérant)
- `PUT /caisse/rapports/caissiers/:id/rejeter`: Rejeter un rapport (Gérant)

#### 4. Service `notificationService.js` (backend/services/notificationService.js)
- `notifierOuvertureCaisseCaissier`: Notifie le gérant quand un caissier ouvre sa caisse
- `notifierRapportCaissier`: Notifie le gérant quand un caissier soumet un rapport
- `notifierValidationRapportCaissier`: Notifie le caissier quand son rapport est validé
- `notifierRejetRapportCaissier`: Notifie le caissier quand son rapport est rejeté

### Frontend

#### 1. Composant `CaissierCaisseView.js` (stock-gestion-frontend/src/components/CaissierCaisseView.js)
Interface dédiée pour les caissiers avec:
- Formulaire d'ouverture de caisse avec fond initial
- Affichage du statut de la caisse (ouverte/fermée)
- Statistiques en temps réel (ventes, recouvrements, dépenses)
- Modale de clôture avec calcul automatique de l'écart
- Gestion des justifications d'écart
- Support du mode correction pour les rapports rejetés

#### 2. Service API `api.js` (stock-gestion-frontend/src/services/api.js)
- Ajout de méthodes pour les détails Fintech:
  - `getVentesHistorique`
  - `getDettesHistorique`
- Ajout de méthodes pour le workflow caissier:
  - `listerRapportsCaissiers`
  - `validerRapportCaissier`
  - `rejeterRapportCaissier`

#### 3. Routing `App.js` (stock-gestion-frontend/src/App.js)
- Route `/caissier/caisse` mappée sur `CaissierCaisseView`
- Import du nouveau composant

## Installation et déploiement

### Backend
```bash
cd backend
npm install
npm start
```

### Frontend
```bash
cd stock-gestion-frontend
npm install
npm start
```

## Tests à effectuer

### Test 1: Ouverture de caisse par un caissier
1. Se connecter en tant que caissier
2. Aller sur `/caissier/caisse`
3. Ouvrir la caisse avec un fond initial
4. Vérifier que le gérant reçoit une notification

### Test 2: Clôture de caisse et soumission de rapport
1. Effectuer quelques ventes
2. Clôturer la caisse
3. Vérifier que le rapport est créé avec statut `EN_ATTENTE`
4. Vérifier que le gérant reçoit une notification

### Test 3: Validation par le gérant
1. Se connecter en tant que gérant
2. Aller sur `/gerant/validation-rapports` ou `/gerant/rapports-caissiers`
3. Voir le rapport du caissier
4. Valider ou rejeter avec commentaires
5. Vérifier que le caissier reçoit une notification

### Test 4: Correction par le caissier
1. Si le rapport est rejeté, le caissier voit une alerte
2. Le caissier peut corriger et renvoyer le rapport
3. Le gérant reçoit une nouvelle notification

## Sécurité

- Les caissiers ne peuvent ouvrir qu'une seule caisse à la fois
- Les caissiers ne peuvent voir que leurs propres rapports
- Les gérants ne peuvent valider que les rapports des caissiers de leur boutique
- Toutes les actions sont tracées dans le système de notifications

## Notes techniques

- Le système utilise le même modèle `OuvertureCaisse` pour gérants et caissiers
- La distinction se fait via le champ `role` de l'utilisateur
- Les notifications sont envoyées en temps réel (in-app) et par email (si configuré)
- Le calcul des statistiques est identique à celui des gérants

## Évolutions futures possibles

- Ajout d'un onglet "Mes Rapports" pour les caissiers
- Export PDF des rapports pour les caissiers
- Statistiques de performance pour les caissiers
- Historique complet des sessions de caisse