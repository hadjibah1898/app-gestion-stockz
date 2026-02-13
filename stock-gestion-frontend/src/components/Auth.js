// src/components/Auth.js
import React, { useState } from 'react';
import { Container, Row, Col, Card, Form, Button, Alert, Spinner, Modal } from 'react-bootstrap';
import { authAPI } from '../services/api';
import './Auth.css'; // Importation du nouveau CSS

const Auth = ({ onLogin }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // États pour le mot de passe oublié
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState({ type: '', text: '' });

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authAPI.login(formData.email, formData.password);
      const { token, role, nom, mustChangePassword } = response.data;
      onLogin(token, role, nom, mustChangePassword);
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotMessage({ type: '', text: '' });
    try {
        await authAPI.forgotPassword(forgotEmail);
        setForgotMessage({ type: 'success', text: 'Email envoyé avec succès ! Vérifiez votre boîte de réception.' });
        // Fermer la modale après 3 secondes
        setTimeout(() => {
            setShowForgotModal(false);
            setForgotEmail('');
            setForgotMessage({ type: '', text: '' });
        }, 3000);
    } catch (err) {
        setForgotMessage({ type: 'danger', text: err.response?.data?.message || "Erreur lors de la demande." });
    } finally {
        setForgotLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <Container>
        <Row className="justify-content-center align-items-center vh-100">
          <Col md={10} lg={8} xl={7}>
            <Card className="auth-card shadow-lg border-0 overflow-hidden">
              <Row className="g-0">
                <Col md={5} className="d-none d-md-flex auth-info-panel">
                  <div className="p-4 p-lg-5 text-white">
                    <div className="d-flex align-items-center mb-4">
                      <iconify-icon icon="solar:widget-5-bold-duotone" className="me-2" style={{ fontSize: '32px' }}></iconify-icon>
                      <h3 className="m-0 fw-bold">StockDash</h3>
                    </div>
                    <h4 className="fw-light mb-3">Gestion de stock simplifiée.</h4>
                    <p className="opacity-75 small">
                      Connectez-vous pour accéder à votre tableau de bord et gérer vos articles, ventes et performances en temps réel.
                    </p>
                  </div>
                </Col>
                <Col md={7}>
                  <Card.Body className="p-4 p-lg-5">
                    <div className="mb-4">
                      <h3 className="fw-bold text-primary">Connexion</h3>
                      <p className="text-muted">Accédez à votre espace de gestion.</p>
                    </div>

                    {error && <Alert variant="danger" className="mt-4">{error}</Alert>}
                    
                    <Form onSubmit={handleLogin} className="mt-4">
                      <Form.Group className="mb-3 input-group-icon">
                        <iconify-icon icon="solar:letter-linear" className="form-icon"></iconify-icon>
                        <Form.Control type="email" name="email" value={formData.email} onChange={handleChange} placeholder="Adresse e-mail" required />
                      </Form.Group>
                      <Form.Group className="mb-3 input-group-icon position-relative">
                        <iconify-icon icon="solar:lock-password-linear" className="form-icon"></iconify-icon>
                        <Form.Control 
                          type={showPassword ? "text" : "password"} 
                          name="password" 
                          value={formData.password} 
                          onChange={handleChange} 
                          placeholder="Mot de passe" 
                          required 
                          style={{ paddingRight: '2.5rem' }}
                        />
                        <span 
                          onClick={() => setShowPassword(!showPassword)}
                          style={{ position: 'absolute', right: '15px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: '#adb5bd', zIndex: 5, display: 'flex' }}
                          title={showPassword ? "Masquer" : "Afficher"}
                        >
                          <iconify-icon icon={showPassword ? "solar:eye-bold" : "solar:eye-closed-bold"} style={{ fontSize: '1.2rem' }}></iconify-icon>
                        </span>
                      </Form.Group>
                      
                      <div className="d-flex justify-content-between align-items-center mb-4">
                        <Form.Check type="checkbox" label="Se souvenir de moi" id="remember-me" className="small text-muted" />
                        <a 
                          href="#" 
                          className="small text-decoration-none text-primary fw-bold"
                          onClick={(e) => { e.preventDefault(); setShowForgotModal(true); }}
                        >
                          Mot de passe oublié ?
                        </a>
                      </div>

                      <div className="d-grid">
                        <Button variant="primary" type="submit" disabled={loading} className="py-2 fw-bold shadow-sm">
                          {loading ? <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" /> : 'Se connecter'}
                        </Button>
                      </div>
                    </Form>

                    <div className="text-center mt-4 pt-3 border-top">
                        <small className="text-muted">© {new Date().getFullYear()} StockDash. Tous droits réservés.</small>
                    </div>
                  </Card.Body>
                </Col>
              </Row>
            </Card>
          </Col>
        </Row>
      </Container>

      {/* Modale Mot de passe oublié */}
      <Modal show={showForgotModal} onHide={() => setShowForgotModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Réinitialisation du mot de passe</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleForgotSubmit}>
          <Modal.Body>
            <p className="text-muted small">Entrez votre adresse email. Nous vous enverrons un nouveau mot de passe temporaire.</p>
            {forgotMessage.text && <Alert variant={forgotMessage.type}>{forgotMessage.text}</Alert>}
            <Form.Group className="mb-3">
              <Form.Label>Adresse Email</Form.Label>
              <Form.Control 
                type="email" 
                required 
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="exemple@email.com"
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowForgotModal(false)}>Annuler</Button>
            <Button variant="primary" type="submit" disabled={forgotLoading}>
              {forgotLoading ? <Spinner size="sm" animation="border" /> : 'Envoyer'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
};

export default Auth;