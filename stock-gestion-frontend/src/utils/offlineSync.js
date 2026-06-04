import { openDB } from 'idb';
import { venteAPI } from '../services/api';

const DB_NAME = 'stockGestionDB';
const STORE_NAME = 'offlineVentes';

/**
 * Initialise la base de données IndexedDB.
 * @returns {Promise<IDBDatabase>} Une promesse qui résout avec l'instance de la base de données.
 */
const initDB = async () => {
    return openDB(DB_NAME, 1, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        },
    });
};

/**
 * Sauvegarde une vente dans IndexedDB lorsque l'application est hors ligne.
 * @param {Object} venteData - Les données de la vente à sauvegarder.
 */
export const saveVenteOffline = async (venteData) => {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    await tx.store.add({ venteData, timestamp: new Date().toISOString() });
    await tx.done;
    console.log('Vente sauvegardée hors ligne:', venteData);
};

/**
 * Tente de synchroniser toutes les ventes hors ligne avec le serveur.
 * @returns {Promise<{success: number, failed: number}>} Un objet contenant le nombre de ventes synchronisées et échouées.
 */
export const syncVentes = async () => {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const ventes = await tx.store.getAll();
    
    let successCount = 0;
    let failedCount = 0;

    for (const vente of ventes) {
        try {
            await venteAPI.create(vente.venteData);
            await tx.store.delete(vente.id); // Supprimer la vente après synchronisation réussie
            successCount++;
        } catch (error) {
            console.error('Échec de la synchronisation de la vente hors ligne:', vente, error);
            failedCount++;
            // Ne pas supprimer la vente, elle restera pour une tentative ultérieure
        }
    }
    await tx.done;
    return { success: successCount, failed: failedCount };
};

/**
 * Récupère le nombre de ventes hors ligne en attente de synchronisation.
 * @param {string} userId - Optionnel : filtrer par ID utilisateur
 * @returns {Promise<number>} Le nombre de ventes hors ligne.
 */
export const getOfflineVentesCount = async (userId = null) => {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const ventes = await tx.store.getAll();
    await tx.done;
    
    if (!userId) return ventes.length;
    
    // Filtrer pour ne compter que les ventes appartenant à l'utilisateur actuel
    return ventes.filter(v => v.venteData.gerantId === userId).length;
};

/**
 * Récupère toutes les ventes hors ligne stockées dans IndexedDB.
 * @returns {Promise<Array>} Une promesse qui résout avec un tableau des ventes hors ligne.
 */
export const getOfflineVentes = async () => {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const allVentes = await tx.store.getAll();
    await tx.done;
    return allVentes;
};