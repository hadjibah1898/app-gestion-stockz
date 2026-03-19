/**
 * Validateurs simples en pur JavaScript (Sans librairie externe)
 */

// --- 1. AUTHENTIFICATION ---
const validateAuth = (req, res, next) => {
    const { email, password, nom } = req.body;
    const errors = [];

    // Regex simple pour email (contient @ et un point)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email || !emailRegex.test(email)) {
        errors.push("L'adresse email est invalide.");
    }

    // Pour le login, on vérifie juste que le password est là. Pour register/create, on vérifie la longueur.
    if (!password || (req.path.includes('register') && password.length < 6)) {
        errors.push("Le mot de passe doit contenir au moins 6 caractères.");
    }

    // Si c'est une inscription (nom présent), on vérifie le nom
    if ((req.path.includes('register') || req.path.includes('create-manager')) && (!nom || nom.trim().length < 2)) {
        errors.push("Le nom est requis (min 2 caractères).");
    }

    if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
    }

    next();
};

// --- 2. ARTICLES ---
const validateArticle = (req, res, next) => {
    const isUpdate = req.method === 'PUT';
    const { nom, prixAchat, prixVente, quantite } = req.body;
    const errors = [];

    if (!isUpdate && (!nom || typeof nom !== 'string' || nom.trim() === '')) {
        errors.push("Le nom de l'article est requis.");
    }

    if (!isUpdate || prixAchat !== undefined) {
        if (prixAchat === undefined || isNaN(prixAchat) || Number(prixAchat) < 0) errors.push("Le prix d'achat doit être un nombre positif.");
    }
    
    if (!isUpdate || prixVente !== undefined) {
        if (prixVente === undefined || isNaN(prixVente) || Number(prixVente) < 0) errors.push("Le prix de vente doit être un nombre positif.");
    }

    if (!isUpdate || quantite !== undefined) {
        if (quantite !== undefined && (isNaN(quantite) || Number(quantite) < 0)) errors.push("La quantité doit être un nombre positif.");
    }

    if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
    }

    next();
};

// --- 3. CLIENTS ---
const validateClient = (req, res, next) => {
    const { nom, email, type } = req.body;
    const errors = [];

    if (!nom || nom.trim().length < 2) errors.push("Le nom du client est requis (min 2 caractères).");
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && email.trim() !== '' && !emailRegex.test(email)) errors.push("L'email est invalide.");

    if (type && !['Client', 'Ouvrier'].includes(type)) errors.push("Le type doit être 'Client' ou 'Ouvrier'.");

    if (errors.length > 0) return res.status(400).json({ success: false, errors });
    next();
};

// --- 4. FOURNISSEURS ---
const validateFournisseur = (req, res, next) => {
    const { nom, telephone, email } = req.body;
    const errors = [];

    if (!nom || nom.trim().length < 2) errors.push("Le nom du fournisseur est requis.");
    if (!telephone || telephone.trim().length < 5) errors.push("Le téléphone est requis.");
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && email.trim() !== '' && !emailRegex.test(email)) errors.push("L'email est invalide.");

    if (errors.length > 0) return res.status(400).json({ success: false, errors });
    next();
};

// --- 5. BOUTIQUES ---
const validateBoutique = (req, res, next) => {
    const { nom, adresse, type } = req.body;
    const errors = [];

    if (!nom || nom.trim().length < 2) errors.push("Le nom de la boutique est requis.");
    if (!adresse || adresse.trim().length < 5) errors.push("L'adresse est requise.");
    if (type && !['Centrale', 'Secondaire'].includes(type)) errors.push("Type de boutique invalide.");

    if (errors.length > 0) return res.status(400).json({ success: false, errors });
    next();
};

// --- 6. TRANSFERTS / STOCK ---
const validateTransfert = (req, res, next) => {
    const { sourceId, targetId, articles } = req.body;
    const errors = [];

    // Si c'est un transfert entre boutiques
    if (req.path.includes('/transfer') && (!sourceId || !targetId)) {
         errors.push("Les boutiques source et destination sont requises.");
    }
    // Si c'est un réapprovisionnement (depuis centrale implicite vers cible)
    if (req.path.includes('/restock') && !targetId) {
         errors.push("La boutique de destination est requise.");
    }

    if (!articles || !Array.isArray(articles) || articles.length === 0) {
        errors.push("La liste d'articles est requise.");
    } else {
        articles.forEach((item, index) => {
            if (!item.articleId) errors.push(`L'article à la ligne ${index + 1} n'a pas d'ID.`);
            if (!item.quantite || isNaN(item.quantite) || Number(item.quantite) <= 0) {
                errors.push(`Quantité invalide pour l'article à la ligne ${index + 1}.`);
            }
        });
    }

    if (errors.length > 0) return res.status(400).json({ success: false, errors });
    next();
};

// --- 7. VENTES ---
const validateVente = (req, res, next) => {
    const { panier, montantPaye, clientId, echeanceDette } = req.body;
    const errors = [];

    if (!panier || !Array.isArray(panier) || panier.length === 0) {
        errors.push("Le panier ne peut pas être vide.");
    } else {
        panier.forEach((item, index) => {
            if (!item.article) errors.push(`L'article est manquant à la ligne ${index + 1}.`);
            if (!item.quantite || isNaN(item.quantite) || Number(item.quantite) <= 0) {
                errors.push(`Quantité invalide pour l'article à la ligne ${index + 1}.`);
            }
        });
    }

    if (montantPaye !== undefined && (isNaN(montantPaye) || Number(montantPaye) < 0)) {
        errors.push("Le montant payé doit être un nombre positif.");
    }
    
    // Validation conditionnelle pour la dette
    if (clientId && typeof clientId !== 'string') errors.push("ID Client invalide.");
    if (echeanceDette && isNaN(Date.parse(echeanceDette))) errors.push("Date d'échéance invalide.");

    if (errors.length > 0) return res.status(400).json({ success: false, errors });
    next();
};

// --- 8. CAISSE (Ouverture, Fermeture, Dépense) ---
const validateOuvertureCaisse = (req, res, next) => {
    const { fondInitial } = req.body;
    if (fondInitial === undefined || isNaN(fondInitial) || Number(fondInitial) < 0) {
        return res.status(400).json({ success: false, errors: ["Le fond initial est requis et doit être positif."] });
    }
    next();
};

const validateFermetureCaisse = (req, res, next) => {
    const { montantCloture } = req.body;
    if (montantCloture === undefined || isNaN(montantCloture) || Number(montantCloture) < 0) {
        return res.status(400).json({ success: false, errors: ["Le montant de clôture est requis et doit être positif."] });
    }
    next();
};

const validateDepense = (req, res, next) => {
    const { montant, motif } = req.body;
    const errors = [];
    if (montant === undefined || isNaN(montant) || Number(montant) <= 0) {
        errors.push("Le montant de la dépense doit être supérieur à 0.");
    }
    if (!motif || typeof motif !== 'string' || motif.trim().length < 3) {
        errors.push("Le motif est requis (min 3 caractères).");
    }
    if (errors.length > 0) return res.status(400).json({ success: false, errors });
    next();
};

module.exports = { 
    validateAuth, 
    validateArticle, 
    validateClient, 
    validateFournisseur, 
    validateBoutique, 
    validateTransfert,
    validateVente,
    validateOuvertureCaisse,
    validateFermetureCaisse,
    validateDepense
};