// src/components/common/Header.js
import React, { useState, useRef, useEffect } from 'react';
import { Navbar, Nav, NavDropdown, Form, Image, Button, Badge, Toast, ToastContainer } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { articleAPI, authAPI } from '../../services/api';

const Header = ({ userName, userRole, onLogout, theme, toggleTheme }) => {
  const navigate = useNavigate();
  // Génération d'un avatar stylisé basé sur les initiales du nom
  const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName || 'User')}&background=0D6EFD&color=fff&rounded=true&bold=true`;

  // État pour contrôler l'affichage du menu au survol
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const timeoutRef = useRef(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const prevCountRef = useRef(-1); // Initialisé à -1 pour ne pas sonner au chargement de la page

  const playNotificationSound = () => {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        
        const audioCtx = new AudioContext();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        // Son type "Ding" (Sinusoïdale qui s'atténue)
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // Note La (A5)
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.5);

        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
        console.error("Erreur lecture son notification", e);
    }
  };

  // Logique de récupération des notifications (Admin & Gérant)
  useEffect(() => {
    if (userRole === 'Admin') {
        const fetchNotifications = async () => {
            try {
                const res = await articleAPI.getAll();
                // Filtrer les articles qui ont une remise en attente
                const pending = res.data.filter(a => a.remiseEnAttente && a.remiseEnAttente.valeur > 0);
                // Trier par date de demande (le plus récent en premier)
                pending.sort((a, b) => new Date(b.remiseEnAttente.dateDemande || 0) - new Date(a.remiseEnAttente.dateDemande || 0));
                
                // Jouer un son si le nombre de notifications a augmenté (nouvelle demande)
                if (prevCountRef.current !== -1 && pending.length > prevCountRef.current) {
                    playNotificationSound();
                    
                    const latest = pending[0];
                    const gerantName = latest?.remiseEnAttente?.gerant?.nom || 'Un gérant';
                    setToastMessage(`${gerantName} demande une remise sur ${latest?.nom}.`);
                    
                    setShowToast(true);
                }
                prevCountRef.current = pending.length;
                setNotifications(pending);
            } catch (err) {
                console.error("Erreur chargement notifications", err);
            }
        };
        fetchNotifications();
        // Optionnel : Rafraîchir toutes les minutes
        const interval = setInterval(fetchNotifications, 60000);
        return () => clearInterval(interval);
    }
    else if (userRole === 'Gérant') {
        const fetchUserNotifications = async () => {
            try {
                const res = await authAPI.getNotifications();
                // Filtrer les non lues pour le badge et le son
                const unread = res.data.filter(n => !n.read);
                
                if (prevCountRef.current !== -1 && unread.length > prevCountRef.current) {
                    playNotificationSound();
                    setToastMessage(unread[0]?.message || "Nouvelle notification !");
                    setShowToast(true);
                }
                prevCountRef.current = unread.length;
                setNotifications(res.data); // On garde tout l'historique pour la liste
            } catch (err) {
                console.error("Erreur notifs gérant", err);
            }
        };
        fetchUserNotifications();
        const interval = setInterval(fetchUserNotifications, 60000);
        return () => clearInterval(interval);
    }
  }, [userRole]);

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setShowProfileMenu(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setShowProfileMenu(false);
    }, 300); // Délai de 300ms pour laisser le temps de traverser l'espace
  };

  const handleNotificationClick = async (notif) => {
      if (userRole === 'Gérant' && !notif.read) {
          await authAPI.markNotificationRead(notif._id);
          // Mise à jour locale rapide
          setNotifications(notifications.map(n => n._id === notif._id ? { ...n, read: true } : n));
      }
  };

  return (
    <>
    <Navbar expand="lg" className="border-bottom shadow-sm px-4 py-2 bg-body sticky-top">
      {/* Styles spécifiques pour ce menu dropdown moderne */}
      <style>{`
        .profile-dropdown .dropdown-toggle::after {
            display: none; /* Cache la flèche par défaut */
        }
        .profile-dropdown .dropdown-menu {
            width: 320px;
            border: none;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
            border-radius: 16px;
            padding: 0;
            margin-top: 15px;
            animation: fadeIn 0.2s ease-out;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .profile-item:hover {
            background-color: var(--bs-tertiary-bg);
        }
        .notification-dropdown .dropdown-menu {
            width: 350px;
            border: none;
            box-shadow: 0 10px 40px rgba(0,0,0,0.15);
            border-radius: 16px;
            padding: 0;
            margin-top: 15px;
            max-height: 500px;
            overflow-y: auto;
        }
        @keyframes bell-blink {
            0% { color: #dc3545; transform: scale(1); }
            50% { color: #ff6b6b; transform: scale(1.1); }
            100% { color: #dc3545; transform: scale(1); }
        }
        .bell-active {
            animation: bell-blink 1.5s infinite ease-in-out;
        }
      `}</style>

      <Navbar.Toggle aria-controls="main-navbar" />
      <Navbar.Collapse id="main-navbar">
        {/* Espaceur pour pousser les icônes à droite */}
        <Nav className="me-auto"></Nav>

        <Nav className="align-items-center gap-3">
          
          {/* --- Centre de Notifications (Admin Uniquement) --- */}
          {(userRole === 'Admin' || userRole === 'Gérant') && (
            <NavDropdown
                title={
                    <div className={`position-relative d-flex align-items-center ${(userRole === 'Admin' ? notifications.length : notifications.filter(n=>!n.read).length) > 0 ? 'bell-active' : 'text-secondary'}`}>
                        <iconify-icon icon="solar:bell-bing-bold-duotone" style={{ fontSize: '24px' }}></iconify-icon>
                        {/* Badge : Pour Admin = total liste, Pour Gérant = total non lu */}
                        {(userRole === 'Admin' ? notifications.length : notifications.filter(n=>!n.read).length) > 0 && (
                            <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger border border-light" style={{fontSize: '10px'}}>
                                {userRole === 'Admin' ? notifications.length : notifications.filter(n=>!n.read).length}
                            </span>
                        )}
                    </div>
                }
                id="notification-dropdown"
                align="end"
                className="notification-dropdown"
            >
                <div className="px-4 py-3 border-bottom d-flex justify-content-between align-items-center bg-body">
                    <h6 className="mb-0 fw-bold">Notifications</h6>
                    {(userRole === 'Admin' ? notifications.length : notifications.filter(n=>!n.read).length) > 0 && <Badge bg="primary-subtle" text="primary" pill>New</Badge>}
                </div>

                <div className="py-2">
                    {notifications.length > 0 ? (
                        notifications.map((item) => (
                            <div 
                                key={item._id} 
                                className={`dropdown-item px-4 py-3 border-bottom border-light profile-item ${userRole === 'Gérant' && !item.read ? 'bg-primary-subtle' : ''}`}
                                onClick={() => {
                                    if (userRole === 'Admin') navigate('/admin/articles');
                                    else handleNotificationClick(item);
                                }}
                                style={{cursor: 'pointer'}}
                            >
                                <div className="d-flex gap-3">
                                    <div className="bg-warning-subtle text-warning rounded-circle d-flex align-items-center justify-content-center flex-shrink-0" style={{width: '40px', height: '40px'}}>
                                        <iconify-icon icon="solar:tag-price-bold-duotone" style={{fontSize: '20px'}}></iconify-icon>
                                    </div>
                                    <div>
                                        {userRole === 'Admin' ? (
                                            <>
                                                <h6 className="mb-1 fs-6 fw-semibold text-truncate" style={{maxWidth: '200px'}}>Demande de remise</h6>
                                                <p className="mb-1 small text-muted">
                                                    <span className="fw-bold text-dark">{item.remiseEnAttente?.gerant?.nom || 'Un gérant'}</span> demande <span className="fw-bold text-primary">{item.remiseEnAttente?.valeur}%</span> sur {item.nom}.
                                                </p>
                                            </>
                                        ) : (
                                            <>
                                                <p className="mb-1 small text-dark fw-medium">{item.message}</p>
                                            </>
                                        )}
                                        <small className="text-muted" style={{fontSize: '11px'}}>
                                            {new Date(userRole === 'Admin' ? item.remiseEnAttente?.dateDemande : item.createdAt).toLocaleString()}
                                        </small>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-4 text-muted small">
                            <iconify-icon icon="solar:bell-off-linear" style={{fontSize: '32px', opacity: 0.5}} className="mb-2 d-block mx-auto"></iconify-icon>
                            Aucune nouvelle notification
                        </div>
                    )}
                </div>
                
                <div className="p-3 border-top text-center">
                    {userRole === 'Admin' && (
                        <Button variant="outline-primary" size="sm" className="rounded-pill w-100" onClick={() => navigate('/admin/articles')}>
                            Voir toutes les demandes
                        </Button>
                    )}
                </div>
            </NavDropdown>
          )}

          {/* --- Bouton Mode Sombre --- */}
          <div className="d-flex align-items-center">
            <iconify-icon icon={theme === 'light' ? 'solar:sun-bold' : 'solar:moon-bold'} style={{ fontSize: '20px' }}></iconify-icon>
            <Form.Check
              type="switch"
              id="theme-switch"
              className="ms-2"
              checked={theme === 'dark'}
              onChange={toggleTheme}
            />
          </div>

          {/* --- Menu Profil Moderne --- */}
          <NavDropdown
            title={
              <div className="d-flex align-items-center gap-2 pointer">
                <Image 
                    src={avatarUrl} 
                    alt="profile" 
                    roundedCircle 
                    width="45" 
                    height="45" 
                    className="border border-2 border-primary p-1"
                />
              </div>
            }
            id="user-nav-dropdown"
            align="end"
            show={showProfileMenu}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className="profile-dropdown"
          >
            {/* En-tête du Profil */}
            <div className="px-4 py-3 border-bottom bg-primary-subtle rounded-top-4">
                <h5 className="mb-0 fw-bold text-truncate text-primary">{userName || 'Utilisateur'}</h5>
                <span className="text-muted small fw-medium">{userRole}</span>
                <div className="d-flex align-items-center gap-1 text-muted small mt-1">
                    <iconify-icon icon="solar:letter-linear"></iconify-icon>
                    <span>{userName ? `${userName.split(' ')[0].toLowerCase()}@stockdash.com` : 'email@example.com'}</span>
                </div>
            </div>

            {/* Liste de Navigation */}
            <div className="p-2">
                <Link to="/profile" className="dropdown-item d-flex align-items-center gap-3 p-2 rounded-3 mb-1 profile-item">
                    <div className="d-flex align-items-center justify-content-center bg-primary-subtle text-primary rounded-3" style={{width: '45px', height: '45px'}}>
                        <iconify-icon icon="solar:user-circle-bold-duotone" style={{fontSize: '24px'}}></iconify-icon>
                    </div>
                    <div>
                        <h6 className="mb-0 fw-semibold">Mon Profil</h6>
                        <small className="text-muted">Paramètres du compte</small>
                    </div>
                </Link>
            </div>

            {/* Action Principale */}
            <div className="p-3 border-top">
                <Button variant="primary" className="w-100 rounded-pill py-2 fw-bold shadow-sm" onClick={onLogout}>
                    Déconnexion
                </Button>
            </div>
          </NavDropdown>
        </Nav>
      </Navbar.Collapse>
    </Navbar>

    {/* Notification Toast (Popup en bas à droite) */}
    <ToastContainer position="bottom-end" className="p-3" style={{ zIndex: 1050, position: 'fixed' }}>
        <Toast onClose={() => setShowToast(false)} show={showToast} delay={5000} autohide bg="primary">
            <Toast.Header>
                <iconify-icon icon="solar:bell-bing-bold-duotone" className="me-2 text-primary"></iconify-icon>
                <strong className="me-auto">Nouvelle Demande</strong>
                <small>À l'instant</small>
            </Toast.Header>
            <Toast.Body className="text-white">
                {toastMessage || "Une nouvelle demande de remise est en attente de validation."}
            </Toast.Body>
        </Toast>
    </ToastContainer>
    </>
  );
};

export default Header;