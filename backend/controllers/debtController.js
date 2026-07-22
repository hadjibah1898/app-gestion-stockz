/**
 * @file debtController.js
 * @description debtController - controllers
 */

const mongoose = require('mongoose');
const Client = require('../models/Client');
const OuvertureCaisse = require('../models/OuvertureCaisse');
const DebtPayment = require('../models/DebtPayment');
const DebtMovement = require('../models/DebtMovement');
const asyncHandler = require('../middleware/asyncHandler');
const auditHelper = require('../utils/auditHelper');

// Helper to safely convert Decimal128 to number
const toNum = (val) => {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') return parseFloat(val) || 0;
    if (typeof val === 'object' && val.constructor.name === 'Decimal128') {
        return parseFloat(val.toString());
    }
    if (typeof val === 'object' && val.$numberDecimal) return parseFloat(val.$numberDecimal);
    return 0;
};

/**
 * @desc    Rembourser une dette (depuis l'écran de gestion des créances)
 * @route   POST /api/clients/:id/pay-dette
 * @access  Private (Gérant)
 */
exports.payDette = asyncHandler(async (req, res) => {
    // 0. Restriction : Seul le gérant effectue les recouvrements
    if (req.user.role !== 'Gérant') {
        return res.status(403).json({ success: false, message: "Action interdite : Seul un gérant peut encaisser un remboursement." });
    }

    const { montant, modePaiement, transactionRef, commentaire } = req.body;
    const clientId = req.params.id;

    // 2. Vérification de la caisse (obligatoire pour la traçabilité)
    if (!req.ouvertureCaisse) {
        return res.status(403).json({ success: false, message: "Action refusée : Aucune session de caisse ouverte." });
    }
    const ouvertureCaisseId = req.ouvertureCaisse._id;

    // 1. Validation de l'entrée
    const montantRembourse = parseFloat(montant);
    if (!montantRembourse || montantRembourse <= 0) {
        throw new Error("Le montant saisi est invalide.");
    }

    // 3. Récupération et vérification du client
    const client = await Client.findById(clientId);
    if (!client) {
        return res.status(404).json({ success: false, message: "Client introuvable." });
    }

    const clientDetteNum = toNum(client.dette);
    if (montantRembourse > (clientDetteNum + 0.01)) { // Marge d'erreur pour les flottants
        return res.status(400).json({ success: false, message: `Le montant dépasse la dette actuelle (${clientDetteNum.toFixed(2)}).` });
    }

    // 4. Mise à jour du client
    const soldeAnterieur = client.dette;
    client.dette -= montantRembourse;
    await client.save();

    // 5. Création de la pièce de paiement
    const newPayment = await DebtPayment.create({
        client: clientId,
        montant: montantRembourse,
        gerant: req.user.id,
        boutique: req.user.boutique,
        ouvertureCaisse: ouvertureCaisseId,
        modePaiement: modePaiement || 'Cash',
        transactionRef: transactionRef,
        commentaire: commentaire || "Remboursement de dette"
    });

    // 6. Mise à jour de la caisse sessionnelle
    await OuvertureCaisse.findByIdAndUpdate(ouvertureCaisseId, { $inc: { totalRecouvrements: montantRembourse } });

    // 7. Historique des mouvements (Audit)
    await DebtMovement.create({
        client: clientId,
        boutique: req.user.boutique,
        type: 'REMBOURSEMENT',
        montant: montantRembourse,
        soldeAnterieur: toNum(soldeAnterieur),
        nouveauSolde: toNum(client.dette),
        operateur: req.user.id
    });

    await auditHelper.logSuccess(req, req.user, 'DEBT_PAYMENT', 'Client', clientId, { montant: montantRembourse, mode: modePaiement });

    res.status(200).json({
        success: true,
        data: {
            soldeAnterieur: toNum(soldeAnterieur), // CORRECTION : Envoyer l'ancien solde au frontend
            nouveauSolde: toNum(client.dette),
            paiement: newPayment.toObject()
        }
    });
});