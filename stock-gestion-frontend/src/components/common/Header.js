// src/components/common/Header.js
import React, { useState, useRef } from 'react';
import { Navbar, Nav, NavDropdown, Form, Image, Button } from 'react-bootstrap';
import { Link } from 'react-router-dom';

const Header = ({ userName, userRole, onLogout, theme, toggleTheme }) => {
  // Génération d'un avatar stylisé basé sur les initiales du nom
  const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName || 'User')}&background=0D6EFD&color=fff&rounded=true&bold=true`;

  // État pour contrôler l'affichage du menu au survol
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const timeoutRef = useRef(null);

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

  return (
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
      `}</style>

      <Navbar.Toggle aria-controls="main-navbar" />
      <Navbar.Collapse id="main-navbar">
        {/* Espaceur pour pousser les icônes à droite */}
        <Nav className="me-auto"></Nav>

        <Nav className="align-items-center gap-3">
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
  );
};

export default Header;