// src/auth/ProtectedRoute.js
import React from 'react';
import { Navigate } from 'react-router-dom';

const ProtectedRoute = ({ userRole, requiredRole, children }) => {
    const token = localStorage.getItem('token');

    // Fonction de normalisation (Casse + Accents) pour éviter les boucles
    const normalize = (str) => (str || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "");
    const uRole = normalize(userRole);

    if (!uRole || !token) {
        // 1. Si l'utilisateur n'est pas connecté, on le renvoie vers la page de connexion.
        return <Navigate to="/login" replace />;
    }

    // Le SuperAdmin a un accès illimité à toutes les routes protégées
    if (uRole === 'SUPERADMIN') return children;

    // Normalisation des rôles requis
    const roles = (Array.isArray(requiredRole) ? requiredRole : [requiredRole]).map(normalize);

    if (!roles.includes(uRole)) {
        // 2. Si l'utilisateur n'a pas le bon rôle, on le renvoie vers son tableau de bord par défaut.
        let homePath = '/gerant';
        if (uRole === 'ADMIN' || uRole === 'SUPERADMIN') {
            homePath = '/admin';
        } else if (uRole === 'ADMINBAR') {
            homePath = '/admin-bar';
        } else if (uRole === 'GERANTBAR') {
            homePath = '/gerant-bar';
        } else if (uRole === 'SERVEURBAR') {
            homePath = '/serveur-bar';
        } else if (uRole === 'SERVEUR') {
            homePath = '/serveur/dashboard';
        } else if (uRole === 'CAISSIER') {
            homePath = '/caissier';
        }

        return <Navigate to={homePath} replace />;
    }

    // 3. Si tout est en ordre, on affiche la page demandée.
    return children;
};

export default ProtectedRoute;