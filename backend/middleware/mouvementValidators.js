const { body, param, validationResult } = require('express-validator');
const mongoose = require('mongoose');

const validatePerte = [
    body('articleId')
        .notEmpty().withMessage("L'ID de l'article est requis.")
        .custom(value => mongoose.isValidObjectId(value)).withMessage("L'ID de l'article est invalide."),
    body('quantite')
        .notEmpty().withMessage("La quantité est requise.")
        .isInt({ min: 1 }).withMessage("La quantité doit être un nombre entier positif."),
    body('raison')
        .notEmpty().withMessage("La raison de la perte est requise.")
        .isIn(['Casse', 'Péremption', 'Vol', 'Autre']).withMessage("La raison de la perte est invalide."),
    body('details')
        .optional()
        .isString().withMessage("Les détails doivent être une chaîne de caractères.")
        .trim()
        .isLength({ max: 255 }).withMessage("Les détails ne doivent pas dépasser 255 caractères."),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, message: "Erreur de validation des données.", errors: errors.array() });
        }
        next();
    }
];

module.exports = {
    validatePerte
};