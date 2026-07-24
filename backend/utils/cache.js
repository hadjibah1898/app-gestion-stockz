const NodeCache = require("node-cache");

// Cache pour les détails de la boutique, expire après 5 minutes (300 secondes)
// Vous pouvez ajuster ce TTL (Time To Live) en fonction de la fréquence de modification des données de la boutique.
const boutiqueCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

const CACHE_KEYS = {
    // Clé pour les détails d'une boutique spécifique
    BOUTIQUE_DETAILS: (id) => `boutique_details_${id}`,
};

exports.setBoutiqueDetails = (id, data) => {
    boutiqueCache.set(CACHE_KEYS.BOUTIQUE_DETAILS(id), data);
};

exports.getBoutiqueDetails = (id) => {
    return boutiqueCache.get(CACHE_KEYS.BOUTIQUE_DETAILS(id));
};

exports.delBoutiqueDetails = (id) => {
    boutiqueCache.del(CACHE_KEYS.BOUTIQUE_DETAILS(id));
};

// Nouvelle méthode pour vider tout le cache des boutiques
exports.flushBoutiqueCache = () => {
    boutiqueCache.flushAll();
    console.log("Boutique cache flushed.");
};