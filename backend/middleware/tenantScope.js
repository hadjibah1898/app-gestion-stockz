/**
 * ============================================================
 *  tenantScope.js — Isolation multi-tenant centralisée
 * ============================================================
 *  Objectif : garantir qu'un Admin (ou sa hiérarchie) ne peut
 *  JAMAIS accéder / créer / modifier des données d'une autre
 *  organisation (un autre Admin).
 *
 *  Principe :
 *    - L'identité d'une organisation est le `createur` = l'Admin
 *      (ou AdminBar) qui a créé les boutiques.
 *    - Un Admin est propriétaire de ses boutiques (Boutique.createur).
 *    - Gérants/Serveurs/Caissiers sont rattachés à une boutique.
 *    - SuperAdmin voit tout (accès total).
 *
 *  Helpers exportés :
 *    - isAdminLike(user)        : rôle Admin/AdminBar
 *    - isSuperAdmin(user)       : rôle SuperAdmin
 *    - getTenantFilter(user)    : le filtre MongoDB à appliquer (lecture)
 *    - getUserBoutiqueIds(user) : les _id des boutiques du tenant
 *    - assertBoutiqueBelongsToAdmin(user, boutiqueId) : lève une
 *      erreur 403 si la boutique n'appartient pas à l'Admin
 *    - assertArticleInTenant(user, boutiqueId) : alias (contexte boutique)
 * ============================================================
 */

const Boutique = require('../models/Boutique');

const ADMIN_ROLES = ['Admin', 'AdminBar'];
const STAFF_ROLES = ['Gérant', 'GérantBar', 'Serveur', 'ServeurBar', 'Caissier'];

const isAdminLike = (user) => Boolean(user) && ADMIN_ROLES.includes(user.role);
const isSuperAdmin = (user) => Boolean(user) && user.role === 'SuperAdmin';
const isStaff = (user) => Boolean(user) && STAFF_ROLES.includes(user.role);

/**
 * Retourne les _id des boutiques appartenant au tenant (Admin).
 * Pour un staff, retourne sa boutique unique. Pour un SuperAdmin,
 * retourne [] (accès illimité).
 */
async function getUserBoutiqueIds(user) {
    if (!user) return [];
    if (isSuperAdmin(user)) return []; // accès total
    if (isAdminLike(user)) {
        const boutiques = await Boutique.find({ createur: user.id || user._id }).select('_id').lean();
        return boutiques.map(b => b._id);
    }
    if (isStaff(user) && user.boutique) {
        return [user.boutique?._id || user.boutique];
    }
    return [];
}

/**
 * Construit le filtre de lecture MongoDB à appliquer sur les
 * collections "tenant-scopées" (Article, Vente, Mouvement, ...).
 */
async function getTenantFilter(user) {
    if (!user || isSuperAdmin(user)) return {};
    const ids = await getUserBoutiqueIds(user);
    if (ids.length === 0) return { boutique: { $in: [] } }; // aucun résultat
    return { boutique: { $in: ids } };
}

/**
 * Vérifie qu'une boutique appartient bien à l'Admin connecté.
 * Lève une erreur (403) sinon. Ne fait rien pour SuperAdmin.
 */
async function assertBoutiqueBelongsToAdmin(user, boutiqueId) {
    if (!boutiqueId) {
        const err = new Error('La boutique est requise.');
        err.statusCode = 400;
        throw err;
    }
    if (isSuperAdmin(user)) return; // l'accès total
    if (!isAdminLike(user)) {
        // Le staff passe par sa propre boutique
        const userBoutiqueId = (user.boutique?._id || user.boutique || '').toString();
        if (userBoutiqueId === boutiqueId.toString()) return;
        const err = new Error('Accès refusé : boutique non autorisée pour votre compte.');
        err.statusCode = 403;
        throw err;
    }

    const boutique = await Boutique.findById(boutiqueId).lean();
    if (!boutique) {
        const err = new Error('Boutique introuvable.');
        err.statusCode = 404;
        throw err;
    }
    const ownerId = (boutique.createur || '').toString();
    const adminId = ((user._id || user.id) || '').toString();
    if (ownerId !== adminId) {
        const err = new Error('Accès refusé : vous ne pouvez pas manipuler les données d\'une boutique qui ne vous appartient pas.');
        err.statusCode = 403;
        throw err;
    }
}

/**
 * Vérifie qu'un article appartient à l'une des boutiques du tenant.
 * Utile avant une mutation sur un article (création, modification,
 * suppression, ajustement).
 */
async function assertArticleInTenant(user, article) {
    if (!article) {
        const err = new Error('Article introuvable.');
        err.statusCode = 404;
        throw err;
    }
    if (isSuperAdmin(user)) return;
    const boutiqueId = article.boutique?._id || article.boutique;
    await assertBoutiqueBelongsToAdmin(user, boutiqueId);
}

module.exports = {
    ADMIN_ROLES,
    STAFF_ROLES,
    isAdminLike,
    isSuperAdmin,
    isStaff,
    getUserBoutiqueIds,
    getTenantFilter,
    assertBoutiqueBelongsToAdmin,
    assertArticleInTenant,
};