# TODO — Paramètres CRM : Seuils de niveau & Segmentation configurables

## Objectif
Rendre les seuils de niveau (Argent/Or/Platine) ET les critères de segmentation (Fidèle/Actif/À risque/Perdu) du CRM configurables par l'utilisateur, stockés dans la collection `Setting`.

## Backend — Niveaux (fait)
- [x] `clientController.js` : helper `getCrmSettings()` qui lit les seuils depuis `Setting` (défaut : Argent=250000, Or=1000000, Platine=5000000)
- [x] `clientController.js` : modifier `getCrmAnalytics` pour calculer le niveau à partir des seuils configurables
- [x] `clientController.js` : ajouter `getCrmSettings` (lecture) et `updateCrmSettings` (sauvegarde)
- [x] `clientRoutes.js` : ajouter `GET /crm/settings` et `PUT /crm/settings`

## Backend — Segmentation (fait)
- [x] `clientController.js` : helper `getSegmentationSettings()` qui lit les paramètres depuis `Setting` (défaut : joursActif=30, joursRisque=60, minAchatsFidele=4)
- [x] `clientController.js` : modifier `getCrmAnalytics` pour calculer la segmentation à partir des paramètres configurables
- [x] `clientController.js` : ajouter `getSegmentationSettings` et `updateSegmentationSettings`
- [x] `clientRoutes.js` : ajouter `GET /crm/segmentation-settings` et `PUT /crm/segmentation-settings`

## Frontend — Niveaux (fait)
- [x] `api.js` : ajouter `getCrmSettings()` et `updateCrmSettings(data)`
- [x] `CrmDashboard.js` : bouton ⚙️ Niveaux + modale (3 champs : Seuil Argent/Or/Platine) + sauvegarde
- [x] `CrmDashboard.css` : styles pour la modale / bouton paramètres

## Frontend — Segmentation (fait)
- [x] `api.js` : ajouter `getSegmentationSettings()` et `updateSegmentationSettings(data)`
- [x] `CrmDashboard.js` : bouton "Segmentation" + modale (3 champs : Jours actif, Jours risque, Min achats fidèle) + sauvegarde
- [x] `CrmDashboard.css` : badges de segmentation (fidele/actif/risque/perdu)

## Vérification
- [x] Syntaxe backend (`node -c`)
- [x] Lint frontend (`eslint CrmDashboard.js` — EXIT_CODE=0)
- [ ] Compilation frontend (`react-scripts build`)
