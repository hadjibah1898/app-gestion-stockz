import React, { createContext, useState, useEffect, useContext, useCallback, useRef } from 'react';
import { authAPI } from './services/api';
import socket, { initSocket } from './services/socket';
const NotificationContext = createContext();

export const useNotifications = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }) => {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [toastQueue, setToastQueue] = useState([]);
    
    // Utilisation d'une ref pour stocker les notifications actuelles
    // Cela permet d'y accéder dans fetchNotifications sans l'ajouter aux dépendances (ce qui causerait une boucle infinie)
    const notificationsRef = useRef(notifications);

    useEffect(() => {
        notificationsRef.current = notifications;
    }, [notifications]);

    const fetchNotifications = useCallback(async (isInitialFetch = false) => {
        const token = localStorage.getItem('token');
        const userRole = localStorage.getItem('userRole');

        if (!token) {
            setLoading(false);
            return;
        }
        try {
            const res = userRole === 'Admin' 
                ? await authAPI.getAllNotifications() 
                : await authAPI.getNotifications();
            
            const fetchedNotifications = res.data || []; 

            if (!isInitialFetch) {
                const currentNotifications = notificationsRef.current;
                const newNotifications = fetchedNotifications.filter(
                    fetchedNotif => !currentNotifications.some(existingNotif => existingNotif._id === fetchedNotif._id)
                );

                if (newNotifications.length > 0) {
                    setToastQueue(prev => [...prev, ...newNotifications]);
                }
            }

            // Comparaison pour éviter les mises à jour d'état inutiles (qui causent des boucles)
            setNotifications(prev => {
                if (JSON.stringify(prev) === JSON.stringify(fetchedNotifications)) return prev;
                return fetchedNotifications;
            });
            
            setUnreadCount(fetchedNotifications.filter(n => !n.read).length);
        } catch (error) {
            console.error("Failed to fetch notifications", error);
        } finally {
            setLoading(false);
        }
    }, []); // Dépendances vides : la fonction est stable et ne change jamais

    useEffect(() => {
        // Gérer la connexion et les écouteurs Socket.io
        const token = localStorage.getItem('token');
        if (token) {
            fetchNotifications(true); // Premier chargement au montage

            // Initialisation de secours au cas où l'App n'aurait pas encore fini
            const userRole = localStorage.getItem('userRole');
            if (userRole) initSocket({ role: userRole });

            const handleNewNotification = () => {
                console.log('Socket.io: Nouvelle notification reçue, rafraîchissement...');
                fetchNotifications(true); // Rafraîchir toutes les notifications
            };

            if (socket) socket.on('new_notification', handleNewNotification);

            return () => {
                if (socket) socket.off('new_notification', handleNewNotification); // Nettoyage de l'écouteur
            };
        } else {
            setNotifications([]);
            setUnreadCount(0);
            setLoading(false);
        }
    }, [fetchNotifications]); // Dépend de fetchNotifications (qui est useCallback)

    const markAsRead = useCallback(async (id) => {
        const notification = notifications.find(n => n._id === id);
        if (notification && !notification.read) {
            setNotifications(prev => prev.map(n => n._id === id ? { ...n, read: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
            try {
                await authAPI.markNotificationRead(id);
            } catch (error) {
                console.error("Failed to mark notification as read", error);
                fetchNotifications(true); // Revert on error
            }
        }
    }, [notifications, fetchNotifications]);

    const markAllAsRead = useCallback(async () => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        setUnreadCount(0);
        try {
            await authAPI.markAllNotificationsRead();
        } catch (error) {
            console.error("Failed to mark all notifications as read", error);
            fetchNotifications(true);
        }
    }, [fetchNotifications]);
    
    const removeToast = (id) => {
        setToastQueue(prev => prev.filter(t => t._id !== id));
    };

    const value = { notifications, unreadCount, loading, toastQueue, removeToast, markAsRead, markAllAsRead };

    return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};
