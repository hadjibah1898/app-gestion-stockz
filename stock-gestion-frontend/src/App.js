// src/App.js
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Modal, Form, Button, Alert, Spinner, InputGroup } from 'react-bootstrap';
import Sidebar from './components/common/Sidebar';
import Header from './components/common/Header'; // Importer le Header
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import { authAPI } from './services/api';
import GerantDashboard from './components/GerantDashboard';
import ManagersView from './components/ManagersView';
import ShopsView from './components/ShopsView';
import ArticlesView from './components/ArticlesView';
import VentesView from './components/VentesView';
import ProfileView from './components/ProfileView';
import ProtectedRoute from './components/common/ProtectedRoute';
import './App.css';

// Le Layout principal qui inclut la Sidebar et la zone de contenu
const MainLayout = ({ userName, userRole, handleLogout, theme, toggleTheme }) => (
  <>
    <Sidebar userRole={userRole} />
    <div className="page-wrapper">
      <Header userName={userName} userRole={userRole} onLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} />
      <Outlet context={{ theme }} /> {/* Les composants de route enfants s'afficheront ici */}
    </div>
  </>
);

function App() {
  // On récupère les infos utilisateur depuis le localStorage pour la persistance
  const [userRole, setUserRole] = useState(localStorage.getItem('userRole'));
  const [userName, setUserName] = useState(localStorage.getItem('userName'));
  const [mustChangePassword, setMustChangePassword] = useState(localStorage.getItem('mustChangePassword') === 'true');
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  
  // États pour la modale de changement de mot de passe
  const [pwdData, setPwdData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwdError, setPwdError] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);

  useEffect(() => {
    // Applique le thème au body et sauvegarde le choix
    document.body.setAttribute('data-bs-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  const handleLogin = (newToken, role, name, mustChange) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('userRole', role);
    localStorage.setItem('userName', name);
    if (mustChange) localStorage.setItem('mustChangePassword', 'true');
    
    setUserRole(role);
    setUserName(name);
    setMustChangePassword(mustChange);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userName');
    localStorage.removeItem('mustChangePassword');
    setUserRole(null);
    setUserName(null);
    setMustChangePassword(false);
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (pwdData.newPassword !== pwdData.confirmPassword) {
      return setPwdError("Les nouveaux mots de passe ne correspondent pas.");
    }
    setPwdLoading(true);
    setPwdError('');
    try {
      await authAPI.changePassword({ 
        currentPassword: pwdData.currentPassword, 
        newPassword: pwdData.newPassword 
      });
      setMustChangePassword(false);
      localStorage.removeItem('mustChangePassword');
      alert("Mot de passe changé avec succès !");
    } catch (err) {
      setPwdError(err.response?.data?.message || "Erreur lors du changement de mot de passe.");
    } finally {
      setPwdLoading(false);
    }
  };

  return (
    <Router>
      <div id="main-wrapper" data-bs-theme={theme}>
        <Routes>
          <Route path="/login" element={!userRole ? <Auth onLogin={handleLogin} /> : <Navigate to={userRole === 'Admin' ? '/admin' : '/gerant'} />} />

          {/* Routes Protégées pour l'Admin */}
          <Route 
            element={
              <ProtectedRoute userRole={userRole} requiredRole="Admin" >
                <MainLayout userName={userName} userRole={userRole} handleLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} />
              </ProtectedRoute>
            }
          >
            <Route path="/admin" element={<Dashboard />} />
            <Route path="/admin/managers" element={<ManagersView />} />
            <Route path="/admin/shops" element={<ShopsView />} />
            <Route path="/admin/articles" element={<ArticlesView userRole="Admin" />} />
            <Route path="/admin/ventes" element={<VentesView userRole="Admin" />} />
          </Route>

          {/* Routes Protégées pour le Gérant */}
          <Route 
            element={
              <ProtectedRoute userRole={userRole} requiredRole="Gérant" >
                <MainLayout userName={userName} userRole={userRole} handleLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} />
              </ProtectedRoute>
            }
          >
            <Route path="/gerant" element={<GerantDashboard />} />
            <Route path="/gerant/articles" element={<ArticlesView userRole="Gérant" />} />
            <Route path="/gerant/ventes" element={<VentesView userRole="Gérant" />} />
          </Route>

          {/* Routes Partagées (Profil) */}
          <Route 
            element={
              <ProtectedRoute userRole={userRole} requiredRole={['Admin', 'Gérant']} >
                <MainLayout userName={userName} userRole={userRole} handleLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} />
              </ProtectedRoute>
            }
          >
            <Route path="/profile" element={<ProfileView />} />
          </Route>

          <Route path="/" element={<Navigate to={!userRole ? "/login" : (userRole === 'Admin' ? "/admin" : "/gerant")} />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>

      {/* Modale de changement de mot de passe obligatoire */}
      <Modal show={!!userRole && mustChangePassword} backdrop="static" keyboard={false} centered>
        <Modal.Header>
          <Modal.Title className="text-danger">🔒 Changement de mot de passe requis</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handlePasswordChange}>
          <Modal.Body>
            <Alert variant="warning">
              Pour votre sécurité, vous devez changer votre mot de passe par défaut avant de continuer.
            </Alert>
            {pwdError && <Alert variant="danger">{pwdError}</Alert>}
            
            <Form.Group className="mb-3">
              <Form.Label>Mot de passe actuel</Form.Label>
              <InputGroup>
                <Form.Control type={showCurrentPwd ? "text" : "password"} required 
                  value={pwdData.currentPassword}
                  onChange={(e) => setPwdData({...pwdData, currentPassword: e.target.value})}
                />
                <Button variant="outline-secondary" onClick={() => setShowCurrentPwd(!showCurrentPwd)}>
                  <iconify-icon icon={showCurrentPwd ? "solar:eye-bold" : "solar:eye-closed-bold"}></iconify-icon>
                </Button>
              </InputGroup>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Nouveau mot de passe</Form.Label>
              <InputGroup>
                <Form.Control type={showNewPwd ? "text" : "password"} required minLength="6"
                  value={pwdData.newPassword}
                  onChange={(e) => setPwdData({...pwdData, newPassword: e.target.value})}
                />
                <Button variant="outline-secondary" onClick={() => setShowNewPwd(!showNewPwd)}>
                  <iconify-icon icon={showNewPwd ? "solar:eye-bold" : "solar:eye-closed-bold"}></iconify-icon>
                </Button>
              </InputGroup>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Confirmer le nouveau mot de passe</Form.Label>
              <InputGroup>
                <Form.Control type={showConfirmPwd ? "text" : "password"} required 
                  value={pwdData.confirmPassword}
                  onChange={(e) => setPwdData({...pwdData, confirmPassword: e.target.value})}
                />
                <Button variant="outline-secondary" onClick={() => setShowConfirmPwd(!showConfirmPwd)}>
                  <iconify-icon icon={showConfirmPwd ? "solar:eye-bold" : "solar:eye-closed-bold"}></iconify-icon>
                </Button>
              </InputGroup>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={handleLogout}>Se déconnecter</Button>
            <Button variant="primary" type="submit" disabled={pwdLoading}>
              {pwdLoading ? <Spinner size="sm" animation="border"/> : 'Changer le mot de passe'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </Router>
  );
}


export default App;