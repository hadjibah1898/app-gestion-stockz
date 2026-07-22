/**
 * @file fournisseurController.js
 * @description Contrôleur fournisseurs : CRUD et approvisionnement de la centrale.
 */

const Fournisseur = require('../models/Fournisseur');
const Article = require('../models/Article');
const Boutique = require('../models/Boutique');
const Mouvement = require('../models/Mouvement');
const auditHelper = require('../utils/auditHelper');
const asyncHandler = require('../middleware/asyncHandler');
const mongoose = require('mongoose');

// --- CRUD Fournisseur ---

exports.createFournisseur = asyncHandler(async (req, res) => {
    const fournisseur = await Fournisseur.create({
        ...req.body,
        createur: req.user.id
    });
    await auditHelper.logSuccess(req, req.user, 'CREATE_SUPPLIER', 'Fournisseur', fournisseur._id);
    res.status(201).json({ success: true, data: fournisseur });
});

exports.getAllFournisseurs = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page);
    const limit = parseInt(req.query.limit) || 10;
    const { search } = req.query;
    const query = {};

    if (req.user.role === 'Admin') {
        query.createur = req.user.id;
    }

    if (search) {
        query.nom = { $regex: search, $options: 'i' };
    }

    if (page) {
        const skip = (page - 1) * limit;
        const total = await Fournisseur.countDocuments(query);
        const fournisseurs = await Fournisseur.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
        
        res.status(200).json({
            success: true,
            data: fournisseurs,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            totalCount: total
        });
    } else {
        const fournisseurs = await Fournisseur.find(query).sort({ createdAt: -1 }).lean();
        res.status(200).json({ success: true, data: fournisseurs });
    }
});

exports.updateFournisseur = asyncHandler(async (req, res) => {
    const fournisseurCheck = await Fournisseur.findById(req.params.id);
    if (!fournisseurCheck) return res.status(404).json({ message: "Fournisseur introuvable" });

    if (req.user.role === 'Admin' && fournisseurCheck.createur?.toString() !== req.user.id.toString()) {
        return res.status(403).json({ message: "Accès refusé : ce fournisseur ne vous appartient pas." });
    }
    const fournisseur = await Fournisseur.findByIdAndUpdate(req.params.id, req.body, { new: true });
    await auditHelper.logSuccess(req, req.user, 'UPDATE_SUPPLIER', 'Fournisseur', fournisseur._id, { before: fournisseurCheck, after: fournisseur });
    res.status(200).json({ success: true, data: fournisseur });
});

exports.deleteFournisseur = asyncHandler(async (req, res) => {
    const fournisseurId = req.params.id;
    const fournisseurCheck = await Fournisseur.findById(fournisseurId);
    if (!fournisseurCheck) return res.status(404).json({ message: "Fournisseur introuvable" });

    if (req.user.role === 'Admin' && fournisseurCheck.createur?.toString() !== req.user.id.toString()) {
        return res.status(403).json({ message: "Accès refusé : ce fournisseur ne vous appartient pas." });
    }

    const articleCount = await Article.countDocuments({ fournisseur: fournisseurId });
    if (articleCount > 0) {
        return res.status(400).json({ message: `Impossible de supprimer ce fournisseur, il est lié à ${articleCount} article(s).` });
    }

    await Fournisseur.findByIdAndDelete(fournisseurId);
    await auditHelper.logSuccess(req, req.user, 'DELETE_SUPPLIER', 'Fournisseur', fournisseurId);
    res.status(200).json({ success: true, message: "Fournisseur supprimé" });
});

// --- LOGIQUE D'APPROVISIONNEMENT (Cœur de la demande) ---

exports.approvisionnerCentrale = asyncHandler(async (req, res) => {
        const { fournisseurId, items, imageJustificatif, referenceFournisseur, dateReception } = req.body; 

        const fournisseur = await Fournisseur.findById(fournisseurId);
        if (!fournisseur) {
            return res.status(404).json({ message: "Fournisseur introuvable." });
        }

        if (!items || items.length === 0) {
            return res.status(400).json({ message: "La liste d'approvisionnement est vide." });
        }

        // 1. Trouver la Boutique Centrale
        // SÉCURITÉ : On cherche la centrale de l'administrateur connecté uniquement
        const depotPrincipal = await Boutique.findOne({ type: 'Centrale', createur: req.user.id });
        if (!depotPrincipal) {
            return res.status(404).json({ message: "Aucun Dépôt Principal n'est configuré. Impossible d'approvisionner." });
        }

        let articlesMisAJour = 0;
        let articlesCrees = 0;

        for (const item of items) {
            const quantiteAjout = Number(item.quantite);
            if (quantiteAjout <= 0) continue;

            // Validation Backend : Le prix de vente, s'il est fourni, doit être supérieur au prix d'achat.
            const prixAchat = Number(item.prixAchat);
            const prixVente = Number(item.prixVente);
            if (prixVente > 0 && prixAchat >= prixVente) {
                // On retourne une erreur 400 (Bad Request) qui sera affichée sur le frontend
                return res.status(400).json({ message: `Pour l'article "${item.nom}", le prix de vente (${prixVente} GNF) doit être supérieur au prix d'achat (${prixAchat} GNF).` });
            }

            // Chercher si l'article existe déjà dans la CENTRALE
            let article = await Article.findOne({ 
                nom: item.nom, 
                boutique: depotPrincipal._id 
            });

            if (article) {
                // Mise à jour du stock et du prix d'achat
                article.quantite += quantiteAjout;
                article.prixAchat = item.prixAchat;
                // On met à jour le prix de vente seulement s'il est fourni et différent
                if (item.prixVente) article.prixVente = item.prixVente;
                if (item.image) article.image = item.image; // Sauvegarder l'image si elle est fournie
                if (item.code) article.code = item.code;
                if (item.type) article.type = item.type;
                if (item.datePeremption) article.datePeremption = item.datePeremption;
                article.fournisseur = fournisseurId; // Lier le fournisseur à l'article existant
                
                await article.save();
                articlesMisAJour++;
            } else {
                // Création d'un nouvel article dans la CENTRALE
                await Article.create({
                    nom: item.nom,
                    code: item.code,
                    type: item.type,
                    image: item.image, // Sauvegarder l'image
                    prixAchat: item.prixAchat,
                    prixVente: item.prixVente || (item.prixAchat * 1.2), // Marge par défaut si non fourni
                    quantite: quantiteAjout,
                    boutique: depotPrincipal._id,
                    fournisseur: fournisseurId, // Lier le fournisseur au nouvel article
                    datePeremption: item.datePeremption
                });
                articlesCrees++;

                // Ajouter le nouveau produit à la liste des produits proposés par le fournisseur s'il n'y est pas déjà (INSENSIBLE A LA CASSE)
                const productNameLower = item.nom.toLowerCase().trim();
                const produitExisteDeja = fournisseur.produitsProposes.some(produitPropose => {
                    if (typeof produitPropose === 'string') {
                        return produitPropose.toLowerCase() === productNameLower;
                    }
                    return false;
                });

                if (!produitExisteDeja) {
                    fournisseur.produitsProposes.push(item.nom.trim());
                }
            }
        }

        // Sauvegarder le fournisseur si sa liste de produits a été modifiée
        await fournisseur.save();

        // Enregistrer le mouvement de stock
        const dateReceptionFormatted = dateReception ? new Date(dateReception).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR');
        const movement = await Mouvement.create({
            type: 'Approvisionnement',
            fournisseur: fournisseur._id,
            boutiqueDestination: depotPrincipal._id,
            imageJustificatif: imageJustificatif,
            nomTransporteur: referenceFournisseur, // On utilise ce champ ou un nouveau pour le BL
            articles: items.map(i => ({ 
                nomArticle: i.nom, 
                quantite: i.quantite, 
                prixAchatUnitaire: i.prixAchat,
                prixVenteUnitaire: i.prixVente || (i.prixAchat * 1.2)
            })),
            operateur: req.user.id,
            details: `Réception BL N°${referenceFournisseur || 'N/A'} du ${dateReceptionFormatted}`
        });

        const populatedMovement = await Mouvement.findById(movement._id).populate('fournisseur boutiqueDestination operateur');

        await auditHelper.logSuccess(req, req.user, 'SUPPLY_STOCK', 'Fournisseur', fournisseurId, { items, created: articlesCrees, updated: articlesMisAJour });

        res.status(200).json({ 
            message: `Approvisionnement réussi vers ${depotPrincipal.nom}.`,
            details: `${articlesCrees} nouveaux articles, ${articlesMisAJour} mis à jour.`,
            movement: populatedMovement
        });
});