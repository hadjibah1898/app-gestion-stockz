// src/utils/axiosConfig.js
import axios from 'axios';

const setupAxiosInterceptors = () => {
  // --- 1. Intercepteur de REQUÊTE ---
  // Ajoute automatiquement le token JWT à chaque requête sortante
  axios.interceptors.request.use(
    (config) => {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  // --- 2. Intercepteur de RÉPONSE ---
  // Gère les erreurs globales, notamment l'expiration de session (401)
  axios.interceptors.response.use(
    (response) => {
      // Si la requête réussit, on ne change rien
      return response;
    },
    (error) => {
      // Si le backend renvoie une erreur 401 (Non autorisé)
      if (error.response && error.response.status === 401) {
        console.warn("Session expirée ou token manquant. Redirection vers Login...");

        // On nettoie le stockage local pour éviter les incohérences
        localStorage.removeItem('token');
        localStorage.removeItem('userRole');
        localStorage.removeItem('userName');
        localStorage.removeItem('mustChangePassword');

        // On force la redirection vers la page de connexion
        // On vérifie qu'on n'y est pas déjà pour éviter une boucle de rechargement
        if (window.location.pathname !== '/login') {
            window.location.href = '/login';
        }
      }
      return Promise.reject(error);
    }
  );
};

export default setupAxiosInterceptors;
