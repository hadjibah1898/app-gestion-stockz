/**
 * @file validateObjectId.js
 * @description validateObjectId - middleware
 */

const mongoose = require('mongoose');

/**
 * Middleware pour valider les IDs MongoDB dans les paramètres d'URL
 * @param {...string} params - Liste des noms de paramètres à valider (ex: 'id', 'boutiqueId')
 */
const validateObjectId = (...params) => (req, res, next) => {
    for (const param of params) {
        const id = req.params[param];
        if (id && !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: `L'identifiant fourni pour '${param}' n'est pas valide.` });
        }
    }
    next();
};

module.exports = validateObjectId;