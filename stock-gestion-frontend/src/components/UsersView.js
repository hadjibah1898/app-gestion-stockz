import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Badge, Modal, Form, Spinner, InputGroup, Row, Col, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { authAPI } from '../services/api';
import { toast } from 'react-toastify';

const UsersView = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    
    const [showModal, setShowModal] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [submitLoading, setSubmitLoading] = useState(false);
    
    const [formData, setFormData] = useState({
        _id: '',
        nom: '',
        email: '',
        password: '',
        role: 'Admin',
        active: true
    });

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const res = await authAPI.getUsers();
            // L'intercepteur déballe déjà .data.data
            setUsers(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error("Erreur chargement utilisateurs:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleShowModal = (user = null) => {
        if (user) {
            setFormData({
                _id: user._id,
                nom: user.nom,
                email: user.email,
                password: '',
                role: user.role,
                active: user.active
            });
            setEditMode(true);
        } else {
            setFormData({
                nom: '',
                email: '',
                password: '',
                role: 'Admin',
                active: true
            });
            setEditMode(false);
        }
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitLoading(true);
        try {
            if (editMode) {
                await authAPI.updateManager(formData._id, formData);
                toast.success("Utilisateur mis à jour avec succès");
            } else {
                await authAPI.register(formData);
                toast.success("Nouvel administrateur créé avec succès");
            }
            setShowModal(false);
            fetchUsers();
        } catch (err) {
            // Géré par l'intercepteur
        } finally {
            setSubmitLoading(false);
        }
    };

    const toggleUserStatus = async (user) => {
        const action = user.active ? 'désactiver' : 'réactiver';
        if (window.confirm(`Voulez-vous vraiment ${action} ce compte ?`)) {
            try {
                await authAPI.updateManager(user._id, { active: !user.active });
                toast.info(`Utilisateur ${user.active ? 'suspendu' : 'activé'}`);
                fetchUsers();
            } catch (err) { /* Géré par l'intercepteur */ }
        }
    };

    const filteredUsers = users.filter(u => 
        (u.nom?.toLowerCase().includes(searchTerm.toLowerCase()) || 
         u.email?.toLowerCase().includes(searchTerm.toLowerCase())) &&
        u.role !== 'SuperAdmin' // Protection visuelle du compte racine
    );

    return (
        <div className="p-4 animate__animated animate__fadeIn">
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
                <div>
                    <h3 className="fw-bold mb-0 text-primary">Gestion des Utilisateurs Globale</h3>
                    <p className="text-muted mb-0">Supervision des administrateurs et gérants du système</p>
                </div>
                <Button variant="primary" className="rounded-pill px-4 shadow-sm fw-bold" onClick={() => handleShowModal()}>
                    <iconify-icon icon="solar:user-plus-bold" className="me-2 align-middle"></iconify-icon>
                    Créer un Admin
                </Button>
            </div>

            <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
                <Card.Header className="bg-white py-3 border-0">
                    <InputGroup style={{ maxWidth: '400px' }} className="shadow-sm rounded-pill overflow-hidden">
                        <InputGroup.Text className="bg-light border-0">
                            <iconify-icon icon="solar:magnifer-linear"></iconify-icon>
                        </InputGroup.Text>
                        <Form.Control 
                            placeholder="Rechercher par nom ou email..." 
                            className="bg-light border-0"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </InputGroup>
                </Card.Header>
                <Card.Body className="p-0">
                    <Table responsive hover className="align-middle mb-0">
                        <thead className="bg-light small text-uppercase text-muted">
                            <tr>
                                <th className="ps-4 border-0">Utilisateur</th>
                                <th className="border-0">Rôle</th>
                                <th className="border-0">Accès Boutique</th>
                                <th className="border-0">Statut</th>
                                <th className="pe-4 border-0 text-end">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="5" className="text-center py-5"><Spinner animation="border" variant="primary" /></td></tr>
                            ) : filteredUsers.length > 0 ? filteredUsers.map(user => (
                                <tr key={user._id}>
                                    <td className="ps-4 py-3">
                                        <div className="d-flex align-items-center">
                                            <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user.nom)}&background=random&color=fff&rounded=true&size=40`} alt="" className="rounded-circle me-3" />
                                            <div>
                                                <div className="fw-bold text-dark">{user.nom}</div>
                                                <div className="text-muted small">{user.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <Badge bg={user.role === 'Admin' ? 'primary' : 'info'} pill className="px-3">
                                            {user.role}
                                        </Badge>
                                    </td>
                                    <td>
                                        {user.role === 'Admin' ? (
                                            <span className="text-muted italic small">Toutes (Admin)</span>
                                        ) : (
                                            <span className="fw-medium">{user.boutique?.nom || 'Non assigné'}</span>
                                        )}
                                    </td>
                                    <td>
                                        <Badge bg={user.active ? 'success-subtle' : 'danger-subtle'} text={user.active ? 'success' : 'danger'} pill className="fw-bold">
                                            {user.active ? 'ACTIF' : 'SUSPENDU'}
                                        </Badge>
                                    </td>
                                    <td className="pe-4 text-end">
                                        <div className="d-flex justify-content-end gap-2">
                                            <OverlayTrigger overlay={<Tooltip>Modifier</Tooltip>}>
                                                <Button variant="outline-primary" size="sm" className="rounded-circle p-2" onClick={() => handleShowModal(user)}>
                                                    <iconify-icon icon="solar:pen-new-square-bold" style={{fontSize: '18px'}}></iconify-icon>
                                                </Button>
                                            </OverlayTrigger>
                                            <OverlayTrigger overlay={<Tooltip>{user.active ? 'Suspendre' : 'Réactiver'}</Tooltip>}>
                                                <Button variant={user.active ? "outline-danger" : "outline-success"} size="sm" className="rounded-circle p-2" onClick={() => toggleUserStatus(user)}>
                                                    <iconify-icon icon={user.active ? "solar:user-block-bold" : "solar:user-check-bold"} style={{fontSize: '18px'}}></iconify-icon>
                                                </Button>
                                            </OverlayTrigger>
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr><td colSpan="5" className="text-center py-5 text-muted">Aucun utilisateur trouvé.</td></tr>
                            )}
                        </tbody>
                    </Table>
                </Card.Body>
            </Card>

            <Modal show={showModal} onHide={() => setShowModal(false)} centered>
                <Modal.Header closeButton>
                    <Modal.Title className="fw-bold">{editMode ? "Modifier le compte" : "Créer un Administrateur"}</Modal.Title>
                </Modal.Header>
                <Form onSubmit={handleSubmit}>
                    <Modal.Body className="py-4">
                        <Form.Group className="mb-3">
                            <Form.Label className="small fw-bold text-muted text-uppercase">Nom Complet</Form.Label>
                            <Form.Control type="text" value={formData.nom} onChange={(e) => setFormData({...formData, nom: e.target.value})} required />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label className="small fw-bold text-muted text-uppercase">Adresse Email</Form.Label>
                            <Form.Control type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} required />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label className="small fw-bold text-muted text-uppercase">{editMode ? "Nouveau mot de passe (optionnel)" : "Mot de passe temporaire"}</Form.Label>
                            <Form.Control type="password" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} required={!editMode} />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label className="small fw-bold text-muted text-uppercase">Rôle</Form.Label>
                            <Form.Select value={formData.role} onChange={(e) => setFormData({...formData, role: e.target.value})} disabled={editMode}>
                                <option value="Admin">Administrateur</option>
                                <option value="Gérant">Gérant</option>
                            </Form.Select>
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer className="border-0 pt-0">
                        <Button variant="light" className="rounded-pill px-4" onClick={() => setShowModal(false)}>Annuler</Button>
                        <Button variant="primary" type="submit" className="rounded-pill px-4 fw-bold shadow-sm" disabled={submitLoading}>
                            {submitLoading ? <Spinner size="sm" /> : (editMode ? "Enregistrer" : "Créer le compte")}
                        </Button>
                    </Modal.Footer>
                </Form>
            </Modal>
        </div>
    );
};

export default UsersView;