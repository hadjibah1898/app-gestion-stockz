// src/components/SuppliersView.js
// Composant de gestion des fournisseurs
// Permet de visualiser, créer, modifier et supprimer les fournisseurs
// Affiche les informations de contact et les articles fournis
// Contient les fonctionnalités de recherche et de filtres

import React, { useState, useEffect, useCallback } from 'react';
import { Button, Form, Modal, Alert, Spinner, Card, OverlayTrigger, Tooltip, Pagination } from 'react-bootstrap';
import { fournisseurAPI } from '../services/api';
import TableComponent from './common/Table';

const SuppliersView = () => {
  const [fournisseurs, setFournisseurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const itemsPerPage = 10;

  // États pour Création/Modif Fournisseur
  const [showModal, setShowModal] = useState(false);
  const [currentFournisseur, setCurrentFournisseur] = useState({ nom: '', telephone: '', email: '', produitsProposes: '' });
  const [editMode, setEditMode] = useState(false);

  // États pour la confirmation de suppression
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [supplierToDelete, setSupplierToDelete] = useState(null);

  const fetchFournisseurs = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        page: currentPage,
        limit: itemsPerPage,
        search: searchTerm,
      };
      const res = await fournisseurAPI.getAll(params);
      if (res.data.data) {
        setFournisseurs(res.data.data);
        setTotalPages(res.data.totalPages);
      } else {
        setFournisseurs(res.data);
        setTotalPages(1);
      }
    } catch (err) {
      setError("Erreur chargement fournisseurs");
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchTerm]);

  useEffect(() => {
    fetchFournisseurs();
  }, [fetchFournisseurs]);

  // --- Gestion Fournisseurs ---
  const handleShowModal = (fournisseur = null) => {
    if (fournisseur) {
      setCurrentFournisseur({ ...fournisseur, produitsProposes: fournisseur.produitsProposes.join(', ') });
      setEditMode(true);
    } else {
      setCurrentFournisseur({ nom: '', telephone: '', email: '', produitsProposes: '' });
      setEditMode(false);
    }
    setShowModal(true);
  };

  const handleSubmitFournisseur = async (e) => {
    e.preventDefault();
    try {
      // On retire le champ 'produitsProposes' avant l'envoi
      const { produitsProposes, ...payload } = currentFournisseur;
      
      if (editMode) {
        await fournisseurAPI.update(currentFournisseur._id, payload);
        setSuccessMessage("Fournisseur mis à jour");
      } else {
        await fournisseurAPI.create(payload);
        setSuccessMessage("Fournisseur créé");
      }
      setShowModal(false);
      fetchFournisseurs();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Erreur lors de l'enregistrement");
    }
  };

  const confirmDelete = (id) => {
    setSupplierToDelete(id);
    setShowDeleteModal(true);
  };

  const executeDelete = async () => {
    try {
      await fournisseurAPI.delete(supplierToDelete);
      setSuccessMessage("Fournisseur supprimé avec succès.");
      fetchFournisseurs();
    } catch (err) {
      setError(err.response?.data?.message || "Impossible de supprimer ce fournisseur. Il est peut-être lié à des mouvements de stock.");
    } finally {
      setShowDeleteModal(false);
      setSupplierToDelete(null);
      setTimeout(() => setSuccessMessage(''), 3000);
    }
  };

  // Le filtrage se fait maintenant côté serveur, on peut retirer le filtre côté client.
  const filteredFournisseurs = fournisseurs;

  // Éléments de pagination
  const paginationItems = [];
  if (totalPages > 1) {
    for (let number = 1; number <= totalPages; number++) {
        paginationItems.push(
            <Pagination.Item key={number} active={number === currentPage} onClick={() => setCurrentPage(number)}>
                {number}
            </Pagination.Item>
        );
    }
  }

  const columns = [
    { key: 'nom', label: 'Nom' },
    { key: 'telephone', label: 'Téléphone' },
    { key: 'email', label: 'Email' },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, fournisseur) => (
        <div className="d-flex gap-2">
          <OverlayTrigger overlay={<Tooltip>Modifier</Tooltip>}>
            <Button variant="link" className="text-primary p-0" onClick={() => handleShowModal(fournisseur)}>
              <iconify-icon icon="solar:pen-new-square-linear" style={{ fontSize: '20px' }}></iconify-icon>
            </Button>
          </OverlayTrigger>
          <OverlayTrigger overlay={<Tooltip>Supprimer</Tooltip>}>
            <Button variant="link" className="text-danger p-0" onClick={() => confirmDelete(fournisseur._id)}>
              <iconify-icon icon="solar:trash-bin-trash-linear" style={{ fontSize: '20px' }}></iconify-icon>
            </Button>
          </OverlayTrigger>
        </div>
      )
    }
  ];

  if (loading) return <Spinner animation="border" />;

  return (
    <div className="p-4">
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-2">
        <h3 className="fw-bold mb-0">Gestion des Fournisseurs</h3> 
        <Button variant="primary" onClick={() => handleShowModal()} className="rounded-pill px-4 shadow-sm">
          <iconify-icon icon="solar:add-circle-bold" className="me-2 align-middle"></iconify-icon>
          Ajouter un Fournisseur
        </Button>
      </div>

      {successMessage && <Alert variant="success">{successMessage}</Alert>}
      {error && <Alert variant="danger" onClose={() => setError('')} dismissible>{error}</Alert>}

      <div className="mb-4">
        <Form.Control
          type="text"
          placeholder="Rechercher un fournisseur par nom..."
          value={searchTerm}
          onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          style={{ maxWidth: '300px' }}
          className="shadow-sm"
        />
      </div>

      <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
        <Card.Body className="p-0">
          <TableComponent columns={columns} data={filteredFournisseurs} emptyMessage="Aucun fournisseur trouvé." />
        </Card.Body>
        {totalPages > 1 && (
            <Card.Footer className="d-flex justify-content-center border-0 pt-0">
                <Pagination>{paginationItems}</Pagination>
            </Card.Footer>
        )}
      </Card>

      {/* Modale Création/Edition */}
      <Modal show={showModal} onHide={() => setShowModal(false)}>
        <Modal.Header closeButton><Modal.Title>{editMode ? 'Modifier' : 'Nouveau'} Fournisseur</Modal.Title></Modal.Header>
        <Form onSubmit={handleSubmitFournisseur}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Nom</Form.Label>
              <Form.Control type="text" value={currentFournisseur.nom} onChange={e => setCurrentFournisseur({...currentFournisseur, nom: e.target.value})} required />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Téléphone</Form.Label>
              <Form.Control type="text" value={currentFournisseur.telephone} onChange={e => setCurrentFournisseur({...currentFournisseur, telephone: e.target.value})} required />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Email</Form.Label>
              <Form.Control type="email" value={currentFournisseur.email} onChange={e => setCurrentFournisseur({...currentFournisseur, email: e.target.value})} placeholder="exemple@email.com" />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Annuler</Button>
            <Button variant="primary" type="submit">Enregistrer</Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Modale de Confirmation de Suppression */}
      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="text-danger">⚠️ Suppression de Fournisseur</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="fw-bold">Êtes-vous sûr de vouloir supprimer ce fournisseur ?</p>
          <Alert variant="warning" className="mb-0 small">
            Cette action est irréversible.
          </Alert>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Annuler</Button>
          <Button variant="danger" onClick={executeDelete}>Supprimer définitivement</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default SuppliersView;