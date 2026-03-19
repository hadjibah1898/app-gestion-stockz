const Fournisseur = require('../models/Fournisseur');
const Article = require('../models/Article');
const Boutique = require('../models/Boutique');
const Mouvement = require('../models/Mouvement');
const { logAction } = require('../services/auditLogService');

// --- CRUD Fournisseur ---

exports.createFournisseur = async (req, res) => {
    try {
        const fournisseur = await Fournisseur.create(req.body);
        res.status(201).json(fournisseur);
    } catch (error) {
        res.status(400).json({ message: "Erreur création fournisseur", error: error.message });
    }
};

exports.getAllFournisseurs = async (req, res) => {
    try {
        const page = parseInt(req.query.page);
        const limit = parseInt(req.query.limit) || 10;
        const { search } = req.query;
        const query = {};

        if (search) {
            query.nom = { $regex: search, $options: 'i' };
        }

        if (page) {
            const skip = (page - 1) * limit;
            const total = await Fournisseur.countDocuments(query);
            const fournisseurs = await Fournisseur.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
            
            res.status(200).json({
                data: fournisseurs,
                totalPages: Math.ceil(total / limit),
                currentPage: page,
                totalCount: total
            });
        } else {
            const fournisseurs = await Fournisseur.find(query).sort({ createdAt: -1 });
            res.status(200).json(fournisseurs);
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateFournisseur = async (req, res) => {
    try {
        const fournisseur = await Fournisseur.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(fournisseur);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.deleteFournisseur = async (req, res) => {
    try {
        const fournisseurId = req.params.id;

        // Vérifier si des articles sont liés à ce fournisseur
        const articleCount = await Article.countDocuments({ fournisseur: fournisseurId });
        if (articleCount > 0) {
            return res.status(400).json({ message: `Impossible de supprimer ce fournisseur, il est lié à ${articleCount} article(s). Veuillez d'abord réassigner ces articles à un autre fournisseur.` });
        }

        await Fournisseur.findByIdAndDelete(fournisseurId);
        res.status(200).json({ message: "Fournisseur supprimé" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- LOGIQUE D'APPROVISIONNEMENT (Cœur de la demande) ---

exports.approvisionnerCentrale = async (req, res) => {
    try {
        const { fournisseurId, items } = req.body; // items = [{ nom, quantite, prixAchat, prixVente }]

        const fournisseur = await Fournisseur.findById(fournisseurId);
        if (!fournisseur) {
            return res.status(404).json({ message: "Fournisseur introuvable." });
        }

        if (!items || items.length === 0) {
            return res.status(400).json({ message: "La liste d'approvisionnement est vide." });
        }

        // 1. Trouver la Boutique Centrale
        const depotPrincipal = await Boutique.findOne({ type: 'Centrale' });
        if (!depotPrincipal) {
            return res.status(404).json({ message: "Aucun Dépôt Principal n'est configuré. Impossible d'approvisionner." });
        }

        let articlesMisAJour = 0;
        let articlesCrees = 0;

        for (const item of items) {
            const quantiteAjout = parseInt(item.quantite);
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
        await Mouvement.create({
            type: 'Approvisionnement',
            fournisseur: fournisseur._id,
            boutiqueDestination: depotPrincipal._id,
            articles: items.map(i => ({ nomArticle: i.nom, quantite: i.quantite })),
            operateur: req.user.id,
            details: `Depuis fournisseur ${fournisseur.nom}`
        });

        await logAction({
            req,
            user: req.user,
            action: 'SUPPLY_STOCK',
            entity: 'Fournisseur',
            entityId: fournisseurId,
            details: { items, created: articlesCrees, updated: articlesMisAJour },
            status: 'SUCCESS'
        });

        res.status(200).json({ 
            message: `Approvisionnement réussi vers ${depotPrincipal.nom}.`,
            details: `${articlesCrees} nouveaux articles, ${articlesMisAJour} mis à jour.`
        });

    } catch (error) {
        console.error("Erreur approvisionnement:", error);
        res.status(500).json({ message: "Erreur lors de l'approvisionnement", error: error.message });
    }
};