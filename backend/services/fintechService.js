/**
 * @file fintechService.js
 * @description Service d'intégration Mobile Money (Orange Money, MobiCash, PayCard)
 * Template à compléter par le professeur avec les appels API réels.
 */

const axios = require('axios');

/**
 * Configuration des prestataires Mobile Money
 * Chargée depuis les variables d'environnement
 */
const PROVIDERS = {
    'Orange Money': {
        apiUrl: process.env.ORANGE_MONEY_API_URL,
        apiKey: process.env.ORANGE_MONEY_API_KEY,
        merchantId: process.env.ORANGE_MONEY_MERCHANT_ID,
        merchantSecret: process.env.ORANGE_MONEY_MERCHANT_SECRET
    },
    'MobiCash': {
        apiUrl: process.env.MOBICASH_API_URL,
        apiKey: process.env.MOBICASH_API_KEY,
        merchantId: process.env.MOBICASH_MERCHANT_ID,
        merchantSecret: process.env.MOBICASH_MERCHANT_SECRET
    },
    'PayCard': {
        apiUrl: process.env.PAYCARD_API_URL,
        apiKey: process.env.PAYCARD_API_KEY,
        merchantId: process.env.PAYCARD_MERCHANT_ID,
        merchantSecret: process.env.PAYCARD_MERCHANT_SECRET
    }
};

/**
 * Initie un paiement Mobile Money
 * 
 * @param {string} modePaiement - 'Orange Money' | 'MobiCash' | 'PayCard' | 'Virement'
 * @param {string} telephone - Numéro de téléphone du client
 * @param {number} montant - Montant total de la vente
 * @param {string} reference - Référence de la vente
 * @returns {Promise<{success: boolean, transactionId: string, message: string}>}
 * 
 * 🔴 CECI EST UN TEMPLATE - LE PROFESSEUR DOIT REMPLACER LES APPELS API SIMULÉS
 * 🔴 PAR LES VRAIS APPELS VERS ORANGE MONEY / MOBICASH / PAYCARD
 */
exports.initierPaiement = async (modePaiement, telephone, montant, reference) => {
    console.log(`[Fintech] Initiation paiement ${modePaiement} - Tél: ${telephone} - Montant: ${montant} GNF`);

    const provider = PROVIDERS[modePaiement];

    // Si le prestataire n'est pas configuré, on retourne une erreur
    if (!provider || !provider.apiUrl) {
        return {
            success: false,
            transactionId: null,
            message: `Service ${modePaiement} non configuré. Contactez l'administrateur.`
        };
    }

    try {
        // ═══════════════════════════════════════════════════════════
        // 🔴 À REMPLACER PAR LE VRAI APPEL API
        // ═══════════════════════════════════════════════════════════
        // Exemple de structure d'appel API réel :
        //
        // const response = await axios.post(`${provider.apiUrl}/payment-request`, {
        //     amount: montant,
        //     phoneNumber: telephone,
        //     merchantId: provider.merchantId,
        //     reference: reference,
        //     description: `Paiement StockDash - ${reference}`
        // }, {
        //     headers: {
        //         'Authorization': `Bearer ${provider.apiKey}`,
        //         'Content-Type': 'application/json'
        //     }
        // });
        //
        // return {
        //     success: response.data.status === 'SUCCESS',
        //     transactionId: response.data.transactionId,
        //     message: response.data.status === 'SUCCESS' ? 'Paiement réussi' : response.data.message
        // };
        // ═══════════════════════════════════════════════════════════

        // --- CODE SIMULÉ (À SUPPRIMER QUAND L'API RÉELLE EST BRANCHÉE) ---
        console.log(`[Fintech] ⚠️ Appel API simulé pour ${modePaiement}`);
        console.log(`[Fintech] URL: ${provider.apiUrl}`);
        console.log(`[Fintech] Requête: { phone: ${telephone}, amount: ${montant}, merchant: ${provider.merchantId} }`);

        // Simulation : 90% de chance de succès
        const isSuccess = Math.random() < 0.9;
        const simulatedTransactionId = `${modePaiement.replace(/\s/g, '')}-${Date.now().toString(36).toUpperCase()}`;

        if (isSuccess) {
            return {
                success: true,
                transactionId: simulatedTransactionId,
                message: `Paiement ${modePaiement} de ${montant} GNF accepté.`
            };
        } else {
            return {
                success: false,
                transactionId: null,
                message: `Paiement ${modePaiement} refusé : solde insuffisant.`
            };
        }
        // --- FIN CODE SIMULÉ ---

    } catch (error) {
        console.error(`[Fintech] Erreur appel API ${modePaiement}:`, error.message);
        
        // Si l'API est down, on ne bloque pas la vente
        // mais on log l'erreur pour investigation
        return {
            success: false,
            transactionId: null,
            message: `Erreur de connexion au service ${modePaiement}. Réessayez plus tard.`
        };
    }
};

/**
 * Vérifie le statut d'une transaction Mobile Money
 * Utile pour confirmer un paiement en attente
 * 
 * @param {string} modePaiement - Mode de paiement 
 * @param {string} transactionId - ID de la transaction
 * @returns {Promise<{success: boolean, status: string}>}
 */
exports.verifierStatutPaiement = async (modePaiement, transactionId) => {
    const provider = PROVIDERS[modePaiement];
    if (!provider || !provider.apiUrl) {
        return { success: false, status: 'UNKNOWN' };
    }

    try {
        // 🔴 À REMPLACER PAR LE VRAI APPEL API DE VÉRIFICATION
        // const response = await axios.get(`${provider.apiUrl}/transaction/${transactionId}/status`, {
        //     headers: { 'Authorization': `Bearer ${provider.apiKey}` }
        // });
        // return { success: true, status: response.data.status };

        // Simulation
        return { success: true, status: 'SUCCESS' };
    } catch (error) {
        console.error(`[Fintech] Erreur vérification statut:`, error.message);
        return { success: false, status: 'UNKNOWN' };
    }
};