const articleRepository = require('../repositories/articleRepository');

exports.creerArticle = async (data) => {
    // 1. Logique métier : Vérification des prix (Point 6 du CDC)
    if (Number(data.prixVente) <= Number(data.prixAchat)) {
        throw new Error("Le prix de vente doit être supérieur au prix d'achat.");
    }
 
    // 2. Préparation des données
    const articleData = {
        nom: data.nom,
        prixAchat: Number(data.prixAchat),
        prixVente: Number(data.prixVente),
        quantite: Number(data.quantite) || 0
    };
 
    // 3. Appel au repository pour l'enregistrement
    return await articleRepository.create(articleData);
};

exports.listerArticles = async () => {
    return await articleRepository.findAll();
};

exports.supprimerArticle = async (id) => {
    // On pourrait ajouter ici une logique pour vérifier si l'article peut être supprimé
    return await articleRepository.deleteById(id);
};

exports.modifierArticle = async (id, data) => {
    // 1. Valider que les données ne sont pas vides
    if (Object.keys(data).length === 0) {
        throw new Error("Données de mise à jour vides.");
    }

    // 2. Récupérer l'article existant pour valider les prix
    const articleExistant = await articleRepository.findById(id);
    if (!articleExistant) {
        throw new Error("Article introuvable.");
    }

    // 3. Logique métier : Vérification des prix
    // On prend le nouveau prix s'il est fourni, sinon on garde l'ancien pour la comparaison.
    const prixVenteFinal = data.prixVente !== undefined ? Number(data.prixVente) : articleExistant.prixVente;
    const prixAchatFinal = data.prixAchat !== undefined ? Number(data.prixAchat) : articleExistant.prixAchat;

    if (prixVenteFinal <= prixAchatFinal) {
        throw new Error("Le prix de vente doit être supérieur au prix d'achat.");
    }

    // 4. Appel au repository pour la mise à jour
    // La fonction findByIdAndUpdate du repo s'occupera de ne mettre à jour que les champs fournis dans `data`
    const articleModifie = await articleRepository.update(id, data);

    return articleModifie;
};