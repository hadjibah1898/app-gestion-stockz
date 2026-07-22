// src/components/Register.js
import React, { useState, useEffect, useCallback } from 'react';
import { Container, Row, Col, Form, Button, Alert, Spinner, ProgressBar, Badge, InputGroup } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import './Auth.css';

const Register = () => {
    const [formData, setFormData] = useState({
        nom: '',
        email: '',
        telephone: '',
        password: '',
        confirmPassword: '',
        accountType: null,
        entrepriseNom: '',
        registreCommerce: '',
        ville: '',
        nombreServeursEstime: '',
        deviseParDefaut: 'GNF'
    });

    const [step, setStep] = useState(1);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({});
    const [passwordStrength, setPasswordStrength] = useState({ score: 0, label: 'Vide', color: 'secondary', progress: 0 });
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const navigate = useNavigate();

    const checkPasswordStrength = useCallback((pass) => {
        if (!pass) {
            setPasswordStrength({ score: 0, label: 'Vide', color: 'secondary', progress: 0 });
            return;
        }
        let score = 0;
        if (pass.length >= 6) score++;
        if (pass.length >= 10) score++;
        if (/[A-Z]/.test(pass)) score++;
        if (/[0-9]/.test(pass)) score++;
        if (/[^A-Za-z0-9]/.test(pass)) score++;

        if (score <= 1) setPasswordStrength({ score, label: 'Très Faible ❌', color: 'danger', progress: 20 });
        else if (score === 2) setPasswordStrength({ score, label: 'Faible ⚠️', color: 'warning', progress: 40 });
        else if (score === 3) setPasswordStrength({ score, label: 'Moyen ⚖️', color: 'info', progress: 60 });
        else if (score === 4) setPasswordStrength({ score, label: 'Fort 💪', color: 'primary', progress: 85 });
        else setPasswordStrength({ score, label: 'Excellent 🔥', color: 'success', progress: 100 });
    }, []);

    useEffect(() => {
        checkPasswordStrength(formData.password);
    }, [formData.password, checkPasswordStrength]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const validateForm = () => {
        let errors = {};
        let isValid = true;

        if (!formData.accountType) { setError("Veuillez choisir un type de compte."); isValid = false; }
        if (!formData.nom.trim()) { errors.nom = "Le nom est requis."; isValid = false; }
        if (!formData.email.trim() || !/\S+@\S+\.\S+/.test(formData.email)) { errors.email = "Email invalide."; isValid = false; }
        if (!formData.telephone.trim()) { errors.telephone = "Téléphone requis."; isValid = false; }
        if (!formData.password || formData.password.length < 6) { errors.password = "Minimum 6 caractères."; isValid = false; }
        if (formData.password !== formData.confirmPassword) { errors.confirmPassword = "Mots de passe différents."; isValid = false; }
        if (!formData.entrepriseNom.trim()) { errors.entrepriseNom = "Nom d'établissement requis."; isValid = false; }
        if (!formData.ville.trim()) { errors.ville = "Ville requise."; isValid = false; }

        setFieldErrors(errors);
        return isValid;
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setError('');
        if (!validateForm()) return;

        setLoading(true);
        try {
            await authAPI.register(formData);
            navigate('/register/success', {
                state: {
                    accountType: formData.accountType,
                    entrepriseNom: formData.entrepriseNom,
                    nom: formData.nom
                }
            });
        } catch (err) {
            setError(err.response?.data?.message || "Erreur lors de l'inscription");
        } finally {
            setLoading(false);
        }
    };

    const selectAccountType = (type) => {
        setFormData({ ...formData, accountType: type });
    };

    return (
        <div className="auth-page odoo-theme">
            <Container fluid className="p-0">
                <Row className="g-0 vh-100">
                    {/* Panneau gauche : Gradient Odoo */}
                    <Col lg={5} className="d-none d-lg-flex odoo-gradient align-items-center justify-content-center text-white p-5 position-relative overflow-hidden">
                        <div className="z-1 position-relative" style={{ maxWidth: '450px' }}>
                            <div className="d-flex align-items-center mb-5">
                                <iconify-icon icon="solar:widget-5-bold-duotone" className="me-3" style={{ fontSize: '48px' }}></iconify-icon>
                                <h2 className="m-0 fw-bold">StockDash</h2>
                            </div>
                            <h1 className="display-5 fw-bold mb-4">Propulsez la gestion de votre établissement.</h1>
                            <p className="opacity-75">Suivez vos ventes et vos mouvements de stock en temps réel sur une plateforme unique.</p>
                        </div>
                    </Col>

                    {/* Panneau droit : Formulaire */}
                    <Col lg={7} className="d-flex align-items-center justify-content-center bg-white p-4 p-md-5 overflow-auto">
                        <div style={{ maxWidth: '550px', width: '100%' }}>
                            {step === 1 ? (
                                <div className="animate__animated animate__fadeIn">
                                    <h2 className="fw-bold mb-2 text-dark">Dites-nous qui vous êtes</h2>
                                    <p className="text-muted mb-5">Sélectionnez votre profil pour une configuration optimisée de vos outils.</p>

                                    <Form.Group className="mb-4">
                                        <Form.Label className="small fw-bold text-muted">Type de compte</Form.Label>
                                        <Form.Select
                                            name="accountType"
                                            value={formData.accountType || ''}
                                            onChange={(e) => selectAccountType(e.target.value)}
                                        >
                                            <option value="">Sélectionner votre profil...</option>
                                            <option value="Marchand">MARCHAND</option>
                                            <option value="Bar">Bar / Boite de Nuit</option>
                                        </Form.Select>
                                    </Form.Group>

                                    {formData.accountType && (
                                        <div className="mt-5 p-4 border rounded bg-light shadow-sm animate__animated animate__slideInUp">
                                            <div className="d-flex align-items-center mb-4">
                                                <div className="bg-primary-subtle p-2 rounded-circle me-3">
                                                    <iconify-icon icon="solar:globus-bold-duotone" className="text-primary fs-4"></iconify-icon>
                                                </div>
                                                <h6 className="fw-bold mb-0">{formData.accountType === 'Marchand' ? "Le cycle de gestion de votre entreprise :" : "Inclus dans votre version :"}</h6>
                                            </div>

                                            <Row className="g-4 mb-4">
                                                {formData.accountType === 'Marchand' ? (
                                                    <>
                                                        <Col md={6}>
                                                            <div className="d-flex flex-column gap-1">
                                                                <span className="fw-bold text-dark small"><iconify-icon icon="solar:user-rounded-bold" className="text-primary me-2"></iconify-icon> 1. Compte Administrateur</span>
                                                                <p className="text-muted x-small mb-0">Créez votre identité d'entreprise et gardez le contrôle total sur vos accès et vos gérants.</p>
                                                            </div>
                                                        </Col>
                                                        <Col md={6}>
                                                            <div className="d-flex flex-column gap-1">
                                                                <span className="fw-bold text-dark small"><iconify-icon icon="solar:home-2-bold" className="text-primary me-2"></iconify-icon> 2. Dépôt Principal (Centrale)</span>
                                                                <p className="text-muted x-small mb-0">Activez votre centre de stockage. Gérez vos entrées de marchandises en gros et vos fournisseurs.</p>
                                                            </div>
                                                        </Col>
                                                        <Col md={6}>
                                                            <div className="d-flex flex-column gap-1">
                                                                <span className="fw-bold text-dark small"><iconify-icon icon="solar:shop-2-bold" className="text-primary me-2"></iconify-icon> 3. Boutiques Secondaires</span>
                                                                <p className="text-muted x-small mb-0">Déployez votre réseau de vente. Alimentez vos points de vente par transferts de stock sécurisés.</p>
                                                            </div>
                                                        </Col>
                                                        <Col md={6}>
                                                            <div className="d-flex flex-column gap-1">
                                                                <span className="fw-bold text-dark small"><iconify-icon icon="solar:graph-up-bold" className="text-primary me-2"></iconify-icon> 4. Analyse & Pilotage</span>
                                                                <p className="text-muted x-small mb-0">Analysez vos performances consolidées, auditez vos flux et optimisez votre logistique globale.</p>
                                                            </div>
                                                        </Col>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Col sm={6}><div className="d-flex align-items-center small"><iconify-icon icon="solar:check-read-bold" className="text-success me-2"></iconify-icon> Interface POS tactile</div></Col>
                                                        <Col sm={6}><div className="d-flex align-items-center small"><iconify-icon icon="solar:check-read-bold" className="text-success me-2"></iconify-icon> Gestion des verres/doses</div></Col>
                                                        <Col sm={6}><div className="d-flex align-items-center small"><iconify-icon icon="solar:check-read-bold" className="text-success me-2"></iconify-icon> Clôtures de caisse aveugles</div></Col>
                                                        <Col sm={6}><div className="d-flex align-items-center small"><iconify-icon icon="solar:check-read-bold" className="text-success me-2"></iconify-icon> Suivi des pourboires équipe</div></Col>
                                                    </>
                                                )}
                                            </Row>

                                            <div className={`d-grid mt-2 ${formData.accountType === 'Bar' ? 'btn-bar-primary' : ''}`}>
                                                <Button variant="primary" className="fw-bold d-flex align-items-center justify-content-center" onClick={() => setStep(2)} disabled={!formData.accountType}>
                                                    Continuer vers le formulaire
                                                    <iconify-icon icon="solar:arrow-right-bold" className="ms-2"></iconify-icon>
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                    <div className="text-center mt-4">
                                        <small className="text-muted">Vous avez déjà un compte ? <a href="/login" className="text-primary fw-bold text-decoration-none">Connectez-vous</a></small>
                                    </div>
                                </div>
                            ) : (
                                <div className="animate__animated animate__fadeInRight">
                                    <Button variant="link" onClick={() => setStep(1)} className="p-0 mb-4 text-muted small text-decoration-none">
                                        <iconify-icon icon="solar:alt-arrow-left-linear" className="me-1 align-middle"></iconify-icon>
                                        Changer de profil
                                    </Button>
                                    <h3 className="fw-bold mb-4 text-dark">Finalisez votre inscription</h3>
                                    {error && <Alert variant="danger">{error}</Alert>}
                                    <Form onSubmit={handleRegister}>
                                        <div className="mb-4">
                                            <h6 className="text-primary text-uppercase small fw-bold mb-3 pb-1 border-bottom">Informations du Responsable</h6>
                                            <Row className="g-3">
                                                <Col md={6}>
                                                    <Form.Group className="mb-3">
                                                        <Form.Label className="small fw-bold text-muted">Nom du Responsable</Form.Label>
                                                        <Form.Control name="nom" value={formData.nom} onChange={handleChange} isInvalid={!!fieldErrors.nom} required />
                                                        <Form.Control.Feedback type="invalid">{fieldErrors.nom}</Form.Control.Feedback>
                                                    </Form.Group>
                                                </Col>
                                                <Col md={6}>
                                                    <Form.Group className="mb-3">
                                                        <Form.Label className="small fw-bold text-muted">Téléphone</Form.Label>
                                                        <Form.Control name="telephone" value={formData.telephone} onChange={handleChange} isInvalid={!!fieldErrors.telephone} required />
                                                        <Form.Control.Feedback type="invalid">{fieldErrors.telephone}</Form.Control.Feedback>
                                                    </Form.Group>
                                                </Col>
                                            </Row>
                                            <Form.Group className="mb-3">
                                                <Form.Label className="small fw-bold text-muted">Email</Form.Label>
                                                <Form.Control type="email" name="email" value={formData.email} onChange={handleChange} isInvalid={!!fieldErrors.email} required />
                                                <Form.Control.Feedback type="invalid">{fieldErrors.email}</Form.Control.Feedback>
                                            </Form.Group>
                                        </div>

                                        <div className="mb-4">
                                            <h6 className="text-primary text-uppercase small fw-bold mb-3 pb-1 border-bottom">Détails de l'Établissement</h6>
                                            <Form.Group className="mb-3">
                                                <Form.Label className="small fw-bold text-muted">Nom de l'Etablissement</Form.Label>
                                                <Form.Control name="entrepriseNom" value={formData.entrepriseNom} onChange={handleChange} isInvalid={!!fieldErrors.entrepriseNom} required />
                                                <Form.Control.Feedback type="invalid">{fieldErrors.entrepriseNom}</Form.Control.Feedback>
                                            </Form.Group>
                                            <Row className="g-3">
                                                <Col md={6}>
                                                    <Form.Group className="mb-3">
                                                        <Form.Label className="small fw-bold text-muted">Ville</Form.Label>
                                                        <Form.Control name="ville" value={formData.ville} onChange={handleChange} isInvalid={!!fieldErrors.ville} required />
                                                        <Form.Control.Feedback type="invalid">{fieldErrors.ville}</Form.Control.Feedback>
                                                    </Form.Group>
                                                </Col>
                                                <Col md={6}>
                                                    <Form.Group className="mb-3">
                                                        <Form.Label className="small fw-bold text-muted">RCCM (Optionnel)</Form.Label>
                                                        <Form.Control name="registreCommerce" value={formData.registreCommerce} onChange={handleChange} />
                                                    </Form.Group>
                                                </Col>
                                            </Row>
                                            {formData.accountType === 'Bar' && (
                                                <Row className="g-3 mt-1">
                                                    <Col md={6}>
                                                        <Form.Group className="mb-3">
                                                            <Form.Label className="small fw-bold text-muted">
                                                                <iconify-icon icon="solar:users-group-rounded-bold" className="me-1 align-middle"></iconify-icon>
                                                                Nombre de serveurs estimé
                                                            </Form.Label>
                                                            <Form.Control
                                                                type="number"
                                                                min="1"
                                                                max="50"
                                                                name="nombreServeursEstime"
                                                                value={formData.nombreServeursEstime}
                                                                onChange={handleChange}
                                                                placeholder="Ex: 5 serveurs"
                                                            />
                                                            <small className="text-muted">Nous préparerons des comptes serveurs pour votre établissement.</small>
                                                        </Form.Group>
                                                    </Col>
                                                </Row>
                                            )}
                                        </div>

                                        <div className="mb-4">
                                            <h6 className="text-primary text-uppercase small fw-bold mb-3 pb-1 border-bottom">Sécurité du compte</h6>
                                            <Form.Group className="mb-3">
                                                <Form.Label className="small fw-bold text-muted d-flex justify-content-between">
                                                    Mot de passe <Badge bg={passwordStrength.color}>{passwordStrength.label}</Badge>
                                                </Form.Label>
                                                <InputGroup>
                                                    <Form.Control type={showPassword ? "text" : "password"} name="password" value={formData.password} onChange={handleChange} isInvalid={!!fieldErrors.password} required />
                                                    <Button variant="outline-secondary" onClick={() => setShowPassword(!showPassword)}>
                                                        <iconify-icon icon={showPassword ? "solar:eye-broken" : "solar:eye-closed-broken"}></iconify-icon>
                                                    </Button>
                                                </InputGroup>
                                                <Form.Control.Feedback type="invalid" className={fieldErrors.password ? "d-block" : "d-none"}>{fieldErrors.password}</Form.Control.Feedback>
                                                <ProgressBar now={passwordStrength.progress} variant={passwordStrength.color} className="mt-2" style={{ height: '4px' }} />
                                            </Form.Group>
                                            <Form.Group className="mb-4">
                                                <Form.Label className="small fw-bold text-muted">Confirmer le mot de passe</Form.Label>
                                                <InputGroup>
                                                    <Form.Control type={showConfirmPassword ? "text" : "password"} name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} isInvalid={!!fieldErrors.confirmPassword} required />
                                                    <Button variant="outline-secondary" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                                                        <iconify-icon icon={showConfirmPassword ? "solar:eye-broken" : "solar:eye-closed-broken"}></iconify-icon>
                                                    </Button>
                                                </InputGroup>
                                                <Form.Control.Feedback type="invalid" className={fieldErrors.confirmPassword ? "d-block" : "d-none"}>{fieldErrors.confirmPassword}</Form.Control.Feedback>
                                            </Form.Group>
                                        </div>

                                        <Button variant="primary" type="submit" disabled={loading} className="w-100 fw-bold">
                                            {loading ? <Spinner size="sm" className="me-2" /> : null}
                                            S'inscrire
                                        </Button>
                                        <div className="text-center mt-3">
                                            <small className="text-muted">En créant un compte, vous acceptez nos conditions d'utilisation.</small>
                                        </div>
                                    </Form>
                                </div>
                            )}
                        </div>
                    </Col>
                </Row>
            </Container>
        </div>
    );
};

export default Register;