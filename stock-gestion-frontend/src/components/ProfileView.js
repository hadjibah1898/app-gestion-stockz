// src/components/ProfileView.js
import React, { useState, useEffect } from 'react';
import { Card, Form, Button, Alert, Spinner, Row, Col, InputGroup, ProgressBar } from 'react-bootstrap';
import { authAPI } from '../services/api';

const ProfileView = () => {
    const [formData, setFormData] = useState({ nom: '', email: '' });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    // États pour le changement de mot de passe
    const [pwdData, setPwdData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
    const [pwdMessage, setPwdMessage] = useState({ type: '', text: '' });
    const [pwdLoading, setPwdLoading] = useState(false);
    const [showCurrentPwd, setShowCurrentPwd] = useState(false);
    const [showNewPwd, setShowNewPwd] = useState(false);
    const [showConfirmPwd, setShowConfirmPwd] = useState(false);
    const [strength, setStrength] = useState({ score: 0, label: '', color: '', progress: 0 });

    useEffect(() => {
        fetchUserData();
    }, []);

    const fetchUserData = async () => {
        try {
            const response = await authAPI.getCurrentUser();
            setFormData({ nom: response.data.nom, email: response.data.email });
        } catch (err) {
            setMessage({ type: 'danger', text: 'Erreur lors du chargement du profil.' });
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setMessage({ type: '', text: '' });
        try {
            const response = await authAPI.updateProfile(formData);
            setMessage({ type: 'success', text: 'Profil mis à jour avec succès.' });
            // Mise à jour du nom dans le localStorage pour l'affichage immédiat dans le header
            localStorage.setItem('userName', formData.nom);
            // Optionnel : forcer un rafraîchissement ou utiliser un contexte pour mettre à jour le Header
        } catch (err) {
            setMessage({ type: 'danger', text: err.response?.data?.message || 'Erreur lors de la mise à jour.' });
        } finally {
            setSaving(false);
        }
    };

    const checkPasswordStrength = (password) => {
        let score = 0;
        if (!password) {
            setStrength({ score: 0, label: '', color: '', progress: 0 });
            return;
        }

        if (password.length >= 8) score++;
        if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
        if (/[0-9]/.test(password)) score++;
        if (/[^A-Za-z0-9]/.test(password)) score++;

        let label = 'Faible';
        let color = 'danger';
        let progress = (score / 4) * 100;

        if (score >= 4) {
            label = 'Très fort';
            color = 'success';
        } else if (score === 3) {
            label = 'Fort';
            color = 'primary';
        } else if (score === 2) {
            label = 'Moyen';
            color = 'warning';
        }

        setStrength({ score, label, color, progress });
    };

    const handleNewPasswordChange = (e) => {
        const newPassword = e.target.value;
        setPwdData({...pwdData, newPassword});
        checkPasswordStrength(newPassword);
    };

    const handlePasswordChange = async (e) => {
        e.preventDefault();
        if (pwdData.newPassword !== pwdData.confirmPassword) {
            return setPwdMessage({ type: 'danger', text: "Les nouveaux mots de passe ne correspondent pas." });
        }
        if (strength.score < 2) { // On exige au moins une force "Moyenne"
            return setPwdMessage({ type: 'danger', text: "Le mot de passe est trop faible. Veuillez en choisir un plus sécurisé." });
        }
        setPwdLoading(true);
        setPwdMessage({ type: '', text: '' });
        try {
            await authAPI.changePassword({
                currentPassword: pwdData.currentPassword,
                newPassword: pwdData.newPassword
            });
            setPwdMessage({ type: 'success', text: "Mot de passe modifié avec succès." });
            setPwdData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        } catch (err) {
            setPwdMessage({ type: 'danger', text: err.response?.data?.message || "Erreur lors du changement de mot de passe." });
        } finally {
            setPwdLoading(false);
        }
    };

    if (loading) return <div className="text-center p-5"><Spinner animation="border" /></div>;

    return (
        <div className="p-4">
            <h3 className="fw-bold mb-4 text-body">Mon Profil</h3>
            <Row className="justify-content-center">
                <Col md={8} lg={6}>
                    <Card className="border-0 shadow-sm rounded-4 mb-4">
                        <Card.Body className="p-4">
                            <h5 className="fw-bold mb-3">Informations personnelles</h5>
                            {message.text && <Alert variant={message.type}>{message.text}</Alert>}
                            <Form onSubmit={handleSubmit}>
                                <Form.Group className="mb-3">
                                    <Form.Label>Nom complet</Form.Label>
                                    <Form.Control 
                                        type="text" 
                                        name="nom" 
                                        value={formData.nom} 
                                        onChange={handleChange} 
                                        required 
                                    />
                                </Form.Group>
                                <Form.Group className="mb-4">
                                    <Form.Label>Identifiant</Form.Label>
                                    <Form.Control 
                                        type="email" 
                                        name="email" 
                                        value={formData.email} 
                                        onChange={handleChange} 
                                        required 
                                    />
                                </Form.Group>
                                <div className="d-grid">
                                    <Button variant="primary" type="submit" disabled={saving}>
                                        {saving ? <Spinner size="sm" animation="border" /> : 'Enregistrer les modifications'}
                                    </Button>
                                </div>
                            </Form>
                        </Card.Body>
                    </Card>

                    <Card className="border-0 shadow-sm rounded-4">
                        <Card.Body className="p-4">
                            <h5 className="fw-bold mb-3">Sécurité</h5>
                            {pwdMessage.text && <Alert variant={pwdMessage.type}>{pwdMessage.text}</Alert>}
                            <Form onSubmit={handlePasswordChange}>
                                <Form.Group className="mb-3">
                                    <Form.Label>Mot de passe actuel</Form.Label>
                                    <InputGroup>
                                        <Form.Control 
                                            type={showCurrentPwd ? "text" : "password"} 
                                            required 
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
                                        <Form.Control 
                                            type={showNewPwd ? "text" : "password"} 
                                            required 
                                            minLength="6"
                                            value={pwdData.newPassword}
                                            onChange={handleNewPasswordChange}
                                        />
                                        <Button variant="outline-secondary" onClick={() => setShowNewPwd(!showNewPwd)}>
                                            <iconify-icon icon={showNewPwd ? "solar:eye-bold" : "solar:eye-closed-bold"}></iconify-icon>
                                        </Button>
                                    </InputGroup>
                                    {pwdData.newPassword && (
                                        <div className="mt-2">
                                            <ProgressBar 
                                                now={strength.progress} 
                                                variant={strength.color} 
                                                style={{ height: '6px' }} 
                                            />
                                            <small className={`text-${strength.color} fw-bold`}>{strength.label}</small>
                                        </div>
                                    )}
                                </Form.Group>
                                <Form.Group className="mb-4">
                                    <Form.Label>Confirmer le nouveau mot de passe</Form.Label>
                                    <InputGroup>
                                        <Form.Control 
                                            type={showConfirmPwd ? "text" : "password"} 
                                            required 
                                            value={pwdData.confirmPassword}
                                            onChange={(e) => setPwdData({...pwdData, confirmPassword: e.target.value})}
                                        />
                                        <Button variant="outline-secondary" onClick={() => setShowConfirmPwd(!showConfirmPwd)}>
                                            <iconify-icon icon={showConfirmPwd ? "solar:eye-bold" : "solar:eye-closed-bold"}></iconify-icon>
                                        </Button>
                                    </InputGroup>
                                </Form.Group>
                                <div className="d-grid">
                                    <Button variant="warning" type="submit" disabled={pwdLoading} className="text-white fw-bold">
                                        {pwdLoading ? <Spinner size="sm" animation="border" /> : 'Changer le mot de passe'}
                                    </Button>
                                </div>
                            </Form>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default ProfileView;


