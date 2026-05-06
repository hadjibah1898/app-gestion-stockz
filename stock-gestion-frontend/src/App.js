// src/App.js
// Application principale de gestion de stock
// Cette page sert de point d'entrée et de routeur pour toute l'application
// Contient la structure de navigation et la gestion de l'authentification

import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { Modal, Form, Button, Alert, Spinner, InputGroup, Toast, ToastContainer } from 'react-bootstrap';
import { NotificationProvider, useNotifications } from './NotificationContext';
import Sidebar from './components/common/Sidebar';
import Header from './components/common/Header'; // Importer le Header
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import { authAPI } from './services/api';
import GerantDashboard from './components/GerantDashboard';
import ServersView from './components/ServersView';
import ManagersView from './components/ManagersView';
import ShopsView from './components/ShopsView';
import ArticlesView from './components/ArticlesView';
import VentesView from './components/VentesView';
import SuppliersView from './components/SuppliersView';
import StockMovementsView from './components/StockMovementsView';
import ProfileView from './components/ProfileView';
import CentraleStockView from './components/CentraleStockView';
import StockStatusView from './components/StockStatusView';
import ClientsView from './components/ClientsView';
import NotificationsHistoryView from './components/NotificationsHistoryView';
import ProtectedRoute from './components/common/ProtectedRoute';
import AuditLogView from './components/AuditLogView'; // Importer le nouveau composant
import CaisseView from './components/CaisseView';
import AdminCaisseView from './components/AdminCaisseView';
import DebtManagementView from './components/DebtManagementView';
import './App.css';
import setupAxiosInterceptors from './utils/axiosConfig';
import ServeurDashboard from './components/ServeurDashboard';


// Le Layout principal qui inclut la Sidebar et la zone de contenu
const MainLayout = ({ userName, userRole, handleLogout, theme, toggleTheme, isSidebarOpen, toggleSidebar }) => (
  <>
    <Sidebar userRole={userRole} isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar} userName={userName} handleLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} /> {/* Sidebar receives toggleSidebar and other header props */}
    <div className="page-wrapper"> {/* page-wrapper needs to be aware of sidebar state for margin-left on large screens */}
      <Header userName={userName} userRole={userRole} onLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} toggleSidebar={toggleSidebar} /> {/* Header receives toggleSidebar */}
      <Outlet context={{ theme }} /> {/* Les composants de route enfants s'afficheront ici */}
    </div>
  </>
);

// Composant pour gérer l'affichage des Toasts de notification
const NotificationToasts = () => {
  const { toastQueue, removeToast, markAsRead } = useNotifications();
  const navigate = useNavigate();

  const handleToastClick = (notification) => {
    if (!notification.read) {
      markAsRead(notification._id);
    }
    if (notification.link) {
      navigate(notification.link);
    }
    removeToast(notification._id);
  };

  return (
    <ToastContainer position="bottom-end" className="p-3" style={{ zIndex: 9999 }}>
      {toastQueue.map(toast => (
        <Toast key={toast._id} onClose={() => removeToast(toast._id)} onClick={() => handleToastClick(toast)} bg="dark" autohide delay={8000} className="text-white" style={{ cursor: 'pointer' }}>
          <Toast.Header closeButton><strong className="me-auto">Nouvelle Notification</strong></Toast.Header>
          <Toast.Body>{toast.message}</Toast.Body>
        </Toast>
      ))}
    </ToastContainer>
  );
};

function App() {
  // On récupère les infos utilisateur depuis le localStorage pour la persistance
  const [userRole, setUserRole] = useState(localStorage.getItem('userRole'));
  const [userName, setUserName] = useState(localStorage.getItem('userName'));
  const [mustChangePassword, setMustChangePassword] = useState(localStorage.getItem('mustChangePassword') === 'true');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // New state for sidebar
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  
  // États pour la modale de changement de mot de passe
  const [pwdData, setPwdData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [isApiLoading, setIsApiLoading] = useState(false); // Nouvel état pour le chargement API

  useEffect(() => {
    // Configure l'intercepteur Axios pour gérer les erreurs 401 (redirection auto) et le spinner de chargement
    setupAxiosInterceptors(setIsApiLoading);
  }, []); // Exécuter une seule fois au montage


  useEffect(() => {
    // Apply sidebar-open class to body for mobile overlay
    document.body.classList.toggle('sidebar-open', isSidebarOpen);
  }, [isSidebarOpen]);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  const handleLogin = (newToken, id, role, name, boutique, mustChange) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('userRole', role);
    localStorage.setItem('userId', id); // Sauvegarder l'ID de l'utilisateur
    localStorage.setItem('userName', name);
    if (boutique) {
      localStorage.setItem('boutiqueId', typeof boutique === 'object' ? boutique._id : boutique);
    }
    if (mustChange) localStorage.setItem('mustChangePassword', 'true');
    
    setUserRole(role);
    setUserName(name);
    setMustChangePassword(mustChange);
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userName');
    localStorage.removeItem('boutiqueId');
    localStorage.removeItem('mustChangePassword');
    // Redirection forcée pour garantir un état propre et la redirection vers la page de connexion.
    window.location.href = '/login';
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
      localStorage.removeItem('mustChangePassword');
      setPwdSuccess("Mot de passe changé avec succès ! Vous pouvez maintenant utiliser l'application.");
      
      // Fermer la modale et réinitialiser l'état après un court délai
      setTimeout(() => {
        setMustChangePassword(false);
        setPwdSuccess('');
        setPwdData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      }, 2500);
    } catch (err) {
      setPwdError(err.response?.data?.message || "Erreur lors du changement de mot de passe.");
    } finally {
      setPwdLoading(false);
    }
  };

  return (
    <NotificationProvider>
      {isApiLoading && <div className="top-loading-bar"></div>}
      <div id="main-wrapper" data-bs-theme={theme}>
        <Routes>
          <Route path="/login" element={!userRole ? <Auth onLogin={handleLogin} /> : <Navigate to={userRole === 'Admin' ? "/admin" : (userRole === 'Serveur' ? "/serveur" : "/gerant")} />} />

          {/* Routes Protégées pour l'Admin */}
          <Route path="/admin" element={
            <ProtectedRoute userRole={userRole} requiredRole="Admin">
              <MainLayout userName={userName} userRole={userRole} handleLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />
            </ProtectedRoute>
          }>
            <Route index element={<Dashboard />} />
            <Route path="managers" element={<ManagersView />} />
            <Route path="shops" element={<ShopsView />} />
            <Route path="articles" element={<ArticlesView userRole="Admin" />} />
            <Route path="etat-stock" element={<StockStatusView />} />
            <Route path="centrale" element={<CentraleStockView />} />
            <Route path="ventes" element={<VentesView userRole="Admin" />} />
            <Route path="fournisseurs" element={<SuppliersView />} />
            <Route path="mouvements" element={<StockMovementsView />} />
            <Route path="clients" element={<ClientsView />} />
            <Route path="notifications" element={<NotificationsHistoryView />} />
            <Route path="caisse" element={<AdminCaisseView />} />
            <Route path="creances" element={<DebtManagementView />} />
            <Route path="audit" element={<AuditLogView />} /> {/* Ajouter la nouvelle route */}
          </Route>
          

          {/* Routes Protégées pour le Gérant */}
          <Route path="/gerant" element={
            <ProtectedRoute userRole={userRole} requiredRole="Gérant">
              <MainLayout userName={userName} userRole={userRole} handleLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />
            </ProtectedRoute>
          }>
            <Route index element={<GerantDashboard />} />
            <Route path="articles" element={<ArticlesView userRole="Gérant" />} />
            <Route path="ventes" element={<VentesView userRole="Gérant" initialTab="sale" key="sale" />} />
            <Route path="equipe" element={<ServersView />} />
            <Route path="historique" element={<VentesView userRole="Gérant" initialTab="history" key="history" />} />
            <Route path="clients" element={<ClientsView userRole="Gérant" />} />
            <Route path="notifications" element={<NotificationsHistoryView />} />
            <Route path="creances" element={<DebtManagementView />} />
            <Route path="caisse" element={<CaisseView />} />
          </Route>

          {/* Routes Protégées pour le Serveur */}
          <Route path="/serveur" element={
            <ProtectedRoute userRole={userRole} requiredRole="Serveur">
              <MainLayout userName={userName} userRole={userRole} handleLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="dashboard" />} />
            <Route path="dashboard" element={<ServeurDashboard />} />
            <Route path="ventes" element={<VentesView userRole="Serveur" initialTab="sale" key="sale" />} />
          </Route>

          {/* Routes Partagées (Profil) */}
          <Route path="/profile" element={
            <ProtectedRoute userRole={userRole} requiredRole={['Admin', 'Gérant', 'Serveur']}>
              <MainLayout userName={userName} userRole={userRole} handleLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />
            </ProtectedRoute>
          }>
            <Route index element={<ProfileView />} />
          </Route>

          <Route path="/" element={<Navigate to={!userRole ? "/login" : (userRole === 'Admin' ? "/admin" : (userRole === 'Serveur' ? "/serveur" : "/gerant"))} />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
        {userRole && <NotificationToasts />}
      
      </div>

      {/* Modale de changement de mot de passe obligatoire */}
      <Modal show={!!userRole && mustChangePassword} backdrop="static" keyboard={false} centered>
        <Modal.Header>
          <Modal.Title className="text-danger">🔒 Changement de mot de passe requis</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handlePasswordChange}>
          <Modal.Body>
            {pwdSuccess ? (
              <Alert variant="success" className="text-center">
                <iconify-icon icon="solar:check-circle-bold" style={{fontSize: '48px'}} className="mb-2"></iconify-icon>
                <h5 className="fw-bold">Succès !</h5>
                <p>{pwdSuccess}</p>
              </Alert>
            ) : (
              <>
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
              </>
            )}
          </Modal.Body>
          {!pwdSuccess && (
            <Modal.Footer>
              <Button variant="secondary" onClick={handleLogout}>Se déconnecter</Button>
              <Button variant="primary" type="submit" disabled={pwdLoading}>
                {pwdLoading ? <Spinner size="sm" animation="border"/> : 'Changer le mot de passe'}
              </Button>
            </Modal.Footer>
          )}
        </Form>
      </Modal>
    </NotificationProvider>
  );
}


const AppWrapper = () => (
  <Router>
    <App />
  </Router>
);

export default AppWrapper;
