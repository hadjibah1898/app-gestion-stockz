// src/components/ManagersView.js
import React, { useState, useEffect } from 'react';
import { Button, Form, Modal, Alert, Spinner, Badge, InputGroup, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { Card } from 'react-bootstrap'; // Import Card
import TableComponent from './common/Table';
import { authAPI, boutiqueAPI } from '../services/api';

const ManagersView = () => {
  const [managers, setManagers] = useState([]);
  const [boutiques, setBoutiques] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentManagerId, setCurrentManagerId] = useState(null);
  const [showTrash, setShowTrash] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    nom: '',
    email: '',
    password: '',
    boutique: ''
  });

  useEffect(() => {
    fetchData();
  }, [showTrash]);

  const fetchData = async () => {
    try {
      const [managersRes, boutiquesRes] = await Promise.all([
        showTrash ? authAPI.getDeletedUsers() : authAPI.getUsers(),
        boutiqueAPI.getAll()
      ]);
      // Filtrage côté client maintenu pour compatibilité, mais le backend envoie maintenant les objets boutique complets
      setManagers(managersRes.data.filter(u => u.role === 'Gérant'));
      setBoutiques(boutiquesRes.data);
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  const handleShowModal = (manager = null) => {
    if (manager) {
      setEditMode(true);
      setCurrentManagerId(manager._id);
      setFormData({
        nom: manager.nom,
        email: manager.email,
        password: '', // Ne pas pré-remplir le mot de passe
        boutique: manager.boutique?._id || ''
      });
    } else {
      setEditMode(false);
      setCurrentManagerId(null);
      setFormData({ nom: '', email: '', password: '', boutique: '' });
    }
    setShowModal(true);
  };
  const handleCloseModal = () => setShowModal(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editMode) {
        const updateData = { ...formData };
        // Ne pas envoyer le mot de passe s'il est vide pour ne pas l'écraser
        if (!updateData.password) {
          delete updateData.password;
        }
        await authAPI.updateManager(currentManagerId, updateData);
      } else {
        await authAPI.createManager(formData);
      }
      fetchData();
      handleCloseModal();
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || "Erreur d'enregistrement");
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer ce gérant ? Cette action est irréversible.')) {
      try {
        await authAPI.deleteManager(id);
        fetchData();
      } catch (err) {
        setError(err.response?.data?.message || err.response?.data?.error || 'Erreur de suppression');
      }
    }
  };

  const handleToggleActive = async (manager) => {
    try {
      await authAPI.updateManager(manager._id, { active: !manager.active });
      // Mettre à jour l'état local pour une réactivité immédiate
      setManagers(managers.map(m => m._id === manager._id ? { ...m, active: !m.active } : m));
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Erreur de mise à jour du statut');
    }
  };

  const handleRestore = async (id) => {
    try {
      await authAPI.restoreManager(id);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'Erreur de restauration');
    }
  };

  const handleForceDelete = async (id) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer DÉFINITIVEMENT ce gérant ? Cette action est irréversible.')) {
      try {
        await authAPI.forceDeleteManager(id);
        fetchData();
      } catch (err) {
        setError(err.response?.data?.message || err.response?.data?.error || 'Erreur de suppression définitive');
      }
    }
  };

  // Créer un Set des IDs de boutiques déjà assignées pour une recherche rapide
  const assignedBoutiqueIds = new Set(managers.map(m => m.boutique?._id).filter(Boolean));

  const columns = [
    { key: 'nom', label: 'Nom' },
    { key: 'email', label: 'Email' },
    { 
      key: 'boutique', 
      label: 'Boutique',
      render: (value) => value?.nom || 'Non affecté'
    },
    {
      key: 'active',
      label: 'Statut',
      render: (value) => <Badge bg={value ? 'success' : 'danger'}>{value ? 'Actif' : 'Inactif'}</Badge>
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, manager) => (
        <div className="d-flex gap-2">
          {!showTrash ? (
            <>
              <OverlayTrigger overlay={<Tooltip>Modifier</Tooltip>}>
                <Button variant="link" className="text-primary p-0" onClick={() => handleShowModal(manager)}>
                  <iconify-icon icon="solar:pen-new-square-linear" style={{ fontSize: '20px' }}></iconify-icon>
                </Button>
              </OverlayTrigger>

              <OverlayTrigger overlay={<Tooltip>{manager.active ? 'Désactiver' : 'Activer'}</Tooltip>}>
                <Button 
                  variant="link"
                  className={manager.active ? "text-warning p-0" : "text-success p-0"} 
                  onClick={() => handleToggleActive(manager)}
                >
                  <iconify-icon icon={manager.active ? "solar:user-block-rounded-linear" : "solar:user-check-rounded-linear"} style={{ fontSize: '20px' }}></iconify-icon>
                </Button>
              </OverlayTrigger>

              <OverlayTrigger overlay={<Tooltip>Supprimer</Tooltip>}>
                <Button variant="link" className="text-danger p-0" onClick={() => handleDelete(manager._id)}>
                  <iconify-icon icon="solar:trash-bin-trash-linear" style={{ fontSize: '20px' }}></iconify-icon>
                </Button>
              </OverlayTrigger>
            </>
          ) : (
            <>
              <Button variant="outline-success" size="sm" onClick={() => handleRestore(manager._id)}>Restaurer</Button>
              <Button variant="danger" size="sm" onClick={() => handleForceDelete(manager._id)}>Supprimer définitivement</Button>
            </>
          )}
        </div>
      )
    }
  ];

  if (loading) return <Spinner animation="border" />;

  return (
    <div className="p-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h3 className="fw-bold mb-0 text-body">Gestion des Gérants</h3>
        <div className="d-flex gap-2">
          <Button variant={showTrash ? "secondary" : "outline-secondary"} onClick={() => setShowTrash(!showTrash)} className="rounded-pill px-4 shadow-sm">
            <iconify-icon icon={showTrash ? "solar:users-group-rounded-bold" : "solar:trash-bin-trash-bold"} class="me-2 align-middle"></iconify-icon>
            {showTrash ? "Voir les actifs" : "Corbeille"}
          </Button>
          {!showTrash && (
            <Button variant="primary" onClick={() => handleShowModal(null)} className="rounded-pill px-4 shadow-sm">
              <iconify-icon icon="solar:add-circle-bold" class="me-2 align-middle"></iconify-icon>
              Ajouter un Gérant
            </Button>
          )}
        </div>
      </div>

      {error && <Alert variant="danger" onClose={() => setError('')} dismissible>
        {error}
      </Alert>}

      {/* Enveloppement du tableau dans une Card style "Soft UI" */}
      <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
        <Card.Body className="p-0">
          <TableComponent 
            columns={columns}
            data={managers}
            emptyMessage="Aucun gérant trouvé"
          />
        </Card.Body>
      </Card>

      <Modal show={showModal} onHide={handleCloseModal}>
        <Modal.Header closeButton>
          <Modal.Title>
            {editMode ? 'Modifier le Gérant' : 'Nouveau Gérant'}
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
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
            <Form.Group className="mb-3">
              <Form.Label>Email</Form.Label>
              <Form.Control
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Mot de passe</Form.Label>
              <InputGroup>
                <Form.Control
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder={editMode ? "Laisser vide pour ne pas changer" : ""}
                  required={!editMode} // Requis seulement en mode création
                />
                <Button variant="outline-secondary" onClick={() => setShowPassword(!showPassword)}>
                  <iconify-icon icon={showPassword ? "solar:eye-bold" : "solar:eye-closed-bold"}></iconify-icon>
                </Button>
              </InputGroup>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Boutique</Form.Label>
              <Form.Select
                name="boutique"
                value={formData.boutique}
                onChange={handleChange}
              >
                <option value="">Aucune boutique</option>
                {boutiques.map(boutique => {
                  const isAssigned = assignedBoutiqueIds.has(boutique._id);
                  const isAssignedToCurrentUser = editMode && formData.boutique === boutique._id;

                  // La boutique est désactivée si elle est assignée à quelqu'un d'autre
                  const isDisabled = isAssigned && !isAssignedToCurrentUser;

                  return (
                    <option key={boutique._id} value={boutique._id} disabled={isDisabled}>
                      {boutique.nom} {isDisabled ? '(déjà affectée)' : ''}
                    </option>
                  );
                })}
              </Form.Select>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={handleCloseModal}>
              Annuler
            </Button>
            <Button variant="primary" type="submit">
              {editMode ? 'Enregistrer les modifications' : 'Créer'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
};

export default ManagersView;