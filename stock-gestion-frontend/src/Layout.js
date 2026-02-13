// src/components/Layout.js
import React from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { Container, Navbar, Nav, NavDropdown } from 'react-bootstrap';
import './Layout.css'; // Import du nouveau fichier CSS

const Layout = ({ onLogout, userRole }) => {
  const navigate = useNavigate();
  const location = useLocation(); // Pour mettre en surbrillance le lien actif

  const handleLogout = () => {
    onLogout();
    navigate('/login');
  };

  return (
    <div className="d-flex" id="wrapper">
      {/* Sidebar (Barre latérale) */}
      <div id="sidebar-wrapper">
        <div className="sidebar-heading">StockMaster</div>
        <div className="list-group list-group-flush">
          <Link to="/" className={`list-group-item list-group-item-action ${location.pathname === '/' ? 'active' : ''}`}>
            <i className="bi bi-speedometer2 me-2"></i> Tableau de bord
          </Link>
          
          {userRole === 'Admin' && (
            <>
              <Link to="/boutiques" className={`list-group-item list-group-item-action ${location.pathname === '/boutiques' ? 'active' : ''}`}>
                <i className="bi bi-shop me-2"></i> Boutiques
              </Link>
              <Link to="/gerants" className={`list-group-item list-group-item-action ${location.pathname === '/gerants' ? 'active' : ''}`}>
                <i className="bi bi-people me-2"></i> Gérants
              </Link>
            </>
          )}

          <Link to="/articles" className={`list-group-item list-group-item-action ${location.pathname === '/articles' ? 'active' : ''}`}>
            <i className="bi bi-box-seam me-2"></i> Articles
          </Link>

          {userRole === 'Gérant' && (
            <Link to="/ventes" className={`list-group-item list-group-item-action ${location.pathname === '/ventes' ? 'active' : ''}`}>
              <i className="bi bi-cart3 me-2"></i> Ventes
            </Link>
          )}
        </div>
      </div>

      {/* Page Content (Contenu principal) */}
      <div id="page-content-wrapper">
        <Navbar bg="white" expand="lg" className="border-bottom shadow-sm px-4 py-3">
          <Container fluid>
            <Navbar.Brand href="#" className="text-muted">Gestion de Stock</Navbar.Brand>
            <Navbar.Toggle aria-controls="navbarSupportedContent" />
            <Navbar.Collapse id="navbarSupportedContent" className="justify-content-end">
              <Nav>
                <NavDropdown title={<span><i className="bi bi-person-circle me-1"></i> {userRole}</span>} id="basic-nav-dropdown" align="end">
                  <NavDropdown.Item onClick={handleLogout} className="text-danger">Déconnexion</NavDropdown.Item>
                </NavDropdown>
              </Nav>
            </Navbar.Collapse>
          </Container>
        </Navbar>

        <Container fluid className="p-4">
          <Outlet />
        </Container>
      </div>
    </div>
  );
};

export default Layout;