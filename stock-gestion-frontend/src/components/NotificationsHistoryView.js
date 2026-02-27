// src/components/NotificationsHistoryView.js
// Composant d'affichage de l'historique des notifications
// Permet de visualiser les notifications envoyées aux clients
// Affiche les informations sur les clients, les articles et les dates
// Contient les fonctionnalités de recherche et de filtres

import React, { useState, useEffect, useCallback } from 'react';
import { Card, Spinner, Alert, Badge, Form, Button, Table } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';

const NotificationsHistoryView = () => {
    const userRole = (localStorage.getItem('userRole') || '').trim();
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    const fetchNotifications = useCallback(async () => {
        try {
            setLoading(true);
            // L'API pour les gérants ne retourne que leurs propres notifications
            const res = userRole === 'Admin'
                ? await authAPI.getAllNotifications()
                : await authAPI.getNotifications();
            setNotifications(res.data || []);
        } catch (err) {
            setError("Impossible de charger l'historique des notifications.");
        } finally {
            setLoading(false);
        }
    }, [userRole]);

    useEffect(() => {
        fetchNotifications();
    }, [fetchNotifications]);

    const handleMarkAllAsRead = async () => {
        try {
            await authAPI.markAllNotificationsRead();
            setNotifications(notifications.map(n => ({ ...n, read: true })));
        } catch (err) {
            setError("Impossible de marquer toutes les notifications comme lues.");
        }
    };

    const handleRowClick = (notification) => {
        // Marquer comme lue si elle ne l'est pas déjà
        if (!notification.read) {
            authAPI.markNotificationRead(notification._id).catch(err => console.error("Failed to mark as read", err));
            // Mise à jour optimiste de l'UI
            setNotifications(notifications.map(n => n._id === notification._id ? { ...n, read: true } : n));
        }

        // Naviguer si un lien existe
        if (notification.link) {
            navigate(notification.link);
        }
    };

    const getTypeBadge = (type) => {
        switch (type) {
            case 'success': return 'success';
            case 'error': return 'danger';
            case 'warning': return 'warning';
            default: return 'info';
        }
    };

    let columns = [
        { 
            key: 'type', 
            label: 'Type', 
            render: (type) => <Badge bg={getTypeBadge(type)}>{type.toUpperCase()}</Badge>
        },
        { 
            key: 'message', 
            label: 'Message',
            render: (msg, item) => (
                <div>
                    <div className={!item.read ? 'fw-bold' : ''}>{msg}</div>
                    <small className="text-muted">{new Date(item.createdAt).toLocaleString('fr-FR')}</small>
                </div>
            )
        },
        { 
            key: 'read', 
            label: 'Statut', 
            render: (read) => (
                read ? (
                    <Badge bg="light" text="dark" className="d-flex align-items-center gap-1 px-2">
                        <iconify-icon icon="solar:check-read-linear"></iconify-icon>
                        Lu
                    </Badge>
                ) : (
                    <Badge bg="primary" className="d-flex align-items-center gap-1 px-2">
                        <iconify-icon icon="solar:bell-bing-bold-duotone"></iconify-icon>
                        Non lu
                    </Badge>
                )
            )
        }
    ];

    // Ajout de la colonne "Destinataire" uniquement pour l'admin
    if (userRole === 'Admin') {
        columns.splice(2, 0, { 
            key: 'recipient', 
            label: 'Destinataire',
            render: (user) => user ? (
                <div>
                    <div className="fw-bold">{user.nom}</div>
                    <small className="text-muted">{user.role}</small>
                </div>
            ) : <span className="text-muted">Utilisateur supprimé</span>
        });
    }

    const filteredNotifications = notifications.filter(n => {
        const messageMatch = n.message.toLowerCase().includes(searchTerm.toLowerCase());
        if (userRole === 'Admin') {
            const recipientMatch = n.recipient && n.recipient.nom.toLowerCase().includes(searchTerm.toLowerCase());
            return messageMatch || recipientMatch;
        }
        return messageMatch;
    });

    const hasUnread = notifications.some(n => !n.read);

    if (loading) return <div className="text-center p-5"><Spinner animation="border" /></div>;

    return (
        <div className="p-4">
            <style>{`
                .notifications-table tbody tr.clickable {
                    cursor: pointer;
                }
            `}</style>
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h3 className="fw-bold mb-0">{userRole === 'Admin' ? 'Historique des Notifications' : 'Mes Notifications'}</h3>
                <div className="d-flex gap-2">
                    {userRole !== 'Admin' && hasUnread && (
                        <Button variant="outline-success" onClick={handleMarkAllAsRead} className="rounded-pill shadow-sm">
                            <iconify-icon icon="solar:check-read-bold" className="me-2 align-middle"></iconify-icon>
                            Tout marquer comme lu
                        </Button>
                    )}
                    <Button variant="outline-primary" onClick={fetchNotifications} className="rounded-pill shadow-sm">
                        <iconify-icon icon="solar:refresh-bold" className="me-2 align-middle"></iconify-icon>
                        Actualiser
                    </Button>
                </div>
            </div>
            
            {error && <Alert variant="danger">{error}</Alert>}

            <div className="mb-4">
                <Form.Control
                    type="text"
                    placeholder={userRole === 'Admin' ? "Rechercher par message ou destinataire..." : "Rechercher par message..."}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ maxWidth: '300px' }}
                    className="shadow-sm"
                />
            </div>

            <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
                <Card.Body className="p-0">
                    <Table hover responsive className="align-middle mb-0 notifications-table">
                        <thead className="bg-light">
                            <tr>
                                {columns.map(col => (
                                    <th key={col.key} className="border-0 small text-uppercase text-secondary py-3 px-4">
                                        {col.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredNotifications.length > 0 ? (
                                filteredNotifications.map((item) => (
                                    <tr key={item._id} onClick={() => handleRowClick(item)} className={`${item.link ? 'clickable' : ''} ${!item.read ? 'bg-primary-subtle' : ''}`}>
                                        {columns.map(col => (
                                            <td key={col.key} className="px-4 py-3">
                                                {col.render ? col.render(item[col.key], item) : item[col.key]}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : (
                                <tr><td colSpan={columns.length} className="text-center py-5 text-muted">Aucune notification trouvée.</td></tr>
                            )}
                        </tbody>
                    </Table>
                </Card.Body>
            </Card>
        </div>
    );
};

export default NotificationsHistoryView;