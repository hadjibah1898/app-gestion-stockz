// src/components/ClientsView.js
// Composant de gestion des clients
// Permet de visualiser, créer, modifier et supprimer les clients
// Affiche l'historique des achats et les remises accordées
// Contient les fonctionnalités de recherche et de filtres

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Form, Modal, Alert, Spinner, Badge, Card, Tab, Tabs, InputGroup } from 'react-bootstrap';
import TableComponent from './common/Table';
import { clientAPI } from '../services/api';
import ClientModal from './common/ClientModal'; // Importer le composant réutilisable

const ClientsView = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  // Récupérer le rôle depuis le localStorage (ou autre méthode d'auth)
  const userRole = localStorage.getItem('userRole');
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [debtHistory, setDebtHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  // États pour Modale Création/Édition
  const [showModal, setShowModal] = useState(false);
  const [currentClient, setCurrentClient] = useState(null);

  // États pour Modale Paiement (Dette ou Commission)
  const [showPayModal, setShowPayModal] = useState(false);
  const [payType, setPayType] = useState('dette'); // 'dette' ou 'commission'
  const [paymentAmount, setPaymentAmount] = useState('');
  const [clientToPay, setClientToPay] = useState(null);

  // États pour Modale Suppression
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [clientToDelete, setClientToDelete] = useState(null);

  useEffect(() => {
    fetchClients();
    fetchDebtHistory();
  }, []);

  const fetchClients = async () => {
    try {
      setLoading(true);
      // Simulation de données si l'API n'est pas encore prête côté backend
      try {
          const res = await clientAPI.getAll();
          setClients(res.data);
      } catch (e) {
          console.warn("API Clients non disponible, utilisation tableau vide");
          setClients([]);
      }
    } catch (err) {
      setError("Erreur lors du chargement des clients.");
    } finally {
      setLoading(false);
    }
  };

  const fetchDebtHistory = async () => {
    try {
        setHistoryLoading(true);
        const res = await clientAPI.getDebtHistory();
        setDebtHistory(res.data);
    } catch (err) {
        setError("Erreur lors du chargement de l'historique des dettes.");
    } finally {
        setHistoryLoading(false);
    }
  };

  // Effet pour gérer l'ouverture via notification
  useEffect(() => {
    if (!loading && clients.length > 0) {
        const openClientId = searchParams.get('openClient');
        if (openClientId) {
            const client = clients.find(c => c._id === openClientId);
            if (client) {
                handleShowModal(client);
                setSearchParams(params => {
                    params.delete('openClient');
                    return params;
                });
            }
        }
    }
  }, [loading, clients, searchParams, setSearchParams]);

  // --- Gestion Création / Édition ---
  const handleShowModal = (client = null) => {
    if (client) {
      setCurrentClient(client);
    } else {
      setCurrentClient(null);
    }
    setShowModal(true);
  };

  const handleSaveClientSuccess = (savedClient, isEdit) => {
    setSuccessMessage(isEdit ? 'Client mis à jour avec succès !' : 'Client créé avec succès !');
    try {
      fetchClients();
      setShowModal(false);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Erreur d'enregistrement");
    }
  };

  // --- Gestion Paiements (Dettes / Commissions) ---
  const handleShowPayModal = (client, type) => {
    setClientToPay(client);
    setPayType(type);
    setPaymentAmount('');
    setShowPayModal(true);
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    if (!paymentAmount || paymentAmount <= 0) return;

    // On ne gère que la dette ici pour l'instant
    if (payType !== 'dette') {
        setError("La fonctionnalité de paiement de commission sera implémentée séparément.");
        return;
    }

    try {
      await clientAPI.payDette(clientToPay._id, { montant: parseFloat(paymentAmount) });
      setSuccessMessage('Remboursement de la dette enregistré avec succès !');
      fetchClients();
      fetchDebtHistory(); // Rafraîchir l'historique
      setShowPayModal(false);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Erreur lors du paiement.");
    }
  };

  const handleDelete = (id) => {
      setClientToDelete(id);
      setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
      try {
          await clientAPI.delete(clientToDelete);
          setSuccessMessage("Client supprimé.");
          fetchClients();
      } catch (err) {
          setError(err.response?.data?.message || "Impossible de supprimer.");
      } finally {
          setShowDeleteModal(false);
          setClientToDelete(null);
      }
  };

  // --- Filtrage et Tri ---
  const filteredClients = clients.filter(c => 
    c.nom.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (c.telephone && c.telephone.includes(searchTerm))
  );

  // Meilleurs clients (Triés par Total Achats décroissant)
  const bestClients = [...filteredClients].sort((a, b) => (b.totalAchats || 0) - (a.totalAchats || 0));

  // Clients avec Dettes
  const debtClients = filteredClients.filter(c => c.dette > 0);

  // Ouvriers / Apporteurs d'affaires
  const workers = filteredClients.filter(c => c.type === 'Ouvrier');

    const columns = [
    { key: 'nom', label: 'Nom' },
    { key: 'email', label: 'Email' },
    { key: 'telephone', label: 'Téléphone' },
    { 
      key: 'type', 
      label: 'Type',
      render: (type) => <Badge bg={type === 'Ouvrier' ? 'warning' : 'info'}>{type}</Badge>
    },
    { 
      key: 'totalAchats', 
      label: 'Total Achats',
      render: (val) => <span className="fw-bold text-success">{(val || 0).toLocaleString()} GNF</span>
    },
    {
      key: 'montantPaye',
      label: 'Montant Payé',
      render: (_, row) => {
          const paye = (row.totalAchats || 0) - (row.dette || 0);
          return <span className="fw-bold text-primary">{paye.toLocaleString()} GNF</span>;
      }
    },
    { 
      key: 'dette', 
      label: 'Dette',
      render: (val, row) => (
        val > 0 ? (
          <div className="d-flex align-items-center gap-2">
            <Badge bg="danger">{(val).toLocaleString()} GNF</Badge>
            <Button variant="outline-success" size="sm" className="py-0 px-1" onClick={() => handleShowPayModal(row, 'dette')} title="Rembourser">
              <iconify-icon icon="solar:hand-money-linear"></iconify-icon>
            </Button>
          </div>
        ) : <span className="text-muted">-</span>
      )
    },
    {
      key: 'echeanceDette',
      label: "Échéance Dette",
      render: (val, row) => row.dette > 0 && val ? new Date(val).toLocaleDateString() : <span className="text-muted">-</span>
    },
    { 
        key: 'commission', 
        label: 'Commission Due',
        render: (val, row) => (
            row.type === 'Ouvrier' ? (
                val > 0 ? (
                    <div className="d-flex align-items-center gap-2">
                        <Badge bg="primary">{(val).toLocaleString()} GNF</Badge>
                        <Button variant="outline-primary" size="sm" className="py-0 px-1" onClick={() => handleShowPayModal(row, 'commission')} title="Payer Commission">
                            <iconify-icon icon="solar:wallet-money-linear"></iconify-icon>
                        </Button>
                    </div>
                ) : <span className="text-muted">0 GNF</span>
            ) : <span className="text-muted small">N/A</span>
        )
    },
    {
        key: 'actions',
        label: 'Actions',
        render: (_, client) => (
            <div className="d-flex gap-2">
                <Button variant="link" className="text-primary p-0" onClick={() => handleShowModal(client)}>
                    <iconify-icon icon="solar:pen-new-square-linear" style={{ fontSize: '20px' }}></iconify-icon>
                </Button>
                <Button variant="link" className="text-danger p-0" onClick={() => handleDelete(client._id)}>
                    <iconify-icon icon="solar:trash-bin-trash-linear" style={{ fontSize: '20px' }}></iconify-icon>
                </Button>
            </div>
        )
    }
  ];

  const debtHistoryColumns = [
    { 
        key: 'createdAt', 
        label: 'Date',
        render: (date) => new Date(date).toLocaleString('fr-FR')
    },
    { 
        key: 'client', 
        label: 'Client',
        render: (client) => client?.nom || 'N/A'
    },
    { 
        key: 'type', 
        label: 'Type',
        render: (type) => <Badge bg={type === 'CREATION' ? 'danger' : 'success'}>{type}</Badge>
    },
    { 
        key: 'montant', 
        label: 'Montant',
        render: (val) => <span className="fw-bold">{(val || 0).toLocaleString()} GNF</span>
    },
    { 
        key: 'soldeAnterieur', 
        label: 'Solde Précédent',
        render: (val) => <span className="text-muted">{(val || 0).toLocaleString()} GNF</span>
    },
    { 
        key: 'nouveauSolde', 
        label: 'Nouveau Solde',
        render: (val) => <span className="fw-bold text-primary">{(val || 0).toLocaleString()} GNF</span>
    },
    { key: 'operateur', label: 'Opérateur', render: (op) => op?.nom || 'N/A' },
  ];

  if (loading) return <Spinner animation="border" />;

  return (
    <div className="p-4">
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-2">
        <h3 className="fw-bold mb-0">Gestion des Clients & Ouvriers</h3>
        {userRole === 'Gérant' && (
          <Button variant="primary" onClick={() => handleShowModal()} className="rounded-pill px-4 shadow-sm">
            <iconify-icon icon="solar:user-plus-bold" className="me-2 align-middle"></iconify-icon>
            Nouveau Client
          </Button>
        )}
      </div>

      {successMessage && <Alert variant="success">{successMessage}</Alert>}
      {error && <Alert variant="danger" onClose={() => setError('')} dismissible>{error}</Alert>}

      <div className="mb-4">
        <Form.Control
          type="text"
          placeholder="Rechercher par nom ou téléphone..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ maxWidth: '300px' }}
          className="shadow-sm"
        />
      </div>

      <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
        <Card.Body className="p-0">
            <Tabs defaultActiveKey="all" id="client-tabs" className="mb-3 px-3 pt-3 border-bottom-0">
                <Tab eventKey="all" title="Tous les Clients">
                    <TableComponent columns={columns} data={filteredClients} emptyMessage="Aucun client trouvé." />
                </Tab>
                <Tab eventKey="best" title={<span className="text-success"><iconify-icon icon="solar:cup-star-bold" className="me-1"></iconify-icon>Meilleurs Clients</span>}>
                    <Alert variant="success" className="m-3">
                        <iconify-icon icon="solar:info-circle-bold" className="me-2"></iconify-icon>
                        Liste triée par chiffre d'affaires. Idéal pour identifier les clients à récompenser.
                    </Alert>
                    <TableComponent columns={columns} data={bestClients} emptyMessage="Aucune donnée." />
                </Tab>
                <Tab eventKey="debts" title={<span className="text-danger"><iconify-icon icon="solar:danger-circle-bold" className="me-1"></iconify-icon>Dettes ({debtClients.length})</span>}>
                    <TableComponent columns={columns} data={debtClients} emptyMessage="Aucune dette en cours. Bravo !" />
                </Tab>
                <Tab eventKey="workers" title={<span className="text-warning"><iconify-icon icon="solar:users-group-two-rounded-bold" className="me-1"></iconify-icon>Ouvriers / Apporteurs</span>}>
                    <TableComponent columns={columns} data={workers} emptyMessage="Aucun ouvrier enregistré." />
                </Tab>
                <Tab eventKey="debt-history" title={<span className="text-info"><iconify-icon icon="solar:history-bold" className="me-1"></iconify-icon>Historique Dettes</span>}>
                    <TableComponent columns={debtHistoryColumns} data={debtHistory} loading={historyLoading} emptyMessage="Aucun mouvement de dette enregistré." />
                </Tab>
            </Tabs>
        </Card.Body>
      </Card>

      {/* Modale Création / Édition */}
      <ClientModal
        show={showModal}
        onHide={() => setShowModal(false)}
        clientToEdit={currentClient}
        onSuccess={handleSaveClientSuccess}
      />

      {/* Modale Paiement */}
      <Modal show={showPayModal} onHide={() => setShowPayModal(false)} size="sm" centered>
        <Modal.Header closeButton>
            <Modal.Title>{payType === 'dette' ? 'Rembourser Dette' : 'Payer Commission'}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handlePaymentSubmit}>
            <Modal.Body>
                <p>Client: <strong>{clientToPay?.nom}</strong></p>
                <p className="mb-2">
                    Montant dû: <Badge bg={payType === 'dette' ? 'danger' : 'primary'}>
                        {payType === 'dette' ? clientToPay?.dette?.toLocaleString() : clientToPay?.commission?.toLocaleString()} GNF
                    </Badge>
                </p>
                <Form.Group>
                    <Form.Label>Montant versé</Form.Label>
                    <InputGroup>
                        <Form.Control 
                            type="number" 
                            required 
                            min="1"
                            max={payType === 'dette' ? clientToPay?.dette : clientToPay?.commission}
                            value={paymentAmount} 
                            onChange={e => setPaymentAmount(e.target.value)} 
                            autoFocus
                        />
                        <InputGroup.Text>GNF</InputGroup.Text>
                    </InputGroup>
                </Form.Group>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={() => setShowPayModal(false)}>Annuler</Button>
                <Button variant="success" type="submit">Valider</Button>
            </Modal.Footer>
        </Form>
      </Modal>

      {/* Modale Suppression */}
      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)} centered>
        <Modal.Header closeButton>
            <Modal.Title className="text-danger">⚠️ Suppression Client</Modal.Title>
        </Modal.Header>
        <Modal.Body>
            <p className="fw-bold">Êtes-vous sûr de vouloir supprimer ce client ?</p>
            <p className="text-muted small">Cette action est irréversible.</p>
        </Modal.Body>
        <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Annuler</Button>
            <Button variant="danger" onClick={confirmDelete}>Supprimer</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default ClientsView;