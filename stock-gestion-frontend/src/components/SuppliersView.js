import React, { useState, useEffect } from 'react';
import { Button, Form, Modal, Alert, Spinner, Card, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { fournisseurAPI } from '../services/api';
import TableComponent from './common/Table';

const SuppliersView = () => {
  const [fournisseurs, setFournisseurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // États pour Création/Modif Fournisseur
  const [showModal, setShowModal] = useState(false);
  const [currentFournisseur, setCurrentFournisseur] = useState({ nom: '', telephone: '', email: '', produitsProposes: '' });
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    fetchFournisseurs();
  }, []);

  const fetchFournisseurs = async () => {
    try {
      setLoading(true);
      const res = await fournisseurAPI.getAll();
      setFournisseurs(res.data);
    } catch (err) {
      setError("Erreur chargement fournisseurs");
    } finally {
      setLoading(false);
    }
  };

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
      const payload = {
        ...currentFournisseur,
        produitsProposes: currentFournisseur.produitsProposes.split(',').map(p => p.trim()).filter(p => p)
      };

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
      setError("Erreur lors de l'enregistrement");
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Supprimer ce fournisseur ?")) {
      try {
        await fournisseurAPI.delete(id);
        fetchFournisseurs();
      } catch (err) {
        setError("Impossible de supprimer");
      }
    }
  };

  const filteredFournisseurs = fournisseurs.filter(f =>
    f.nom.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
            <Button variant="link" className="text-danger p-0" onClick={() => handleDelete(fournisseur._id)}>
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
      <div className="d-flex justify-content-between align-items-center mb-4">
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
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ maxWidth: '300px' }}
          className="shadow-sm"
        />
      </div>

      <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
        <Card.Body className="p-0">
          <TableComponent columns={columns} data={filteredFournisseurs} emptyMessage="Aucun fournisseur trouvé." />
        </Card.Body>
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
            <Form.Group className="mb-3">
              <Form.Label>Produits (séparés par des virgules)</Form.Label>
              <Form.Control as="textarea" rows={3} value={currentFournisseur.produitsProposes} onChange={e => setCurrentFournisseur({...currentFournisseur, produitsProposes: e.target.value})} placeholder="Ex: Riz, Sucre, Huile" />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Annuler</Button>
            <Button variant="primary" type="submit">Enregistrer</Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
};

export default SuppliersView;