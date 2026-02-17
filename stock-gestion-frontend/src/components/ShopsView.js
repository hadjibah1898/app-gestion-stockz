// src/components/ShopsView.js
import React, { useState, useEffect } from 'react';
import { Button, Form, Modal, Alert, Spinner, Badge, Card, OverlayTrigger, Tooltip, Pagination } from 'react-bootstrap';
import TableComponent from './common/Table';
import { boutiqueAPI, articleAPI } from '../services/api';

const ShopsView = () => {
  const [boutiques, setBoutiques] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentBoutique, setCurrentBoutique] = useState({
    _id: '',
    nom: '',
    adresse: '',
    active: true
  });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5; // Nombre de boutiques par page
  const [searchTerm, setSearchTerm] = useState(''); // État pour la recherche

  // États pour le transfert de stock
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferData, setTransferData] = useState({ sourceId: '', targetId: '' });
  const [transferMessage, setTransferMessage] = useState({ type: '', text: '' });
  const [sourceArticles, setSourceArticles] = useState([]);
  const [selectedArticles, setSelectedArticles] = useState([]);
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [transferLoading, setTransferLoading] = useState(false);

  // États pour la confirmation de suppression (Modale moderne)
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [boutiqueToDelete, setBoutiqueToDelete] = useState(null);

  useEffect(() => {
    fetchBoutiques();
  }, []);

  const fetchBoutiques = async () => {
    try {
      const response = await boutiqueAPI.getAll();
      setBoutiques(response.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  // Charger les articles quand la boutique source change
  useEffect(() => {
    if (transferData.sourceId) {
        setLoadingArticles(true);
        articleAPI.getAll().then(res => {
            // Filtrer les articles de la boutique source
            const shopArticles = res.data.filter(a => (a.boutique?._id || a.boutique) === transferData.sourceId);
            setSourceArticles(shopArticles);
            setSelectedArticles([]); // Réinitialiser la sélection
        }).catch(err => console.error(err)).finally(() => setLoadingArticles(false));
    } else {
        setSourceArticles([]);
        setSelectedArticles([]);
    }
  }, [transferData.sourceId]);

  const handleShowModal = (boutique = null) => {
    if (boutique) {
      setCurrentBoutique(boutique);
      setEditMode(true);
    } else {
      setCurrentBoutique({ nom: '', adresse: '', active: true });
      setEditMode(false);
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setCurrentBoutique({
      ...currentBoutique,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    try {
      if (editMode) {
        await boutiqueAPI.update(currentBoutique._id, currentBoutique);
        setSuccessMessage('Boutique modifiée avec succès !');
      } else {
        await boutiqueAPI.create(currentBoutique);
        setSuccessMessage('Boutique créée avec succès !');
      }
      fetchBoutiques();
      handleCloseModal();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur d\'enregistrement');
    }
  };

  const handleTransfer = async (e) => {
    e.preventDefault();
    setTransferLoading(true);
    setTransferMessage({ type: '', text: '' });
    if (transferData.sourceId === transferData.targetId) {
        setTransferLoading(false);
        return setTransferMessage({ type: 'danger', text: "La boutique source et destination doivent être différentes." });
    }
    
    if (selectedArticles.length === 0) {
        setTransferLoading(false);
        return setTransferMessage({ type: 'warning', text: "Veuillez sélectionner au moins un article (ou tout sélectionner)." });
    }

    try {
        const res = await articleAPI.transferStock({ ...transferData, articleIds: selectedArticles });
        setShowTransferModal(false);
        setSuccessMessage(res.data.message);
        setTransferData({ sourceId: '', targetId: '' });
        setTransferMessage({ type: '', text: '' });
        setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
        setTransferMessage({ type: 'danger', text: err.response?.data?.message || "Erreur lors du transfert." });
    } finally {
        setTransferLoading(false);
    }
  };

  const confirmDelete = (id) => {
    setBoutiqueToDelete(id);
    setShowDeleteModal(true);
  };

  const executeDelete = async () => {
    setError('');
    setSuccessMessage('');
    try {
      await boutiqueAPI.delete(boutiqueToDelete);
      fetchBoutiques();
      setShowDeleteModal(false);
      setSuccessMessage('Boutique supprimée avec succès !');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur de suppression');
      setShowDeleteModal(false);
    }
  };

  const columns = [
    { key: 'nom', label: 'Nom' },
    { key: 'adresse', label: 'Adresse' },
    { 
      key: 'active', 
      label: 'Statut',
      render: (value) => (
        <Badge pill bg={value ? 'success' : 'danger'}>
          {value ? 'Active' : 'Inactive'}
        </Badge>
      )
    },
    { 
      key: 'actions',
      label: 'Actions',
      render: (_, boutique) => (
        <div className="d-flex gap-2">
          <OverlayTrigger overlay={<Tooltip id={`tooltip-edit-${boutique._id}`}>Modifier</Tooltip>}>
            <Button
              variant="link"
              className="text-primary p-0"
              onClick={() => handleShowModal(boutique)}
            >
              <iconify-icon icon="solar:pen-new-square-linear" style={{ fontSize: '20px' }}></iconify-icon>
            </Button>
          </OverlayTrigger>
          <OverlayTrigger overlay={<Tooltip id={`tooltip-delete-${boutique._id}`}>Supprimer</Tooltip>}>
            <Button
              variant="link"
              className="text-danger p-0"
              onClick={() => confirmDelete(boutique._id)}
            >
              <iconify-icon icon="solar:trash-bin-trash-linear" style={{ fontSize: '20px' }}></iconify-icon>
            </Button>
          </OverlayTrigger>
        </div>
      )
    }
  ];

  // Logique de filtrage et pagination
  const filteredBoutiques = boutiques.filter(boutique => 
    boutique.nom.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentBoutiques = filteredBoutiques.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredBoutiques.length / itemsPerPage);

  if (loading) return <Spinner animation="border" />;

  return (
    <div className="p-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h3 className="fw-bold mb-0 text-body">Gestion des Boutiques</h3>
        <div className="d-flex gap-2">
            <Button variant="outline-primary" onClick={() => setShowTransferModal(true)} className="rounded-pill px-4 shadow-sm">
                <iconify-icon icon="solar:box-minimalistic-bold" class="me-2 align-middle"></iconify-icon>
                Transférer Stock
            </Button>
            <Button variant="primary" onClick={() => handleShowModal()} className="rounded-pill px-4 shadow-sm">
                <iconify-icon icon="solar:add-circle-bold" class="me-2 align-middle"></iconify-icon>
                Ajouter une Boutique
            </Button>
        </div>
      </div>

      {/* Barre de recherche */}
      <div className="mb-4">
        <Form.Control
          type="text"
          placeholder="Rechercher une boutique par nom..."
          value={searchTerm}
          onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          style={{ maxWidth: '300px' }}
          className="shadow-sm"
        />
      </div>

      {successMessage && <Alert variant="success">{successMessage}</Alert>}
      {error && <Alert variant="danger" onClose={() => setError('')} dismissible>{error}</Alert>}

      <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
        <Card.Body className="p-0">
          <TableComponent 
            columns={columns}
            data={currentBoutiques}
            emptyMessage="Aucune boutique trouvée"
          />
          {totalPages > 1 && (
            <div className="d-flex justify-content-center p-3 border-top">
              <Pagination className="mb-0">
                <Pagination.Prev onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} />
                {[...Array(totalPages)].map((_, idx) => (
                  <Pagination.Item key={idx + 1} active={idx + 1 === currentPage} onClick={() => setCurrentPage(idx + 1)}>
                    {idx + 1}
                  </Pagination.Item>
                ))}
                <Pagination.Next onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} />
              </Pagination>
            </div>
          )}
        </Card.Body>
      </Card>

      <Modal show={showModal} onHide={handleCloseModal}>
        <Modal.Header closeButton>
          <Modal.Title>
            {editMode ? 'Modifier la Boutique' : 'Nouvelle Boutique'}
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Nom de la boutique</Form.Label>
              <Form.Control
                type="text"
                name="nom"
                value={currentBoutique.nom}
                onChange={handleChange}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Adresse</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                name="adresse"
                value={currentBoutique.adresse}
                onChange={handleChange}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Check
                type="checkbox"
                name="active"
                label="Boutique active"
                checked={currentBoutique.active}
                onChange={handleChange}
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={handleCloseModal}>
              Annuler
            </Button>
            <Button variant="primary" type="submit">
              {editMode ? 'Modifier' : 'Créer'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Modale de Transfert de Stock */}
      <Modal show={showTransferModal} onHide={() => setShowTransferModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Transférer le Stock</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleTransfer}>
          <Modal.Body>
            <Alert variant="info" className="small">
                Déplacez tous les articles d'une boutique à une autre. Utile avant de supprimer une boutique ou lors d'un changement de gérant.
            </Alert>
            {transferMessage.text && <Alert variant={transferMessage.type}>{transferMessage.text}</Alert>}
            
            <Form.Group className="mb-3">
              <Form.Label>Depuis la boutique (Source)</Form.Label>
              <Form.Select 
                value={transferData.sourceId}
                onChange={(e) => setTransferData({...transferData, sourceId: e.target.value})}
                required
              >
                <option value="">Sélectionner...</option>
                {boutiques.map(b => <option key={b._id} value={b._id}>{b.nom}</option>)}
              </Form.Select>
            </Form.Group>

            {/* Liste de sélection des articles */}
            {transferData.sourceId && (
                <Form.Group className="mb-3">
                    <Form.Label>Sélectionner les articles à transférer</Form.Label>
                    {loadingArticles ? <div className="text-center"><Spinner size="sm" /></div> : (
                        <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #dee2e6', padding: '10px', borderRadius: '4px' }}>
                            {sourceArticles.length > 0 ? (
                                <>
                                <Form.Check 
                                    type="checkbox"
                                    label="Tout sélectionner"
                                    checked={selectedArticles.length === sourceArticles.length && sourceArticles.length > 0}
                                    onChange={(e) => {
                                        if (e.target.checked) setSelectedArticles(sourceArticles.map(a => a._id));
                                        else setSelectedArticles([]);
                                    }}
                                    className="mb-2 fw-bold text-primary"
                                />
                                {sourceArticles.map(article => (
                                    <Form.Check 
                                        key={article._id}
                                        type="checkbox"
                                        label={`${article.nom} (Qté: ${article.quantite})`}
                                        checked={selectedArticles.includes(article._id)}
                                        onChange={(e) => {
                                            if (e.target.checked) setSelectedArticles([...selectedArticles, article._id]);
                                            else setSelectedArticles(selectedArticles.filter(id => id !== article._id));
                                        }}
                                    />
                                ))}
                                </>
                            ) : <p className="text-muted small mb-0">Aucun article dans cette boutique.</p>}
                        </div>
                    )}
                    <Form.Text className="text-muted">
                        {selectedArticles.length} article(s) sélectionné(s)
                    </Form.Text>
                </Form.Group>
            )}

            <Form.Group className="mb-3">
              <Form.Label>Vers la boutique (Destination)</Form.Label>
              <Form.Select 
                value={transferData.targetId}
                onChange={(e) => setTransferData({...transferData, targetId: e.target.value})}
                required
              >
                <option value="">Sélectionner...</option>
                {boutiques.map(b => <option key={b._id} value={b._id}>{b.nom}</option>)}
              </Form.Select>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowTransferModal(false)}>Fermer</Button>
            <Button variant="primary" type="submit" disabled={transferLoading}>
              {transferLoading ? <Spinner as="span" animation="border" size="sm" /> : 'Transférer'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Modale de Confirmation de Suppression (Moderne) */}
      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="text-danger">⚠️ Suppression de Boutique</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="fw-bold">Êtes-vous sûr de vouloir supprimer cette boutique ?</p>
          <Alert variant="warning" className="mb-0 small">
            <iconify-icon icon="solar:danger-triangle-bold" className="me-2 align-middle"></iconify-icon>
            Cette action est irréversible. Assurez-vous que la boutique est vide ou utilisez "Transférer Stock" au préalable.
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

export default ShopsView;