/**
 * @file mouvementController.js
 * @description Contrôleur des mouvements de stock : consultation, annulation, pertes.
 */

const Mouvement = require('../models/Mouvement');
const articleService = require('../services/articleService');
const mouvementService = require('../services/mouvementService');
const Boutique = require('../models/Boutique');
const auditHelper = require('../utils/auditHelper');
const asyncHandler = require('../middleware/asyncHandler');

exports.getAllMouvements = asyncHandler(async (req, res) => {
    const result = await mouvementService.listerMouvements(req.query, req.user);
    res.status(200).json({ success: true, data: result });
});

exports.cancelMouvement = asyncHandler(async (req, res) => {
    const mvt = await Mouvement.findById(req.params.id);
    if (!mvt) {
        return res.status(404).json({ success: false, message: "Mouvement introuvable." });
    }

    let result;
    if (mvt.type === 'Transfert') {
        result = await articleService.annulerTransfert(req.params.id, req.user);
    } else if (mvt.type === 'Approvisionnement') {
        result = await articleService.annulerApprovisionnement(req.params.id, req.user);
    } else {
        return res.status(400).json({ success: false, message: "Ce type de mouvement ne peut pas être annulé." });
    }
    await auditHelper.logSuccess(req, req.user, 'CANCEL_MOVEMENT', 'Mouvement', req.params.id, { type: mvt.type });
    res.status(200).json({ success: true, data: result });
});

exports.declarerPerte = asyncHandler(async (req, res) => {
    const result = await mouvementService.declarerPerte(req.body, req.user);
    await auditHelper.logSuccess(req, req.user, 'DECLARE_LOSS', 'Mouvement', result._id, { article: req.body.articleId, quantite: req.body.quantite, raison: req.body.raison });
    res.status(201).json({ success: true, data: result });
});

exports.confirmerReception = asyncHandler(async (req, res) => {
    const result = await articleService.confirmerReceptionTransfert(req.params.id, req.user);
    await auditHelper.logSuccess(req, req.user, 'CONFIRM_RECEIPT', 'Mouvement', req.params.id);
    res.status(200).json({ success: true, data: result });
});