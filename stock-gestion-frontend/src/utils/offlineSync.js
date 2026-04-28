import { venteAPI } from '../services/api';

const OFFLINE_KEY = 'offline_ventes_data';

/**
 * Sauvegarde une vente localement en cas de perte de connexion
 */
export const saveVenteOffline = async (venteData) => {
    const existing = JSON.parse(localStorage.getItem(OFFLINE_KEY) || '[]');
    const newVente = {
        ...venteData,
        id: Date.now(),
        createdAt: new Date().toISOString()
    };
    existing.push(newVente);
    localStorage.setItem(OFFLINE_KEY, JSON.stringify(existing));
    return newVente;
};

/**
 * Récupère la liste des ventes stockées localement
 */
export const getOfflineVentes = async () => {
    return JSON.parse(localStorage.getItem(OFFLINE_KEY) || '[]');
};

/**
 * Récupère le nombre de ventes en attente
 */
export const getOfflineVentesCount = async () => {
    const data = await getOfflineVentes();
    return data.length;
};

/**
 * Tente de synchroniser les ventes locales avec le serveur
 */
export const syncVentes = async () => {
    const offlineVentes = await getOfflineVentes();
    if (offlineVentes.length === 0) return { success: 0, errors: 0 };

    let successCount = 0;
    let errorCount = 0;
    const remaining = [];

    for (const vente of offlineVentes) {
        try {
            const { id, ...data } = vente;
            await venteAPI.create(data);
            successCount++;
        } catch (err) {
            errorCount++;
            remaining.push(vente);
        }
    }

    localStorage.setItem(OFFLINE_KEY, JSON.stringify(remaining));
    return { success: successCount, errors: errorCount };
};