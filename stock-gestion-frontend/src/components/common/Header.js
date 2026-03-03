import React from 'react';
import { Navbar, Nav, NavDropdown, Badge, Button } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { useNotifications } from '../../NotificationContext';
import './Header.css';

const Header = ({ userName, userRole, onLogout, theme, toggleTheme }) => {
    const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
    const navigate = useNavigate();

    const handleNotificationClick = (notification) => {
        if (!notification.read) {
            markAsRead(notification._id);
        }
        if (notification.link) {
            navigate(notification.link);
        }
    };

    const handleMarkAllRead = async () => {
        await markAllAsRead();
    };

    const notificationRoute = userRole === 'Admin' ? "/admin/notifications" : "/gerant/notifications";

    return (
        <Navbar expand="lg" className="header shadow-sm px-4" bg="body" variant={theme}>
            <Navbar.Brand as={Link} to="/" className="fw-bold d-flex align-items-center">
                <iconify-icon icon="solar:widget-5-bold-duotone" className="me-2 text-primary" style={{ fontSize: '28px' }}></iconify-icon>
                StockDash
            </Navbar.Brand>
            <Navbar.Toggle aria-controls="basic-navbar-nav" />
            <Navbar.Collapse id="basic-navbar-nav">
                <Nav className="ms-auto align-items-center">
                    <Button variant="link" onClick={toggleTheme} className="nav-link text-body-secondary">
                        <iconify-icon icon={theme === 'dark' ? 'solar:sun-bold-duotone' : 'solar:moon-bold-duotone'} style={{ fontSize: '22px' }}></iconify-icon>
                    </Button>

                    <NavDropdown
                        title={
                            <span className="position-relative d-inline-block">
                                <iconify-icon icon="solar:bell-bing-bold-duotone" style={{ fontSize: '22px' }}></iconify-icon>
                                {unreadCount > 0 && (
                                    <Badge pill bg="danger" className="position-absolute top-0 start-100 translate-middle border border-light" style={{ fontSize: '0.6em', padding: '0.3em 0.5em' }}>
                                        {unreadCount > 9 ? '9+' : unreadCount}
                                    </Badge>
                                )}
                            </span>
                        }
                        id="notification-dropdown"
                        align="end"
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
                        <NavDropdown.Item as={Link} to={notificationRoute} className="text-center fw-bold py-2">
                            Voir tout
                        </NavDropdown.Item>
                    </NavDropdown>

                    <NavDropdown title={<div className="d-flex align-items-center"><img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=random&color=fff&rounded=true&size=32`} alt="avatar" className="me-2" /><span className="d-none d-lg-inline">{userName}</span></div>} id="user-dropdown" align="end">
                        <NavDropdown.Header><div className="fw-bold">{userName}</div><div className="text-muted small">{userRole}</div></NavDropdown.Header>
                        <NavDropdown.Divider />
                        <NavDropdown.Item as={Link} to="/profile"><iconify-icon icon="solar:user-circle-linear" className="me-2"></iconify-icon> Mon Profil</NavDropdown.Item>
                        <NavDropdown.Item onClick={onLogout}><iconify-icon icon="solar:logout-3-linear" className="me-2"></iconify-icon> Déconnexion</NavDropdown.Item>
                    </NavDropdown>
                </Nav>
            </Navbar.Collapse>
        </Navbar>
    );
};

export default Header;