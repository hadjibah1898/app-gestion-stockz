// src/utils/axiosConfig.js
import axios from 'axios';

const setupAxiosInterceptors = () => {
  // On ajoute un intercepteur sur les réponses
  axios.interceptors.response.use(
    (response) => {
      // Si la requête réussit, on ne change rien
      return response;
    },
    (error) => {
      // Si le backend renvoie une erreur 401 (Non autorisé)
      if (error.response && error.response.status === 401) {
        console.warn("Session expirée ou token manquant. Redirection vers Login...");

        // 1. On nettoie le stockage local pour éviter les boucles
        localStorage.removeItem('token');
        localStorage.removeItem('userRole');
        localStorage.removeItem('userName');
        localStorage.removeItem('mustChangePassword');

        // 2. On force la redirection vers la page de connexion
        // window.location.href est plus fiable qu'un hook ici car on est hors des composants React
        if (window.location.pathname !== '/login') {
            window.location.href = '/login';
        }
      }
      return Promise.reject(error);
    }
  );
};

export default setupAxiosInterceptors;
