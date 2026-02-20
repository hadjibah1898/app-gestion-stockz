const Fournisseur = require('../models/Fournisseur');
const Article = require('../models/Article');
const Boutique = require('../models/Boutique');
const Mouvement = require('../models/Mouvement');

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
        const fournisseurs = await Fournisseur.find().sort({ createdAt: -1 });
        res.status(200).json(fournisseurs);
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
        await Fournisseur.findByIdAndDelete(req.params.id);
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
        const centrale = await Boutique.findOne({ type: 'Centrale' });
        if (!centrale) {
            return res.status(404).json({ message: "Aucune Boutique Centrale configurée. Impossible d'approvisionner." });
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
                boutique: centrale._id 
            });

            if (article) {
                // Mise à jour du stock et du prix d'achat
                article.quantite += quantiteAjout;
                article.prixAchat = item.prixAchat;
                // On met à jour le prix de vente seulement s'il est fourni et différent
                if (item.prixVente) article.prixVente = item.prixVente;
                
                await article.save();
                articlesMisAJour++;
            } else {
                // Création d'un nouvel article dans la CENTRALE
                await Article.create({
                    nom: item.nom,
                    prixAchat: item.prixAchat,
                    prixVente: item.prixVente || (item.prixAchat * 1.2), // Marge par défaut si non fourni
                    quantite: quantiteAjout,
                    boutique: centrale._id
                });
                articlesCrees++;
            }
        }

        // Enregistrer le mouvement de stock
        await Mouvement.create({
            type: 'Approvisionnement',
            fournisseur: fournisseur._id,
            boutiqueDestination: centrale._id,
            articles: items.map(i => ({ nomArticle: i.nom, quantite: i.quantite })),
            operateur: req.user.id,
            details: `Depuis fournisseur ${fournisseur.nom}`
        });

        res.status(200).json({ 
            message: `Approvisionnement réussi vers ${centrale.nom}.`,
            details: `${articlesCrees} nouveaux articles, ${articlesMisAJour} mis à jour.`
        });

    } catch (error) {
        console.error("Erreur approvisionnement:", error);
        res.status(500).json({ message: "Erreur lors de l'approvisionnement", error: error.message });
    }
};