// src/components/ManagersView.js
import React, { useState, useEffect, useCallback } from 'react';
import { Button, Form, Modal, Alert, Spinner, Badge, OverlayTrigger, Tooltip, Card, Pagination } from 'react-bootstrap';
import TableComponent from './common/Table';
import { authAPI, boutiqueAPI, venteAPI } from '../services/api';

const ManagersView = () => {
  // --- États Principaux ---
  const [managers, setManagers] = useState([]);
  const [boutiques, setBoutiques] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // --- Pagination Gérants ---
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const itemsPerPage = 10;

  // --- États Modale Formulaire ---
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentManagerId, setCurrentManagerId] = useState(null);
  const [formData, setFormData] = useState({ nom: '', email: '', password: '', boutique: '' });

  // --- États Historique ---
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [managerHistory, setManagerHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedManager, setSelectedManager] = useState(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);

  // --- Chargement des données ---
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = { page: currentPage, limit: itemsPerPage, search: searchTerm, role: 'Gérant' };
      const [managersRes, boutiquesRes] = await Promise.all([
        authAPI.getUsers(params),
        boutiqueAPI.getAll()
      ]);

      if (managersRes.data.data) {
        setManagers(managersRes.data.data);
        setTotalPages(managersRes.data.totalPages || 1);
      } else {
        setManagers(managersRes.data || []);
        setTotalPages(1);
      }
      setBoutiques(boutiquesRes.data || []);
    } catch (err) {
      setError('Erreur lors du chargement des données.');
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchTerm]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- Actions ---
  const handleOpenModal = (manager = null) => {
    if (manager) {
      setEditMode(true);
      setCurrentManagerId(manager._id);
      setFormData({ nom: manager.nom, email: manager.email, password: '', boutique: manager.boutique?._id || '' });
    } else {
      setEditMode(false);
      setFormData({ nom: '', email: '', password: '', boutique: '' });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      // Préparation des données propres
      const payload = { ...formData };
      
      // En mode édition, on n'envoie pas le mot de passe s'il est vide
      if (editMode && !payload.password) {
        delete payload.password;
      }

      if (editMode) {
        await authAPI.updateManager(currentManagerId, payload);
        setSuccessMessage('Le profil du gérant a été mis à jour avec succès !');
      } else {
        await authAPI.createManager(payload);
        setSuccessMessage('Nouveau gérant créé avec succès !');
      }
      setShowModal(false);
      fetchData();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Une erreur est survenue lors de l'enregistrement.");
    }
  };

  const loadHistory = async (manager, page = 1) => {
    setHistoryLoading(true);
    setHistoryPage(page);
    if (manager) setSelectedManager(manager);
    const mId = manager ? manager._id : selectedManager?._id;

    try {
      const res = await venteAPI.getHistorique({ gerantId: mId, page, limit: 10 });
      setManagerHistory(res.data.ventes || []);
      setHistoryTotalPages(res.data.totalPages || 1);
      setShowHistoryModal(true);
    } catch (err) {
      setError("Impossible de charger l'historique.");
    } finally {
      setHistoryLoading(false);
    }
  };

  // --- Configuration Tableau ---
  const columns = [
    { key: 'nom', label: 'Nom' },
    { key: 'boutique', label: 'Boutique', render: (b) => b?.nom || 'N/A' },
    { key: 'active', label: 'Statut', render: (a) => <Badge bg={a ? 'success' : 'danger'}>{a ? 'Actif' : 'Inactif'}</Badge> },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, manager) => (
        <div className="d-flex gap-2">
          <OverlayTrigger overlay={<Tooltip>Ventes</Tooltip>}>
            <Button variant="link" className="text-info p-0" onClick={() => loadHistory(manager, 1)}>
              <iconify-icon icon="solar:bill-list-bold" style={{ fontSize: '20px' }}></iconify-icon>
            </Button>
          </OverlayTrigger>
          <OverlayTrigger overlay={<Tooltip>Modifier</Tooltip>}>
            <Button variant="link" className="text-primary p-0" onClick={() => handleOpenModal(manager)}>
              <iconify-icon icon="solar:pen-new-square-linear" style={{ fontSize: '20px' }}></iconify-icon>
            </Button>
          </OverlayTrigger>
        </div>
      )
    }
  ];

  if (loading) return <div className="text-center p-5"><Spinner animation="border" variant="primary" /></div>;

  return (
    <div className="p-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h3 className="fw-bold">Gestion des Gérants</h3>
        <Button variant="primary" onClick={() => handleOpenModal()} className="rounded-pill px-4">
          Ajouter un Gérant
        </Button>
      </div>

      <Form.Control 
        className="mb-4 w-25 shadow-sm" 
        placeholder="Rechercher..." 
        value={searchTerm}
        onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} 
      />

      {successMessage && <Alert variant="success" dismissible onClose={() => setSuccessMessage('')}>{successMessage}</Alert>}
      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

      <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
        <TableComponent columns={columns} data={managers} emptyMessage="Aucun gérant." />
        
        {/* PAGINATION PRINCIPALE */}
        {totalPages > 1 && (
          <div className="d-flex justify-content-center p-3 border-top">
            <Pagination className="mb-0">
              <Pagination.Prev disabled={currentPage === 1} onClick={() => setCurrentPage(currentPage - 1)} />
              {[...Array(totalPages)].map((_, i) => (
                <Pagination.Item key={i+1} active={i+1 === currentPage} onClick={() => setCurrentPage(i+1)}>
                  {i+1}
                </Pagination.Item>
              ))}
              <Pagination.Next disabled={currentPage === totalPages} onClick={() => setCurrentPage(currentPage + 1)} />
            </Pagination>
          </div>
        )}
      </Card>

      {/* MODALE FORMULAIRE */}
      <Modal show={showModal} onHide={() => setShowModal(false)}>
        <Modal.Header closeButton><Modal.Title>{editMode ? 'Modifier' : 'Ajouter'} un gérant</Modal.Title></Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Nom</Form.Label>
              <Form.Control value={formData.nom} onChange={e => setFormData({...formData, nom: e.target.value})} required />
            </Form.Group>
            <Form.Group className="mb-3"><Form.Label>Email</Form.Label>
              <Form.Control type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} required />
            </Form.Group>
            {!editMode && (
              <Form.Group className="mb-3"><Form.Label>Mot de passe</Form.Label>
                <Form.Control type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} required />
              </Form.Group>
            )}
            <Form.Group><Form.Label>Boutique</Form.Label>
              <Form.Select value={formData.boutique} onChange={e => setFormData({...formData, boutique: e.target.value})}>
                <option value="">Sélectionner une boutique</option>
                {boutiques.map(b => <option key={b._id} value={b._id}>{b.nom}</option>)}
              </Form.Select>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Annuler</Button>
            <Button variant="primary" type="submit">Enregistrer</Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* MODALE HISTORIQUE */}
      <Modal show={showHistoryModal} onHide={() => setShowHistoryModal(false)} size="lg">
        <Modal.Header closeButton><Modal.Title>Historique de {selectedManager?.nom}</Modal.Title></Modal.Header>
        <Modal.Body>
          {historyLoading ? <div className="text-center p-4"><Spinner animation="border" /></div> : (
            <>
              <TableComponent 
                columns={[
                  { key: 'createdAt', label: 'Date', render: d => new Date(d).toLocaleDateString() },
                  { key: 'article', label: 'Article', render: a => a?.nom || 'N/A' },
                  { key: 'prixTotal', label: 'Total', render: p => p.toLocaleString() + ' GNF' }
                ]} 
                data={managerHistory} 
              />
              {historyTotalPages > 1 && (
                <Pagination className="justify-content-center mt-3">
                  {[...Array(historyTotalPages)].map((_, i) => (
                    <Pagination.Item key={i+1} active={i+1 === historyPage} onClick={() => loadHistory(null, i+1)}>
                      {i+1}
                    </Pagination.Item>
                  ))}
                </Pagination>
              )}
            </>
          )}
        </Modal.Body>
      </Modal>
    </div>
  );
};

export default ManagersView;