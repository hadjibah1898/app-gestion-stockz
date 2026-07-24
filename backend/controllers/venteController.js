/**
 * @file venteController.js
 * @description Contrôleur des ventes : création, historique, annulation, statut de groupe.
 */

const venteService = require('../services/venteService');
const auditHelper = require('../utils/auditHelper');
const asyncHandler = require('../middleware/asyncHandler');

/**
 * Récupère l'historique des ventes avec filtres
 */
exports.getHistorique = asyncHandler(async (req, res) => {
    const result = await venteService.listerVentes(req.query, req.user);
    res.status(200).json({ success: true, data: result });
});

/**
 * Crée une nouvelle vente ou commande
 */
exports.createVente = asyncHandler(async (req, res) => {
    const { panier, clientId, montantPaye, echeanceDette, ouvertureCaisseId, modePaiement, transactionRef, numeroTable } = req.body;
    const boutiqueId = req.user.boutique?._id || req.user.boutique;
    
    // Note: traiterPanier devrait idéalement accepter un objet d'options au lieu d'arguments positionnels
    const result = await venteService.traiterPanier(
        panier, 
        req.user, 
        boutiqueId, 
        false, // hasRemise (recalculé par le service)
        clientId, 
        montantPaye, 
        echeanceDette, 
        ouvertureCaisseId, 
        req, 
        modePaiement, 
        transactionRef, 
        numeroTable
    );
    res.status(201).json({ success: true, data: result });
});

/**
 * Met à jour le statut d'un groupe (table) : préparation ou encaissement
 */
exports.updateGroupStatus = asyncHandler(async (req, res) => {
    const { orderGroupId } = req.params;
    const { status, modePaiement, transactionRef, itemIds } = req.body;

    if (!orderGroupId || !status) {
        return res.status(400).json({ success: false, message: "L'identifiant du groupe et le statut sont requis." });
    }

    // Suppression du log d'audit ici car venteService.updateGroupStatus 
    // gère déjà des logs plus granulaires (FINALIZE_GROUP ou CANCEL_GROUP)
    const result = await venteService.updateGroupStatus(orderGroupId, status, req.user, req, modePaiement, transactionRef, itemIds);

    res.status(200).json({ success: true, data: result });
});

/**
 * Annule une vente individuelle
 */
exports.cancelVente = asyncHandler(async (req, res) => {
    const result = await venteService.annulerVente(req.params.id, req.user, req);
    res.status(200).json({ success: true, data: result });
});