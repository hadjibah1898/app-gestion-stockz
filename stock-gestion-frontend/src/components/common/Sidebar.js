// src/components/common/Sidebar.js
import React, { useState, useEffect } from 'react';
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { Nav, NavDropdown, Badge, Button } from 'react-bootstrap'; // Import Bootstrap Nav components
import { authAPI } from '../../services/api';
import { useNotifications } from '../../NotificationContext'; // Import notifications context
import './Sidebar.css';

const Sidebar = ({ userRole, isSidebarOpen, toggleSidebar, userName, handleLogout, theme, toggleTheme }) => {
    const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
    // Le menu s'adapte en fonction du rôle de l'utilisateur
    const [boutiqueName, setBoutiqueName] = useState('');

    useEffect(() => {
        if (userRole === 'Gérant') {
            const fetchUserBoutique = async () => {
                try {
                    const res = await authAPI.getCurrentUser();
                    if (res.data?.boutique?.nom) {
                        setBoutiqueName(res.data.boutique.nom);
                    }
                } catch (error) {
                    console.error("Info: Impossible de charger la boutique", error);
                }
            };

            fetchUserBoutique();
        }
    }, [userRole]);

    const navigate = useNavigate();
    const location = useLocation();

    // Fonction pour fermer le sidebar après un clic sur mobile uniquement
    const handleNavLinkClick = () => {
        // Retour haptique : légère vibration de 40ms
        if (window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate(40);
        }

        if (window.innerWidth < 992 && toggleSidebar) {
            toggleSidebar();
        }
    };

    const handleNotificationClick = (notification) => {
        // Retour haptique pour les notifications
        if (window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate(40);
        }

        if (!notification.read) {
            markAsRead(notification._id);
        }
        // Close sidebar on mobile when navigating from notification
        if (window.innerWidth < 992 && toggleSidebar) {
            toggleSidebar();
        }
        if (notification.link) {
            navigate(notification.link);
        }
    };

    const handleMarkAllRead = async () => {
        await markAllAsRead();
    };

    return (
        <aside className="left-sidebar" aria-label="Barre latérale de navigation">
            {/* Logo Section */}
            <div className="brand-logo">
                <div className="d-flex align-items-center">
                    {/* Close button for mobile */}
                    <button 
                        type="button" 
                        className="btn btn-link d-lg-none text-muted me-3" 
                        onClick={toggleSidebar} 
                        aria-label="Fermer la navigation"
                    >
                        <iconify-icon icon="solar:close-circle-bold" style={{ fontSize: '24px' }}></iconify-icon>
                    </button>
                    <iconify-icon icon="solar:widget-5-bold-duotone" className="me-2 text-primary" style={{ fontSize: '28px' }}></iconify-icon>
                    <div>
                        <h3 className="m-0 text-primary fw-bold lh-1" style={{ fontSize: '1.2rem' }}>
                            {userRole === 'SuperAdmin' ? 'SuperAdmin' : (userRole === 'Admin' ? 'Admin' : (userRole === 'AdminBar' ? 'Admin Bar' : (userRole === 'GérantBar' ? 'Gérant Bar' : (userRole === 'ServeurBar' ? 'Serveur Bar' : (userRole === 'Serveur' ? 'Serveur' : 'Gérant')))))}
                        </h3>
                        {userRole === 'Gérant' && boutiqueName && (
                            <small className="text-muted fw-bold d-block mt-1" style={{ fontSize: '0.85rem' }}>
                                {boutiqueName}
                            </small>
                        )}
                    </div>
                </div>
            </div>
{/* Section pour le SuperAdmin uniquement */}
{userRole === 'SuperAdmin' && (
    <div className="nav-section mt-3">
        <small className="text-muted text-uppercase ps-3 fw-bold" style={{ fontSize: '0.65rem' }}>
            Administration Globale
        </small>
        <Nav.Link 
            as={Link} 
            to="/admin/audit" 
            className={`d-flex align-items-center gap-2 px-3 py-2 mt-1 rounded-3 ${location.pathname === '/admin/audit' ? 'active bg-primary text-white' : 'text-dark'}`}
            onClick={handleNavLinkClick}
        >
            <iconify-icon icon="solar:clipboard-list-bold-duotone" style={{ fontSize: '20px' }}></iconify-icon>
            <span>Journal d'Audit Global</span>
        </Nav.Link>
        <Nav.Link 
            as={Link} 
            to="/admin/shops" 
            className={`d-flex align-items-center gap-2 px-3 py-2 rounded-3 ${location.pathname === '/admin/shops' ? 'active bg-primary text-white' : 'text-dark'}`}
            onClick={handleNavLinkClick}
        >
            <iconify-icon icon="solar:globus-bold-duotone" style={{ fontSize: '20px' }}></iconify-icon>
            <span>Vue Multi-Entreprises</span>
        </Nav.Link>
        <Nav.Link 
            as={Link} 
            to="/admin/users" 
            className={`d-flex align-items-center gap-2 px-3 py-2 rounded-3 ${location.pathname === '/admin/users' ? 'active bg-primary text-white' : 'text-dark'}`}
            onClick={handleNavLinkClick}
        >
            <iconify-icon icon="solar:users-group-two-rounded-bold-duotone" style={{ fontSize: '20px' }}></iconify-icon>
            <span>Gestion Utilisateurs</span>
        </Nav.Link>
    </div>
)}

            {/* Navigation Section */}
            <nav className="sidebar-nav scroll-sidebar">
                {['Admin', 'AdminBar'].includes(userRole) ? (
                    <ul id="sidebarnav">
                        <li className="nav-small-cap"><span className="hide-menu">Accueil</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to={userRole === 'AdminBar' ? "/admin-bar" : "/admin"} end onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:home-smile-angle-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Dashboard</span>
                            </NavLink>
                        </li>

                        <li className="nav-small-cap"><span className="hide-menu">Gestion</span></li>
                        {userRole === 'Admin' && (
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/caisse" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:cash-out-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Finances & Caisse</span>
                            </NavLink>
                        </li>
                        )}
                        {userRole === 'Admin' && (
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/creances" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:bill-check-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Créances</span>
                            </NavLink>
                        </li>
                        )}
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to={userRole === 'AdminBar' ? "/admin-bar/articles" : "/admin/articles"} onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:archive-check-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Articles</span>
                            </NavLink>
                        </li>
                        {userRole === 'Admin' && (
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/etat-stock" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:chart-square-bold-duotone"></iconify-icon>
                                <span className="hide-menu">État des stocks</span>
                            </NavLink>
                        </li>
                        )}
                        {userRole === 'Admin' && (
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/fournisseurs" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:delivery-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Fournisseurs</span>
                            </NavLink>
                        </li>
                        )}
                        {userRole === 'Admin' && (
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/centrale" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:box-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Dépôt Principal</span>
                            </NavLink>
                        </li>
                        )}
                        {userRole === 'Admin' && (
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/shops" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:shop-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Boutiques</span>
                            </NavLink>
                        </li>
                        )}

                        <li className="nav-small-cap"><span className="hide-menu">Opérations</span></li>
                        {userRole === 'Admin' && (
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/mouvements" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:graph-up-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Mouvements Stock</span>
                            </NavLink>
                        </li>
                        )}
                        {userRole === 'AdminBar' && (
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin-bar/creances" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:bill-check-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Créances</span>
                            </NavLink>
                        </li>
                        )}
                        {userRole === 'AdminBar' && (
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin-bar/fournisseurs" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:delivery-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Fournisseurs</span>
                            </NavLink>
                        </li>
                        )}
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to={userRole === 'AdminBar' ? "/admin-bar/ventes" : "/admin/ventes"} onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:bill-list-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Historique Ventes</span>
                            </NavLink>
                        </li>
                        {userRole === 'AdminBar' && (
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin-bar/mouvements" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:graph-up-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Mouvements Stock</span>
                            </NavLink>
                        </li>
                        )}
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to={userRole === 'AdminBar' ? "/admin-bar/clients" : "/admin/clients"} onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:users-group-two-rounded-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Clients & Ouvriers</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to={userRole === 'AdminBar' ? "/admin-bar/notifications" : "/admin/notifications"} onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:bell-bing-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Notifications</span>
                            </NavLink>
                        </li>

                        <li className="nav-small-cap"><span className="hide-menu">Administration</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to={userRole === 'AdminBar' ? "/admin-bar/managers" : "/admin/managers"} onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:user-plus-bold-duotone"></iconify-icon>
                                <span className="hide-menu">{userRole === 'AdminBar' ? 'Équipe Bar' : 'Gérants'}</span>
                            </NavLink>
                        </li>
                        {userRole === 'Admin' && (
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/audit" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:shield-check-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Journal d'Audit</span>
                            </NavLink>
                        </li>
                        )}
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to={userRole === 'AdminBar' ? "/admin-bar/bar-config" : "/admin/bar-config"} onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:settings-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Configuration Bar</span>
                            </NavLink>
                        </li>

                        <li className="sidebar-item mt-3 border-top pt-3 d-none d-lg-block">
                            <div className="sidebar-link text-danger" onClick={handleLogout} style={{ cursor: 'pointer' }}>
                                <iconify-icon icon="solar:logout-3-linear"></iconify-icon>
                                <span className="hide-menu fw-bold">Déconnexion</span>
                            </div>
                        </li>
                    </ul>
                ) : userRole === 'SuperAdmin' ? (
                    <ul id="sidebarnav">
                        <li className="nav-small-cap"><span className="hide-menu">Accueil</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin" end onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:home-smile-angle-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Dashboard</span>
                            </NavLink>
                        </li>

                        <li className="nav-small-cap"><span className="hide-menu">Gestion</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/caisse" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:cash-out-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Finances & Caisse</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/creances" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:bill-check-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Créances</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/articles" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:archive-check-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Articles</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/etat-stock" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:chart-square-bold-duotone"></iconify-icon>
                                <span className="hide-menu">État des stocks</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/fournisseurs" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:delivery-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Fournisseurs</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/centrale" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:box-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Dépôt Principal</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/shops" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:shop-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Boutiques</span>
                            </NavLink>
                        </li>

                        <li className="nav-small-cap"><span className="hide-menu">Opérations</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/mouvements" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:graph-up-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Mouvements Stock</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/ventes" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:bill-list-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Historique Ventes</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/clients" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:users-group-two-rounded-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Clients & Ouvriers</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/notifications" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:bell-bing-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Notifications</span>
                            </NavLink>
                        </li>

                        <li className="nav-small-cap"><span className="hide-menu">Administration</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/managers" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:user-plus-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Gérants</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/audit" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:shield-check-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Journal d'Audit</span>
                            </NavLink>
                        </li>

                        <li className="sidebar-item mt-3 border-top pt-3 d-none d-lg-block">
                            <div className="sidebar-link text-danger" onClick={handleLogout} style={{ cursor: 'pointer' }}>
                                <iconify-icon icon="solar:logout-3-linear"></iconify-icon>
                                <span className="hide-menu fw-bold">Déconnexion</span>
                            </div>
                        </li>
                    </ul>
                ) : userRole === 'Gérant' ? ( // Vue pour le Gérant
                    <ul id="sidebarnav">
                        <li className="nav-small-cap"><span className="hide-menu">Accueil</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/gerant" end onClick={handleNavLinkClick}> {/* Added onClick */}
                                <iconify-icon icon="solar:home-smile-angle-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Dashboard</span>
                            </NavLink>
                        </li>
                        <li className="nav-small-cap"><span className="hide-menu">Opérations</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/gerant/cashiers" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:user-plus-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Caissiers</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/gerant/ventes" onClick={handleNavLinkClick}> {/* Added onClick */}
                                <iconify-icon icon="solar:cart-4-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Effectuer une Vente</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/gerant/caisse/rapports-caissiers" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:clipboard-list-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Rapports Caissiers</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/gerant/historique?tab=history" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:bill-list-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Historique Ventes</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/gerant/articles" onClick={handleNavLinkClick}> {/* Added onClick */}
                                <iconify-icon icon="solar:archive-check-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Consulter le Stock</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/gerant/clients" onClick={handleNavLinkClick}> {/* Added onClick */}
                                <iconify-icon icon="solar:users-group-two-rounded-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Clients & Ouvriers</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/gerant/caisse" onClick={handleNavLinkClick}> {/* Added onClick */}
                                <iconify-icon icon="solar:cash-out-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Ma Caisse</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/gerant/creances" onClick={handleNavLinkClick}> {/* Added onClick */}
                                <iconify-icon icon="solar:bill-check-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Créances</span>
                            </NavLink>
                        </li>

                        <li className="sidebar-item mt-3 border-top pt-3 d-none d-lg-block">
                            <div className="sidebar-link text-danger" onClick={handleLogout} style={{ cursor: 'pointer' }}>
                                <iconify-icon icon="solar:logout-3-linear"></iconify-icon>
                                <span className="hide-menu fw-bold">Déconnexion</span>
                            </div>
                        </li>

                    </ul>
                ) : userRole === 'Caissier' ? ( // Vue pour le Caissier
                    <ul id="sidebarnav">
                        <li className="nav-small-cap"><span className="hide-menu">Accueil</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/caissier" end onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:home-smile-angle-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Dashboard</span>
                            </NavLink>
                        </li>
                        <li className="nav-small-cap"><span className="hide-menu">Opérations</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/caissier/pos" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:cart-plus-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Point de Vente</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/caissier/caisse" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:wallet-money-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Ma Caisse</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/caissier/creances" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:bill-check-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Créances</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item mt-3 border-top pt-3 d-none d-lg-block">
                            <div className="sidebar-link text-danger" onClick={handleLogout} style={{ cursor: 'pointer' }}>
                                <iconify-icon icon="solar:logout-3-linear"></iconify-icon>
                                <span className="hide-menu fw-bold">Déconnexion</span>
                            </div>
                        </li>
                    </ul>
                ) : userRole === 'GérantBar' ? (
                    <ul id="sidebarnav">
                        <li className="nav-small-cap"><span className="hide-menu">Accueil</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/gerant-bar" end onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:home-smile-angle-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Dashboard Bar</span>
                            </NavLink>
                        </li>
                        <li className="nav-small-cap"><span className="hide-menu">Opérations</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/gerant-bar/ventes" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:cart-4-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Effectuer une Vente</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/gerant-bar/historique" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:bill-list-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Historique Ventes</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/gerant-bar/articles" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:archive-check-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Stock Bar</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/gerant-bar/clients" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:users-group-two-rounded-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Clients</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/gerant-bar/equipe" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:user-plus-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Mon Équipe</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/gerant-bar/bar-config" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:settings-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Config Bar</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item mt-3 border-top pt-3 d-none d-lg-block">
                            <div className="sidebar-link text-danger" onClick={handleLogout} style={{ cursor: 'pointer' }}>
                                <iconify-icon icon="solar:logout-3-linear"></iconify-icon>
                                <span className="hide-menu fw-bold">Déconnexion</span>
                            </div>
                        </li>
                    </ul>
                ) : userRole === 'ServeurBar' ? (
                    <ul id="sidebarnav">
                        <li className="nav-small-cap"><span className="hide-menu">Accueil</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/serveur-bar" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:widget-3-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Tableau de Bord</span>
                            </NavLink>
                        </li>
                        <li className="nav-small-cap"><span className="hide-menu">Opérations</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/serveur-bar/ventes" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:cart-plus-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Prendre Commande</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/serveur-bar/commandes" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:cup-hot-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Commandes en cours</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item mt-3 border-top pt-3 d-none d-lg-block">
                            <div className="sidebar-link text-danger" onClick={handleLogout} style={{ cursor: 'pointer' }}>
                                <iconify-icon icon="solar:logout-3-linear"></iconify-icon>
                                <span className="hide-menu fw-bold">Déconnexion</span>
                            </div>
                        </li>
                    </ul>
                ) : ( // Vue pour le Serveur (Marchand)
                    <ul id="sidebarnav">
                        <li className="nav-small-cap"><span className="hide-menu">Accueil</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/serveur/dashboard" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:widget-3-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Tableau de Bord</span>
                            </NavLink>
                        </li>
                        <li className="nav-small-cap"><span className="hide-menu">Opérations</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/serveur/ventes" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:cart-plus-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Prendre Commande</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item mt-3 border-top pt-3 d-none d-lg-block">
                            <div className="sidebar-link text-danger" onClick={handleLogout} style={{ cursor: 'pointer' }}>
                                <iconify-icon icon="solar:logout-3-linear"></iconify-icon>
                                <span className="hide-menu fw-bold">Déconnexion</span>
                            </div>
                        </li>
                    </ul>
                )}

                {/* Utility Nav for Mobile */}
                <div className="d-lg-none mt-auto py-2 border-top"> {/* mt-auto pushes it to the bottom */}
                    <Nav className="flex-column">
                        <Nav.Item>
                            <Button variant="link" onClick={toggleTheme} className="sidebar-link text-body-secondary d-flex align-items-center">
                                <iconify-icon icon={theme === 'dark' ? 'solar:sun-bold-duotone' : 'solar:moon-bold-duotone'} style={{ fontSize: '22px' }}></iconify-icon>
                                <span className="hide-menu ms-3">Thème {theme === 'dark' ? 'Clair' : 'Sombre'}</span>
                            </Button>
                        </Nav.Item>

                        <NavDropdown
                            title={
                                <span className="position-relative d-inline-flex align-items-center sidebar-link text-body-secondary">
                                    <iconify-icon icon="solar:bell-bing-bold-duotone" style={{ fontSize: '22px' }}></iconify-icon>
                                    <span className="hide-menu ms-3">Notifications</span>
                                    {unreadCount > 0 && (
                                        <Badge pill bg="danger" className="position-absolute top-0 start-100 translate-middle border border-light" style={{ fontSize: '0.6em', padding: '0.3em 0.5em' }}>
                                            {unreadCount > 9 ? '9+' : unreadCount}
                                        </Badge>
                                    )}
                                </span>
                            }
                            id="notification-dropdown-sidebar"
                            align="end" // Align to end of dropdown, not screen
                            className="notifications-dropdown"
                        >
                            <div className="d-flex justify-content-between align-items-center px-3 py-2">
                                <h6 className="mb-0 fw-bold">Notifications</h6>
                                {unreadCount > 0 && <Button size="sm" variant="link" className="p-0" onClick={handleMarkAllRead}>Tout marquer comme lu</Button>}
                            </div>
                            <NavDropdown.Divider className="my-0" />
                            <div className="notification-list">
                                {notifications.length > 0 ? notifications.slice(0, 7).map(n => (
                                    <NavDropdown.Item key={n._id} onClick={() => handleNotificationClick(n)} className={`py-2 ${!n.read ? 'bg-primary-subtle' : ''}`}>
                                        <div className={`small ${!n.read ? 'fw-bold' : ''}`}>{n.message}</div>
                                        <div className="text-muted small mt-1">{new Date(n.createdAt).toLocaleString('fr-FR')}</div>
                                    </NavDropdown.Item>
                                )) : (
                                    <div className="text-center text-muted p-3 small">Aucune notification</div>
                                )}
                            </div>
                            <NavDropdown.Divider className="my-0" />
                            <NavDropdown.Item as={Link} to={userRole === 'Admin' ? "/admin/notifications" : "/gerant/notifications"} className="text-center fw-bold py-2" onClick={handleNavLinkClick}>
                                Voir tout
                            </NavDropdown.Item>
                        </NavDropdown>

                        <NavDropdown
                            title={
                                <div className="d-flex align-items-center sidebar-link text-body-secondary">
                                    <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=random&color=fff&rounded=true&size=32`} alt="avatar" className="me-2" />
                                    <span className="hide-menu">{userName}</span>
                                </div>
                            }
                            id="user-dropdown-sidebar"
                            align="end"
                        >
                            <NavDropdown.Header><div className="fw-bold">{userName}</div><div className="text-muted small">{userRole}</div></NavDropdown.Header>
                            <NavDropdown.Divider />
                            <NavDropdown.Item as={Link} to="/profile" onClick={handleNavLinkClick}><iconify-icon icon="solar:user-circle-linear" className="me-2"></iconify-icon> Mon Profil</NavDropdown.Item>
                            <NavDropdown.Item onClick={handleLogout}><iconify-icon icon="solar:logout-3-linear" className="me-2"></iconify-icon> Déconnexion</NavDropdown.Item>
                        </NavDropdown>

                        {/* Bouton déconnexion direct et visible pour mobile */}
                        <Nav.Item className="mt-4 d-flex justify-content-center">
                            <Button 
                                variant="danger" 
                                onClick={handleLogout} 
                                className="shadow-sm rounded-circle d-flex align-items-center justify-content-center p-0"
                                style={{ width: '48px', height: '48px' }}
                                title="Déconnexion"
                            >
                                <iconify-icon icon="solar:logout-3-linear" style={{ fontSize: '24px' }}></iconify-icon>
                            </Button>
                        </Nav.Item>
                    </Nav>
                </div>
            </nav>
        </aside>
    );
};
export default Sidebar;




 

   
