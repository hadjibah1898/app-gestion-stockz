// src/components/common/Sidebar.js
import React, { useState, useEffect } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { Nav, NavDropdown, Badge, Button } from 'react-bootstrap'; // Import Bootstrap Nav components
import { authAPI, venteAPI } from '../../services/api';
import { useNotifications } from '../../NotificationContext'; // Import notifications context
import './Sidebar.css';

const Sidebar = ({ userRole, isSidebarOpen, toggleSidebar, userName, handleLogout, theme, toggleTheme }) => {
    const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
    // Le menu s'adapte en fonction du rôle de l'utilisateur
    const [boutiqueName, setBoutiqueName] = useState('');
    const [pendingOrdersCount, setPendingOrdersCount] = useState(0);

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

            const fetchPendingOrders = async () => {
                try {
                    const res = await venteAPI.getHistorique({ limit: 0, statut: 'commande' });
                    setPendingOrdersCount(res.data.ventes?.length || 0);
                } catch (e) { /* ignore */ }
            };

            fetchUserBoutique();
            fetchPendingOrders();
            const interval = setInterval(fetchPendingOrders, 60000); // Check every minute
            return () => clearInterval(interval);
        }
    }, [userRole]);

    const navigate = useNavigate();

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
                            {userRole === 'Admin' ? 'Admin' : (userRole === 'Serveur' ? 'Serveur' : 'Gérant')}
                        </h3>
                        {userRole === 'Gérant' && boutiqueName && (
                            <small className="text-muted fw-bold d-block mt-1" style={{ fontSize: '0.85rem' }}>
                                {boutiqueName}
                            </small>
                        )}
                    </div>
                </div>
            </div>

            {/* Navigation Section */}
            <nav className="sidebar-nav scroll-sidebar">
                {userRole === 'Admin' ? (
                    <ul id="sidebarnav">
                        <li className="nav-small-cap"><span className="hide-menu">Accueil</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin" end onClick={handleNavLinkClick}> {/* Added onClick */}
                                <iconify-icon icon="solar:home-smile-angle-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Dashboard</span>
                            </NavLink>
                        </li>

                        <li className="nav-small-cap"><span className="hide-menu">Gestion</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/managers" onClick={handleNavLinkClick}> {/* Added onClick */}
                                <iconify-icon icon="solar:users-group-rounded-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Gérants</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/shops" onClick={handleNavLinkClick}> {/* Added onClick */}
                                <iconify-icon icon="solar:shop-2-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Boutiques</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/articles" onClick={handleNavLinkClick}> {/* Added onClick */}
                                <iconify-icon icon="solar:archive-check-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Articles</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/etat-stock" onClick={handleNavLinkClick}> {/* Added onClick */}
                                <iconify-icon icon="solar:chart-square-bold-duotone"></iconify-icon>
                                <span className="hide-menu">État des stocks</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/fournisseurs" onClick={handleNavLinkClick}> {/* Added onClick */}
                                <iconify-icon icon="solar:delivery-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Fournisseurs</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/centrale" onClick={handleNavLinkClick}> {/* Added onClick */}
                                <iconify-icon icon="solar:box-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Dépôt Principal</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/caisse" onClick={handleNavLinkClick}> {/* Added onClick */}
                                <iconify-icon icon="solar:wallet-money-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Finances & Caisse</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/creances" onClick={handleNavLinkClick}> {/* Added onClick */}
                                <iconify-icon icon="solar:bill-check-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Créances</span>
                            </NavLink>
                        </li>


                        <li className="nav-small-cap"><span className="hide-menu">Opérations</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/mouvements" onClick={handleNavLinkClick}> {/* Added onClick */}
                                <iconify-icon icon="solar:graph-up-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Mouvements Stock</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/ventes" onClick={handleNavLinkClick}> {/* Added onClick */}
                                <iconify-icon icon="solar:bill-list-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Historique Ventes</span>
                            </NavLink>
                        </li>
                        
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/clients" onClick={handleNavLinkClick}> {/* Added onClick */}
                                <iconify-icon icon="solar:users-group-two-rounded-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Clients & Ouvriers</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/notifications" onClick={handleNavLinkClick}> {/* Added onClick */}
                                <iconify-icon icon="solar:bell-bing-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Notifications</span>
                            </NavLink>
                        </li>

                        <li className="nav-small-cap"><span className="hide-menu">Administration</span></li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/admin/audit" onClick={handleNavLinkClick}> {/* Added onClick */}
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
                            <NavLink className="sidebar-link" to="/gerant/ventes" onClick={handleNavLinkClick}> {/* Added onClick */}
                                <iconify-icon icon="solar:cart-4-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Effectuer une Vente</span>
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/gerant/historique?tab=history&filter=pending" onClick={handleNavLinkClick}>
                                <iconify-icon icon="solar:cup-hot-bold-duotone"></iconify-icon>
                                <span className="hide-menu">Commandes Serveurs</span>
                                {pendingOrdersCount > 0 && (
                                    <Badge pill bg="danger" className="ms-auto blink-animation">
                                        {pendingOrdersCount}
                                    </Badge>
                                )}
                            </NavLink>
                        </li>
                        <li className="sidebar-item">
                            <NavLink className="sidebar-link" to="/gerant/historique?tab=history&filter=finalized" onClick={handleNavLinkClick}>
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
                ) : ( // Vue pour le Serveur
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




 

   
