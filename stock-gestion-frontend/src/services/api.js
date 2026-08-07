/**
 * @file api.js
 * @description Configuration des appels API avec Axios.
 */

import axios from 'axios';
import { toast } from 'react-toastify';

// Sécurité : Si la variable .env n'est pas lue, on évite le "undefined" avec une URL de repli
let API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api/';
// Assurer que l'URL de base a un protocole valide
if (!API_URL.startsWith('http://') && !API_URL.startsWith('https://')) {
  // Si l'URL commence par "localhost" ou une IP sans protocole, on ajoute "http://"
  if (API_URL.startsWith('localhost') || API_URL.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/)) {
    API_URL = `http://${API_URL}`;
  }
}
/**
 * Configuration de l'instance Axios
 */
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true
});

/**
 * Fonctions utilitaires
 */
const clearAuthSession = () => {
  const items = ['token', 'userRole', 'userName', 'userId', 'boutiqueId', 'mustChangePassword'];
  items.forEach(item => localStorage.removeItem(item));
  window.location.href = '/login';
};

/**
 * Interceptor : Ajout du Token JWT
 */
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Interceptor : Gestion des erreurs globales (401) et extraction des données
 */
api.interceptors.response.use(
  (response) => {
    if (response.data && response.data.success === true) {
      // CORRECTION : On retourne directement l'objet de données, pas l'objet de réponse complet.
      // Le composant recevra directement { nouveauSolde: ..., paiement: ... }
      return response.data.data;
    }
    return response;
  },
  (error) => {
    if (error.response && error.response.status === 401) {
      clearAuthSession();
    } else {
      const message = error.response?.data?.message || error.message || "Une erreur est survenue";
      toast.error(message);
    }
    return Promise.reject(error);
  }
);

/**
 * SERVICES API
 */

export const serveurAPI = {
  getStatsMe: () => api.get('serveurs/stats/me'),
  getEquipe: () => api.get('serveurs/equipe'),
};

export const authAPI = {
  login: (email, password) => api.post('auth/login', { email, password }),
  register: (data) => api.post('auth/register', data),
  getCurrentUser: () => api.get('auth/me'),
  getUsers: (params) => api.get('auth/users', { params }),
  getDeletedUsers: () => api.get('auth/users/deleted'),
  createManager: (data) => api.post('auth/create-manager', data),
  createCashier: (data) => api.post('auth/create-cashier', data),
  updateManager: (id, data) => api.put(`auth/users/${id}`, data),
  deleteManager: (id) => api.delete(`auth/users/${id}`),
  restoreManager: (id) => api.put(`auth/users/${id}/restore`),
  forceDeleteManager: (id) => api.delete(`auth/users/${id}/force`),
  changePassword: (data) => api.put('auth/change-password', data),
  validateUser: (id) => api.put(`auth/users/${id}/validate`), // Nouvelle route pour valider
  rejectUser: (id) => api.put(`auth/users/${id}/reject`),     // Nouvelle route pour rejeter
  forgotPassword: (email) => api.post('auth/forgot-password', { email }),
  updateProfile: (data) => api.put('auth/profile', data),
  getNotifications: async () => {
    const response = await api.get('auth/notifications');
    return Array.isArray(response.data) ? response.data : (response.data?.data || []);
  },
  markNotificationRead: (id) => api.put(`auth/notifications/${id}/read`),
  markAllNotificationsRead: () => api.put('auth/notifications/read-all'),
  getAllNotifications: async () => {
    const response = await api.get('auth/all-notifications');
    return Array.isArray(response.data) ? response.data : (response.data?.data || []);
  },
};

export const boutiqueAPI = {
  getAll: () => api.get('boutiques'),
  create: (data) => api.post('boutiques', data),
  update: (id, data) => api.put(`boutiques/${id}`, data),
  getDetailsForServeur: (id) => api.get(`boutiques/${id}`),
  delete: (id) => api.delete(`boutiques/${id}`),
  syncCodes: () => api.post('boutiques/sync-codes'),
};

export const articleAPI = {
  getAll: (params) => api.get('articles', { params }),
  create: (data) => api.post('articles', data),
  update: (id, data) => api.put(`articles/${id}`, data),
  delete: (id) => api.delete(`articles/${id}`),
  transferStock: (data) => api.post('articles/transfer', data),
  restock: (data) => api.post('articles/restock', data),
  demanderRemise: (id, data) => api.post(`articles/${id}/demander-remise`, data),
  applyAutoPromo: (data) => api.post('articles/auto-promo', data),
  updateMany: (data) => api.put('articles/update-many', data),
  getAdjustments: () => api.get('articles/adjustments'),
  createAdjustment: (data) => api.post('articles/adjustments', data),
    validateAdjustment: (id, data) => api.put(`articles/adjustments/${id}/validate`, data),
    corrigerTransfert: (id, data) => api.put(`articles/transfer/${id}/correct`, data),
    annulerTransfert: (id) => api.post(`articles/transfer/${id}/cancel`),
};

// Cache global pour éviter les appels répétitifs (ex: boucle infinie dans useEffect)
let fournisseursCache = null;
let fournisseursCacheTime = 0;
const CACHE_TTL = 30000; // 30 secondes

export const fournisseurAPI = {
  getAll: async (params) => {
    const now = Date.now();
    if (!params && fournisseursCache && (now - fournisseursCacheTime) < CACHE_TTL) {
      return fournisseursCache;
    }
    const res = await api.get('fournisseurs', { params });
    if (!params) {
      fournisseursCache = res;
      fournisseursCacheTime = now;
    }
    return res;
  },
  create: (data) => api.post('fournisseurs', data),
  update: (id, data) => api.put(`fournisseurs/${id}`, data),
  delete: (id) => api.delete(`fournisseurs/${id}`),
  approvisionner: (data) => api.post('fournisseurs/approvisionner', data),
};

export const venteAPI = {
  create: (data) => api.post('ventes', data),
  getHistorique: (params) => api.get('ventes/historique', { params }),
  cancel: (id) => api.post(`ventes/${id}/cancel`),
  getLogs: () => api.get('ventes/logs'),
  getPendingSales: () => api.get('ventes/pending'),
  validateRemise: (id) => api.post(`ventes/${id}/validate-remise`),
  rejectRemise: (id) => api.post(`ventes/${id}/reject-remise`),
  genererTicket: (id) => api.get(`ventes/${id}/ticket`),
  updateGroupStatus: (orderGroupId, data) => api.patch(`ventes/group/${orderGroupId}/status`, data),
  updateStatus: (id, data) => api.patch(`ventes/${id}/status`, data),
  telechargerTicket: (filename) => api.get(`ventes/ticket/download/${filename}`, { responseType: 'blob' }),
};

export const clientAPI = {
  getAll: (params) => api.get('clients', { params }),
  create: (data) => api.post('clients', data),
  update: (id, data) => api.put(`clients/${id}`, data),
  delete: (id) => api.delete(`clients/${id}`),
  payDette: (id, data) => api.post(`clients/${id}/pay-dette`, data),
  getDebts: () => api.get('clients/debts'),
  getDebtHistory: () => api.get('clients/debt-history'),
  getDebtHistoryForClient: (id) => api.get(`clients/${id}/debt-history`),
  getDebtEvolution: () => api.get('clients/debt-evolution'),
  payerCommission: (data) => api.post('clients/pay-commission', data),
  sendReceiptEmail: (paymentId) => api.post(`clients/payment/${paymentId}/send-email`),
// CRM
  getCrmAnalytics: () => api.get('clients/crm/analytics'),
  getCrmQuartiers: () => api.get('clients/crm/quartiers'),
  getCrmSettings: () => api.get('clients/crm/settings'),
  updateCrmSettings: (data) => api.put('clients/crm/settings', data),
  getSegmentationSettings: () => api.get('clients/crm/segmentation-settings'),
  updateSegmentationSettings: (data) => api.put('clients/crm/segmentation-settings', data),
  relancerClient: (id, data) => api.post(`clients/${id}/relance`, data),
};

export const caisseAPI = {
  getStatut: () => api.get('caisse/statut'),
  ouvrir: (data) => api.post('caisse/ouvrir', data),
  fermer: (data) => api.post('caisse/fermer', data),
  creerDepense: (data) => api.post('caisse/depenses', data),
  getMesDepenses: () => api.get('caisse/depenses/me'),
  getMesRapports: (params) => api.get('caisse/rapports/me', { params }),
  listerRapports: (params) => api.get('caisse/rapports', { params }),
  getReportDetails: (id) => api.get(`caisse/rapports/${id}/details`),
  validerRapport: (id, data) => api.put(`caisse/rapports/${id}/valider`, data),
  rejeterRapport: (id, data) => api.put(`caisse/rapports/${id}/rejeter`, data),
  getCaisseAdmin: () => api.get('caisse/admin'),
  getStatistiquesSession: () => api.get('caisse/statistiques-session'),
  corrigerRapport: (data) => api.put('caisse/correction', data),
  // Nouvelles méthodes pour les détails Fintech
  getVentesHistorique: (params) => api.get('ventes/historique', { params }),
  getDettesHistorique: () => api.get('clients/debt-history'),
  // Routes pour le workflow caissier
  listerRapportsCaissiers: (params) => api.get('caisse/rapports/caissiers', { params }),
  validerRapportCaissier: (id, data) => api.put(`caisse/rapports/caissiers/${id}/valider`, data),
  rejeterRapportCaissier: (id, data) => api.put(`caisse/rapports/caissiers/${id}/rejeter`, data),
  // Détails d'un rapport de caissier
  getRapportCaissierDetails: (id) => api.get(`caisse/rapports/caissiers/${id}/details`),
};

export const mouvementAPI = {
  getAll: (params) => api.get('mouvements', { params }),
  cancel: (id) => api.post(`mouvements/${id}/cancel`),
  relancerGerant: (id) => api.post(`articles/transfer/${id}/remind`),
  confirmerReception: (id) => api.post(`mouvements/${id}/receive`),
};

export const dashboardAPI = {
  getStats: (params) => api.get('dashboard/stats', { params }),
  getGerantSummary: () => api.get('dashboard/gerant-summary'),
  getSuperAdminStats: () => api.get('dashboard/superadmin'),
};

export const auditAPI = {
  getLogs: (params) => api.get('audit', { params }),
};

export const userAPI = {
  getAll: () => api.get('auth/users'),
};

export const cacheAPI = {
  flushBoutiqueCache: () => api.delete('cache/boutiques'),
};

export default api;