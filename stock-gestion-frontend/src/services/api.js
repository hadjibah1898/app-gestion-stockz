// src/services/api.js
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor pour ajouter le token à chaque requête
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor pour gérer les réponses (ex: token expiré)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Token expiré ou invalide : on nettoie et on redirige
      localStorage.removeItem('token');
      // Redirection forcée vers le login
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

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
};

export const boutiqueAPI = {
  getAll: () => api.get('boutiques'),
  create: (data) => api.post('boutiques', data),
  update: (id, data) => api.put(`boutiques/${id}`, data),
  delete: (id) => api.delete(`boutiques/${id}`),
};

export const articleAPI = {
  getAll: () => api.get('articles'),
  create: (data) => api.post('articles', data),
  update: (id, data) => api.put(`articles/${id}`, data),
  delete: (id) => api.delete(`articles/${id}`),
  transferStock: (data) => api.post('articles/transfer', data),
};

export const venteAPI = {
  create: (data) => api.post('ventes', data),
  getHistorique: (params) => api.get('ventes/historique', { params }),
  getLogs: () => api.get('ventes/logs'),
};

export const dashboardAPI = {
  getStats: (params) => api.get('dashboard/stats', { params }),
};

export default api;
