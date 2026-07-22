/**
 * @file syncService.js
 * @description Service de synchronisation des données locales vers le cloud.
 */

const cron = require('node-cron');
const mongoose = require('mongoose');
const Vente = require('../models/Vente');
const User = require('../models/User');
const Article = require('../models/Article');

// Récupération des schémas pour la base distante
const userSchema = require('../models/User').schema;
const venteSchema = require('../models/Vente').schema;
const articleSchema = require('../models/Article').schema;

/**
 * Service de synchronisation robuste Boutique Locale -> Serveur Central
 */

const MONGO_URI_REMOTE = process.env.MONGO_URI_REMOTE;
let remoteDb = null;

const initRemoteConnection = () => {
    if (MONGO_URI_REMOTE) {
        // Création d'une connexion persistante avec options de reconnexion
        remoteDb = mongoose.createConnection(MONGO_URI_REMOTE, {
            serverSelectionTimeoutMS: 5000, // Réduit à 5s pour ne pas bloquer les ressources locales
            heartbeatFrequencyMS: 30000,    // Vérifie la santé du lien toutes les 30s
        });

        remoteDb.on('connected', () => console.log('✅ [SYNC] Connexion établie avec le Cloud.'));
        remoteDb.on('disconnected', () => console.warn('ℹ️ [SYNC] Mode hors-ligne : Le Cloud est déconnecté. Le travail local continue.'));
        remoteDb.on('error', (err) => {}); // Silencieux : l'erreur est attendue en mode local
        
        console.log('🌐 [SYNC] Tentative de liaison avec le Cloud...');
    }
};

initRemoteConnection();

const syncLocalDataToCloud = async (userId = null) => {
    // 1. Gestion de l'état de la connexion
    if (!remoteDb) return;

    // Si la connexion est en cours (readyState 2), on attend un peu
    if (remoteDb.readyState === 2) {
        // En mode local-first, on ne fait pas attendre l'utilisateur. On ignore ce cycle de synchro.
        return;
    }

    // Si toujours pas connecté (readyState 1 = Connected)
    if (remoteDb.readyState !== 1) {
        // Log discret pour ne pas polluer la console locale
        return;
    }

    console.log(`🔄 [SYNC] Démarrage de la synchronisation ${userId ? `pour l'utilisateur ${userId}` : 'automatique'}...`);

    try {
        // Initialisation sécurisée des modèles distants (évite OverwriteModelError)
        const RemoteUser = remoteDb.models.User || remoteDb.model('User', userSchema);
        const RemoteVente = remoteDb.models.Vente || remoteDb.model('Vente', venteSchema);
        const RemoteArticle = remoteDb.models.Article || remoteDb.model('Article', articleSchema);

        // --- 0. SYNCHRONISATION DES UTILISATEURS ---
        const userQuery = userId ? { _id: userId, isSynced: { $ne: true } } : { isSynced: { $ne: true } };
        const unsyncedUsers = await User.find(userQuery).lean();
        
        if (unsyncedUsers.length > 0) {
            console.log(`👤 [SYNC] Envoi de ${unsyncedUsers.length} comptes...`);
            
            // Optimisation : Préparation des opérations en masse
            const userOps = unsyncedUsers.map(user => ({
                updateOne: {
                    filter: { email: user.email },
                    update: { $set: { ...user, isSynced: true } },
                    upsert: true
                }
            }));

            await RemoteUser.bulkWrite(userOps);
            await User.updateMany({ _id: { $in: unsyncedUsers.map(u => u._id) } }, { $set: { isSynced: true, syncedAt: new Date() } });
            console.log('✅ [SYNC] Comptes utilisateurs à jour.');
        }

        // --- 1. SYNCHRONISATION DES VENTES (Locale -> Cloud) ---
        const unsyncedSales = await Vente.find({ isSynced: { $ne: true } }).lean();

        if (unsyncedSales.length > 0) {
            console.log(`📤 [SYNC] Envoi de ${unsyncedSales.length} ventes vers le Cloud...`);
            
            const saleOps = unsyncedSales.map(sale => ({
                updateOne: {
                    filter: { _id: sale._id },
                    update: { $set: { ...sale, isSynced: true, syncedAt: new Date() } },
                    upsert: true
                }
            }));

            await RemoteVente.bulkWrite(saleOps);
            await Vente.updateMany(
                { _id: { $in: unsyncedSales.map(s => s._id) } },
                { $set: { isSynced: true, syncedAt: new Date() } }
            );
            console.log('✅ [SYNC] Ventes synchronisées.');
        }

        // --- 2. SYNCHRONISATION DU CATALOGUE (Cloud -> Locale) ---
        let boutiqueIdForSync;
        try {
            boutiqueIdForSync = new mongoose.Types.ObjectId(process.env.BOUTIQUE_ID);
        } catch (e) {
            console.error(`❌ [SYNC] Erreur ID Boutique : ${process.env.BOUTIQUE_ID} n'est pas un ObjectId valide.`);
            return; 
        }

        const remoteArticles = await RemoteArticle.find({ boutique: boutiqueIdForSync }).lean();

        if (remoteArticles.length > 0) {
            console.log(`📥 [SYNC] Récupération de ${remoteArticles.length} articles depuis la centrale...`);
            for (const remoteArt of remoteArticles) {
                // On préserve la quantité locale pour ne pas fausser le stock réel de la boutique
                const { quantite, ...infoCentrale } = remoteArt; 
                await Article.updateOne(
                    { _id: remoteArt._id },
                    { $set: { ...infoCentrale } },
                    { upsert: true }
                );
            }
            console.log('✅ [SYNC] Catalogue articles mis à jour.');
        }

    } catch (error) {
        console.error('❌ [SYNC] Erreur pendant le transfert:', error.message);
    }
};

/**
 * Initialise le service (toutes les heures + au démarrage)
 */
const initSyncService = () => {
    cron.schedule('0 * * * *', () => {
        syncLocalDataToCloud();
    });

    // Augmente à 10 secondes pour laisser le temps au Wi-Fi de stabiliser le tunnel
    setTimeout(() => {
        console.log('🚀 [SYNC] Lancement de la première synchronisation...');
        syncLocalDataToCloud();
    }, 10000); 
};

module.exports = { initSyncService, syncLocalDataToCloud };