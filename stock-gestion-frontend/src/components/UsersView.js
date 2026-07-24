/**
 * @file UsersView.js
 * @description Vue de gestion des utilisateurs (SuperAdmin, Admin, AdminBar) : création, validation, suspension.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Badge, Modal, Form, Spinner, InputGroup, OverlayTrigger, Tooltip, Tabs, Tab } from 'react-bootstrap';
import { authAPI } from '../services/api';
import { toast } from 'react-toastify';
import { useSearchParams } from 'react-router-dom';

const UsersView = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'active'); // État pour contrôler l'onglet actif

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
    const [pendingUsers, setPendingUsers] = useState([]); // Nouvel état pour les utilisateurs en attente

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const res = await authAPI.getUsers();

            // Extraction ultra-robuste des données (gère la pagination et les différents formats d'API)
            let allUsers = [];
            if (Array.isArray(res.data)) allUsers = res.data;
            else if (res.data?.data && Array.isArray(res.data.data)) allUsers = res.data.data;
            else if (res.data?.users && Array.isArray(res.data.users)) allUsers = res.data.users;

            // On affiche tous les comptes créés (sauf SuperAdmin) pour permettre la gestion/réactivation
            setUsers(allUsers.filter(u => u.role?.toUpperCase() !== 'SUPERADMIN' && (u.active || u.role === 'Gérant' || u.role === 'Serveur')));
            // On isole les Admins inactifs (nouveaux inscrits) pour le flux de validation
            setPendingUsers(allUsers.filter(u => !u.active && ['Admin', 'AdminBar'].includes(u.role)));
        } catch (err) {
            console.error("Erreur chargement utilisateurs:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    // Synchroniser l'onglet actif avec les paramètres de l'URL pour gérer les liens directs (ex: notifications)
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab && (tab === 'active' || tab === 'pending') && tab !== activeTab) {
            setActiveTab(tab);
        }
    }, [searchParams, activeTab]);

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
            // Les Admins ne peuvent créer que des Gérants/Serveurs, pas des Admins
            const defaultRole = isSuperAdmin ? 'Admin' : 'Gérant';
            setFormData({
                nom: '',
                email: '',
                password: '',
                role: defaultRole,
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
                // Si c'est un SuperAdmin qui crée un Admin → utiliser register
                // Si c'est un Admin qui crée un Gérant/Serveur → utiliser createManager
                if (formData.role === 'Admin' || isSuperAdmin) {
                    await authAPI.register(formData);
                    toast.success("Nouvel administrateur créé avec succès");
                } else {
                    // Admin crée un Gérant/Serveur
                    await authAPI.createManager(formData);
                    toast.success(`Nouveau ${formData.role} créé avec succès`);
                }
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

    const handleValidateUser = async (userId) => {
        const cleanId = typeof userId === 'object' ? userId._id : userId;
        if (!cleanId) return toast.error("Identifiant utilisateur manquant.");

        if (window.confirm("Voulez-vous vraiment valider ce compte ? L'utilisateur pourra se connecter.")) {
            try {
                await authAPI.validateUser(cleanId);
                toast.success("Compte utilisateur validé avec succès !");
                setActiveTab('active'); // Basculer automatiquement vers l'onglet des comptes actifs
                setSearchParams({ tab: 'active' }); // Mettre à jour l'URL pour refléter le changement
                fetchUsers(); // Rafraîchir la liste
            } catch (err) {
                toast.error(err.response?.data?.message || "Erreur lors de la validation du compte.");
            }
        }
    };

    const handleRejectUser = async (userId) => {
        const cleanId = typeof userId === 'object' ? userId._id : userId;
        if (!cleanId) return toast.error("Identifiant utilisateur manquant.");

        if (window.confirm("Voulez-vous vraiment rejeter ce compte ? Il sera supprimé définitivement.")) {
            try {
                // Utiliser forceDeleteManager car c'est une suppression définitive
                await authAPI.forceDeleteManager(cleanId);
                toast.success("Compte utilisateur rejeté et supprimé.");
                fetchUsers(); // Rafraîchir la liste
            } catch (err) {
                toast.error(err.response?.data?.message || "Erreur lors du rejet du compte.");
            }
        }
    };

    // Filtrage des utilisateurs actifs pour le tableau principal
    const filteredUsers = users.filter(u =>
        (u.nom?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            u.email?.toLowerCase().includes(searchTerm.toLowerCase())) &&
        u.role !== 'SuperAdmin' // Protection visuelle du compte racine
    );

    // Récupération sécurisée du rôle actuel
    const currentUserRole = (localStorage.getItem('userRole') || '').trim().toUpperCase();
    const isSuperAdmin = currentUserRole === 'SUPERADMIN';

    return (
        <div className="p-4 animate__animated animate__fadeIn">
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
                <div>
                    <h3 className="fw-bold mb-0 text-primary">Gestion des Utilisateurs</h3>
                    <p className="text-muted mb-0">Supervision des administrateurs et gérants du système</p>
                </div>
                <div className="d-flex gap-2">
                    {/* Le bouton "Créer un Gérant" pour les Admins */}
                    {!isSuperAdmin && (
                        <Button variant="success" className="rounded-pill px-4 shadow-sm fw-bold" onClick={() => {
                            setFormData({
                                nom: '',
                                email: '',
                                password: '',
                                role: 'Gérant',
                                active: true
                            });
                            setEditMode(false);
                            setShowModal(true);
                        }}>
                            <iconify-icon icon="solar:user-plus-bold" className="me-2 align-middle"></iconify-icon>
                            Créer un Gérant
                        </Button>
                    )}
                    {/* Le bouton "Créer un Admin" est réservé au SuperAdmin uniquement */}
                    {isSuperAdmin && (
                        <Button variant="primary" className="rounded-pill px-4 shadow-sm fw-bold" onClick={() => handleShowModal()}>
                            <iconify-icon icon="solar:user-plus-bold" className="me-2 align-middle"></iconify-icon>
                            Créer un Admin
                        </Button>
                    )}
                </div>
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
                    <Tabs
                        activeKey={activeTab}
                        onSelect={(k) => {
                            setActiveTab(k);
                            setSearchParams({ tab: k });
                        }}
                        id="user-management-tabs"
                        className="mb-3 px-3 pt-3 border-bottom-0"
                    >
                        <Tab eventKey="active" title="Comptes Actifs">
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
                                                            <iconify-icon icon="solar:pen-new-square-bold" style={{ fontSize: '18px' }}></iconify-icon>
                                                        </Button>
                                                    </OverlayTrigger>
                                                    <OverlayTrigger overlay={<Tooltip>{user.active ? 'Suspendre' : 'Réactiver'}</Tooltip>}>
                                                        <Button variant={user.active ? "outline-danger" : "outline-success"} size="sm" className="rounded-circle p-2" onClick={() => toggleUserStatus(user)}>
                                                            <iconify-icon icon={user.active ? "solar:user-block-bold" : "solar:user-check-bold"} style={{ fontSize: '18px' }}></iconify-icon>
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
                        </Tab>

                        {/* Onglet pour les validations (Uniquement pour le SuperAdmin) */}
                        {isSuperAdmin && (
                            <Tab eventKey="pending" title={<span className="d-flex align-items-center">
                                <iconify-icon icon="solar:hourglass-bold" className="me-2"></iconify-icon>
                                Comptes en attente {pendingUsers.length > 0 && <Badge bg="warning" text="dark" pill className="ms-2">{pendingUsers.length}</Badge>}
                            </span>}>
                                <Table responsive hover className="align-middle mb-0">
                                    <thead className="bg-light small text-uppercase text-muted">
                                        <tr>
                                            <th className="ps-4 border-0">Utilisateur</th>
                                            <th className="border-0">Type d'Activité</th>
                                            <th className="border-0">Rôle</th>
                                            <th className="pe-4 border-0 text-end">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading ? (
                                            <tr><td colSpan="3" className="text-center py-5"><Spinner animation="border" variant="primary" /></td></tr>
                                        ) : pendingUsers.length > 0 ? pendingUsers.map(user => (
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
                                                    <Badge bg={user.businessType === 'Bar' ? 'bar-primary' : 'secondary'} pill className="px-3">
                                                        {user.businessType === 'Bar' ? '🍸 BAR / CLUB' : '📦 MARCHAND'}
                                                    </Badge>
                                                </td>
                                                <td><Badge bg="info" pill className="px-3">{user.role}</Badge></td>
                                                <td className="pe-4 text-end">
                                                    <div className="d-flex justify-content-end gap-2">
                                                        <Button variant="success" size="sm" className="rounded-pill px-3" onClick={() => handleValidateUser(user._id)}>
                                                            <iconify-icon icon="solar:check-circle-bold" className="me-1"></iconify-icon> Valider
                                                        </Button>
                                                        <Button variant="danger" size="sm" className="rounded-pill px-3" onClick={() => handleRejectUser(user._id)}>
                                                            <iconify-icon icon="solar:close-circle-bold" className="me-1"></iconify-icon> Rejeter
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr><td colSpan="3" className="text-center py-5 text-muted">Aucun compte en attente de validation.</td></tr>
                                        )}
                                    </tbody>
                                </Table>
                            </Tab>
                        )}
                    </Tabs>
                </Card.Body>
            </Card>

            <Modal show={showModal} onHide={() => setShowModal(false)} centered>
                <Modal.Header closeButton>
                    <Modal.Title className="fw-bold">{editMode ? "Modifier le compte" : `Créer un ${formData.role}`}</Modal.Title>
                </Modal.Header>
                <Form onSubmit={handleSubmit}>
                    <Modal.Body className="py-4">
                        <Form.Group className="mb-3">
                            <Form.Label className="small fw-bold text-muted text-uppercase">Nom Complet</Form.Label>
                            <Form.Control type="text" value={formData.nom} onChange={(e) => setFormData({ ...formData, nom: e.target.value })} required />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label className="small fw-bold text-muted text-uppercase">Adresse Email</Form.Label>
                            <Form.Control type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label className="small fw-bold text-muted text-uppercase">{editMode ? "Nouveau mot de passe (optionnel)" : "Mot de passe temporaire"}</Form.Label>
                            <Form.Control type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} required={!editMode} />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label className="small fw-bold text-muted text-uppercase">Rôle</Form.Label>
                            <Form.Select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })} disabled={editMode}>
                                {/* L'option Admin est réservée aux SuperAdmins */}
                                {isSuperAdmin && <option value="Admin">Administrateur</option>}
                                <option value="Gérant">Gérant</option>
                            </Form.Select>
                            {!isSuperAdmin && (
                                <Form.Text className="text-info small mt-1 d-block">
                                    <iconify-icon icon="solar:info-circle-bold" className="me-1"></iconify-icon>
                                    Seul un SuperAdmin peut créer des Administrateurs
                                </Form.Text>
                            )}
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer className="border-0 pt-0">
                        <Button variant="light" className="rounded-pill px-4" onClick={() => setShowModal(false)}>Annuler</Button>
                        <Button variant="primary" type="submit" className="rounded-pill px-4 fw-bold shadow-sm" disabled={submitLoading}>
                            {submitLoading ? <Spinner size="sm" /> : (editMode ? "Enregistrer" : `Créer le compte`)}
                        </Button>
                    </Modal.Footer>
                </Form>
            </Modal>
        </div>
    );
};

export default UsersView;