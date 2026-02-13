// src/components/common/Header.js
import React from 'react';
import { Navbar, Nav, NavDropdown, Form } from 'react-bootstrap';
import { Link } from 'react-router-dom';

const Header = ({ userName, userRole, onLogout, theme, toggleTheme }) => {
  return (
    <Navbar expand="lg" className="border-bottom shadow-sm px-4 py-2 bg-body">
      <Navbar.Toggle aria-controls="main-navbar" />
      <Navbar.Collapse id="main-navbar">
        {/* Espaceur pour pousser les icônes à droite */}
        <Nav className="me-auto"></Nav>

        <Nav className="align-items-center">
          {/* --- Bouton Mode Sombre --- */}
          <div className="d-flex align-items-center me-3">
            <iconify-icon icon={theme === 'light' ? 'solar:sun-bold' : 'solar:moon-bold'} style={{ fontSize: '20px' }}></iconify-icon>
            <Form.Check
              type="switch"
              id="theme-switch"
              className="ms-2"
              checked={theme === 'dark'}
              onChange={toggleTheme}
            />
          </div>
          <NavDropdown
            title={
              <div className="d-flex align-items-center">
                <div className="me-2 text-end">
                  <div className="fw-bold">{userName || 'Utilisateur'}</div>
                  <small className="text-muted">{userRole}</small>
                </div>
                <iconify-icon icon="solar:user-circle-bold-duotone" style={{ fontSize: '36px' }}></iconify-icon>
              </div>
            }
            id="user-nav-dropdown"
            align="end"
          >
            <NavDropdown.Item as={Link} to="/profile">
              <iconify-icon icon="solar:user-circle-linear" className="me-2 align-middle"></iconify-icon>
              Mon Profil
            </NavDropdown.Item>
            <NavDropdown.Item onClick={onLogout} className="text-danger">
              <iconify-icon icon="solar:logout-3-linear" className="me-2 align-middle"></iconify-icon>
              Déconnexion
            </NavDropdown.Item>
          </NavDropdown>
        </Nav>
      </Navbar.Collapse>
    </Navbar>
  );
};

export default Header;