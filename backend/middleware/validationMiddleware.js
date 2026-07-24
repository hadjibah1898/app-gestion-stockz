/**
 * @file validationMiddleware.js
 * @description validationMiddleware - middleware
 */

const Article = require('../models/Article');
const Boutique = require('../models/Boutique');
const Fournisseur = require('../models/Fournisseur');

/**
 * Helper pour valider le format MongoDB ObjectId
 */
const isValidObjectId = (id) => {
    return /^[0-9a-fA-F]{24}$/.test(id);
};

/**
 * Factory pour créer des middlewares de validation basés sur un schéma.
 * Imite une partie de la syntaxe de Joi avec du JavaScript pur.
 */
const createValidator = (schema) => (req, res, next) => {
    const data = req.body;
    const errors = {};

    for (const field in schema) {
        const rules = schema[field];
        const value = data[field];

        // 1. Vérification Requis
        if (rules.required && (value === undefined || value === null || value === '')) {
            errors[field] = `Le champ "${field}" est obligatoire.`;
            continue; // Passer au champ suivant si requis et manquant
        }

        // Si la valeur est présente (ou non requise), on applique les autres règles
        if (value !== undefined && value !== null && value !== '') {
            // 2. Vérification du Type
            if (rules.type === 'string') {
                if (typeof value !== 'string') {
                    errors[field] = `Le champ "${field}" doit être une chaîne de caractères.`;
                } else if (rules.min !== undefined && value.length < rules.min) {
                    errors[field] = `Le champ "${field}" doit avoir au moins ${rules.min} caractères.`;
                } else if (rules.max !== undefined && value.length > rules.max) {
                    errors[field] = `Le champ "${field}" doit avoir au maximum ${rules.max} caractères.`;
                }
            } else if (rules.type === 'number') {
                const numValue = Number(value);
                if (isNaN(numValue)) {
                    errors[field] = `Le champ "${field}" doit être un nombre.`;
                } else if (rules.min !== undefined && Number(value) < rules.min) {
                    errors[field] = `Le champ "${field}" doit être au minimum ${rules.min}.`;
                } else if (rules.max !== undefined && Number(value) > rules.max) {
                    errors[field] = `Le champ "${field}" doit être au maximum ${rules.max}.`;
                }
            } else if (rules.type === 'boolean') {
                if (typeof value !== 'boolean') {
                    errors[field] = `Le champ "${field}" doit être un booléen.`;
                }
            } else if (rules.type === 'date') {
                if (new Date(value).toString() === 'Invalid Date') {
                    errors[field] = `Le champ "${field}" doit être une date valide.`;
                }
            } else if (rules.type === 'objectId') {
                if (!isValidObjectId(value)) {
                    errors[field] = `Le champ "${field}" doit être un identifiant valide.`;
                }
            }

            // 3. Vérification des règles spécifiques (ex: enum)
            if (rules.enum && !rules.enum.includes(value)) {
                errors[field] = `Le champ "${field}" doit être l'une des valeurs suivantes : ${rules.enum.join(', ')}.`;
            }
        }
    }

    // Si des erreurs existent, on bloque la requête
    if (Object.keys(errors).length > 0) {
        return res.status(400).json({
            message: "Erreur de validation des données",
            errors: errors
        });
    }

    // Tout est OK, on passe au contrôleur suivant
    next();
};

// --- Définition des schémas spécifiques ---

const articleSchema = {
    nom: { type: 'string', required: true, min: 2, max: 100 },
    prixAchat: { type: 'number', required: true, min: 0 },
    prixVente: { type: 'number', required: true, min: 0 },
    boutique: { type: 'objectId', required: true },
    quantite: { type: 'number', min: 0 }, // La quantité peut être 0 pour un nouvel article sans stock initial
    categorie: { type: 'string', min: 1, max: 50 },
    code: { type: 'string', min: 1, max: 50 },
    image: { type: 'string' }, // Base64 string peut être très long, pas de max length ici
    promo: { type: 'number', min: 0, max: 100 },
    promoActive: { type: 'boolean' },
    dateDebutPromo: { type: 'date' },
    dateFinPromo: { type: 'date' },
    remise: { type: 'number', min: 0, max: 100 },
    datePeremption: { type: 'date' }
};

// Logique métier spécifique à l'article (prix de vente vs prix d'achat)
const validateArticleBusinessLogic = async (req, res, next) => {
    const data = req.body;
    const errors = {};

    if (Number(data.prixVente) < Number(data.prixAchat)) {
        errors.prixVente = "Le prix de vente ne peut pas être inférieur au prix d'achat.";
    }

    // Vérification de l'impact de la remise sur la rentabilité
    if (data.remise !== undefined && data.remise > 0) {
        const prixRemise = Number(data.prixVente) * (1 - Number(data.remise) / 100);
        if (prixRemise < Number(data.prixAchat)) {
            errors.remise = `La remise de ${data.remise}% rend le prix de vente (${prixRemise.toLocaleString('fr-FR')} GNF) inférieur au prix d'achat.`;
        }
    }

    // Validation de la date de péremption : ne peut pas être dans le passé
    if (data.datePeremption) {
        const peremptionDate = new Date(data.datePeremption);
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normaliser à minuit pour comparer uniquement la date
        if (peremptionDate < today) {
            errors.datePeremption = "La date de péremption ne peut pas être dans le passé.";
        }
    }

    // Validation des pourcentages
    if (data.promo !== undefined && (data.promo < 0 || data.promo > 100)) errors.promo = "La promotion doit être entre 0 et 100%.";
    if (data.remise !== undefined && (data.remise < 0 || data.remise > 100)) errors.remise = "La remise doit être entre 0 et 100%.";

    // Validation de la cohérence de l'intervalle de promotion
    if (data.promoActive && data.dateDebutPromo && data.dateFinPromo) {
        const start = new Date(data.dateDebutPromo);
        const end = new Date(data.dateFinPromo);
        if (end < start) {
            errors.dateFinPromo = "La date de fin de promotion ne peut pas être antérieure à la date de début.";
        }
    }

    // Validation de l'existence de la boutique
    if (data.boutique) {
        try {
            const boutiqueExists = await Boutique.findById(data.boutique);
            if (!boutiqueExists) {
                errors.boutique = "La boutique spécifiée est introuvable.";
            }
        } catch (err) {
            errors.boutique = "L'identifiant de boutique fourni est invalide.";
        }
    }

    // Validation de l'existence du fournisseur
    if (data.fournisseur) {
        try {
            const fournisseurExists = await Fournisseur.findById(data.fournisseur);
            if (!fournisseurExists) {
                errors.fournisseur = "Le fournisseur spécifié est introuvable.";
            }
        } catch (err) {
            errors.fournisseur = "L'identifiant de fournisseur fourni est invalide.";
        }
    }

    // Vérification de l'unicité du Code (Global sur tout le système)
    if (data.code && data.code.trim() !== '') {
        try {
            const duplicateCode = await Article.findOne({
                code: data.code.trim(),
                _id: { $ne: req.params.id } // Ignorer l'article actuel en cas de modification
            });
            if (duplicateCode) {
                errors.code = "Ce code article (référence) est déjà utilisé par un autre produit.";
            }
        } catch (err) {
            return res.status(500).json({ message: "Erreur lors de la vérification de l'unicité du code." });
        }
    }

    // Vérification des doublons (Nom + Boutique)
    if (data.nom && data.boutique) {
        try {
            const duplicate = await Article.findOne({
                nom: { $regex: new RegExp(`^${data.nom.trim()}$`, 'i') },
                boutique: data.boutique,
                _id: { $ne: req.params.id } // Exclure l'article actuel lors d'une mise à jour
            });
            if (duplicate) {
                errors.nom = "Un article avec ce nom existe déjà dans cette boutique.";
            }
        } catch (err) {
            return res.status(500).json({ message: "Erreur lors de la vérification des doublons." });
        }
    }

    // Si des erreurs existent, on bloque la requête
    if (Object.keys(errors).length > 0) {
        return res.status(400).json({
            message: "Erreur de validation des données de l'article",
            errors: errors
        });
    }

    // Tout est OK, on passe au contrôleur
    next();
};

const boutiqueSchema = {
    nom: { type: 'string', required: true, min: 3, max: 50 },
    adresse: { type: 'string', required: true, min: 5, max: 100 },
    type: { type: 'string', required: true, enum: ['Centrale', 'Secondaire'] },
    // Nouveaux champs pour les paiements numériques
    orangeMoneyQrCode: { type: 'string' },
    orangeMoneyAccount: { type: 'string', max: 50 },
    mobicashQrCode: { type: 'string' },
    mobicashAccount: { type: 'string', max: 50 },
    paycardQrCode: { type: 'string' },
    paycardAccount: { type: 'string', max: 50 }
};

const clientSchema = {
    nom: { type: 'string', required: true, min: 2, max: 50 },
    telephone: { type: 'string', min: 8, max: 20 },
    adresse: { type: 'string', max: 100 },
    type: { type: 'string', enum: ['Client', 'Ouvrier'] },
    commission: { type: 'number', min: 0, default: 0 }
};

// --- Middlewares de validation spécifiques exportés ---

module.exports = {
    validateArticle: createValidator(articleSchema), // Validation générique de l'article
    validateArticleBusinessLogic, // Logique métier spécifique à l'article
    validateBoutique: createValidator(boutiqueSchema),
    validateClient: createValidator(clientSchema),
    createValidator // Exporter la factory si on veut créer des validateurs à la volée ailleurs
};