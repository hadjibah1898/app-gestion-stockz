import { venteAPI } from '../services/api';

const DB_NAME = 'StockDashOfflineDB';
const STORE_NAME = 'pendingSales';

const getDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

/**
 * Sauvegarde une vente localement si internet est coupé
 */
export const saveVenteOffline = async (venteData) => {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.add({ ...venteData, offlineAt: new Date().toISOString() });
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
};

/**
 * Compte le nombre de ventes en attente de synchronisation
 */
export const getOfflineVentesCount = async () => {
    const db = await getDB();
    return new Promise((resolve) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(0);
    });
};

/**
 * Tente de synchroniser les ventes locales vers le serveur
 */
export const syncVentes = async () => {
    if (!navigator.onLine) return { success: 0, error: 0 };

    const db = await getDB();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const ventes = await new Promise((resolve) => {
        store.getAll().onsuccess = (e) => resolve(e.target.result);
    });

    let success = 0;
    let error = 0;

    for (const v of ventes) {
        try {
            const { id, offlineAt, ...apiData } = v;
            await venteAPI.create(apiData);
            const delTx = db.transaction(STORE_NAME, 'readwrite');
            delTx.objectStore(STORE_NAME).delete(id);
            success++;
        } catch (err) {
            console.error("Sync failed for item:", v, err);
            error++;
        }
    }
    return { success, error };
};