// src/services/api.js
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

/**
 * Configuration de l'instance Axios
 */
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Fonctions utilitaires
 */
const clearAuthSession = () => {
  const items = ['token', 'userRole', 'userName', 'mustChangePassword'];
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
 * Interceptor : Gestion des erreurs globales (401)
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      clearAuthSession();
    }
    return Promise.reject(error);
  }
);

/**
 * SERVICES API
 */

export const authAPI = {
  login: (email, password) => api.post('auth/login', { email, password }),
  register: (data) => api.post('auth/register', data),
  getCurrentUser: () => api.get('auth/me'),
  getUsers: () => api.get('auth/users'),
  getDeletedUsers: () => api.get('auth/users/trash'),
  createManager: (data) => api.post('auth/create-manager', data),
  updateManager: (id, data) => api.put(`auth/managers/${id}`, data),
  deleteManager: (id) => api.delete(`auth/managers/${id}`),
  restoreManager: (id) => api.put(`auth/managers/${id}/restore`),
  forceDeleteManager: (id) => api.delete(`auth/managers/${id}/force`),
  changePassword: (data) => api.post('auth/change-password', data),
  forgotPassword: (email) => api.post('auth/forgot-password', { email }),
  updateProfile: (data) => api.put('auth/profile', data),
  getNotifications: () => api.get('auth/notifications'),
  markNotificationRead: (id) => api.put(`auth/notifications/${id}/read`),
  markAllNotificationsRead: () => api.put('auth/notifications/mark-all-read'),
  getAllNotifications: () => api.get('auth/admin/notifications'),
};

export const boutiqueAPI = {
  getAll: () => api.get('boutiques'),
  create: (data) => api.post('boutiques', data),
  update: (id, data) => api.put(`boutiques/${id}`, data),
  delete: (id) => api.delete(`boutiques/${id}`),
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
};

export const fournisseurAPI = {
  getAll: () => api.get('fournisseurs'),
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
  telechargerTicket: (filename) => api.get(`ventes/ticket/download/${filename}`, { responseType: 'blob' }),
};

export const clientAPI = {
  getAll: () => api.get('clients'),
  create: (data) => api.post('clients', data),
  update: (id, data) => api.put(`clients/${id}`, data),
  delete: (id) => api.delete(`clients/${id}`),
  payDette: (id, data) => api.post(`clients/${id}/pay-dette`, data),
  getDebts: () => api.get('clients/debts'),
  getDebtHistory: () => api.get('clients/debt-history'),
  getPendingDebtPayments: () => api.get('clients/debt-payments/pending'),
  validateDebtPayment: (id) => api.put(`clients/debt-payments/${id}/validate`),
  getDebtEvolution: () => api.get('clients/debt-evolution'),
};

export const caisseAPI = {
  getStatut: () => api.get('caisse/statut'),
  ouvrir: (data) => api.post('caisse/ouvrir', data),
  fermer: (data) => api.post('caisse/fermer', data),
  creerDepense: (data) => api.post('caisse/depenses', data),
  getMesDepenses: () => api.get('caisse/depenses/me'),
  getMesRapports: () => api.get('caisse/rapports/me'),
  listerRapports: (params) => api.get('caisse/rapports', { params }),
  getReportDetails: (id) => api.get(`caisse/rapports/${id}/details`),
  validerRapport: (id, data) => api.put(`caisse/rapports/${id}/valider`, data),
  rejeterRapport: (id, data) => api.put(`caisse/rapports/${id}/rejeter`, data),
  getCaisseAdmin: () => api.get('caisse/admin'),
  getStatistiquesSession: () => api.get('caisse/statistiques-session'),
};

export const mouvementAPI = {
  getAll: (params) => api.get('mouvements', { params }),
  cancel: (id) => api.post(`mouvements/${id}/cancel`),
};

export const dashboardAPI = {
  getStats: (params) => api.get('dashboard/stats', { params }),
};

export const auditAPI = {
  getLogs: (params) => api.get('audit', { params }),
};

export default api;