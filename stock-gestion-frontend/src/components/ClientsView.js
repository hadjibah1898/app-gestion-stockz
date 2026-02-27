// src/components/ClientsView.js
// Composant de gestion des clients
// Permet de visualiser, créer, modifier et supprimer les clients
// Affiche l'historique des achats et les remises accordées
// Contient les fonctionnalités de recherche et de filtres

import React, { useState, useEffect } from 'react';
import { Button, Form, Modal, Alert, Spinner, Badge, Card, Row, Col, Tab, Tabs, InputGroup } from 'react-bootstrap';
import TableComponent from './common/Table';
import { clientAPI } from '../services/api';

const ClientsView = () => {
  // Récupérer le rôle depuis le localStorage (ou autre méthode d'auth)
  const userRole = localStorage.getItem('userRole');
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // États pour Modale Création/Édition
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentClient, setCurrentClient] = useState({
    nom: '', email: '', telephone: '', type: 'Client', adresse: '', photo: '', dette: 0, commission: 0
  });

  // États pour Modale Paiement (Dette ou Commission)
  const [showPayModal, setShowPayModal] = useState(false);
  const [payType, setPayType] = useState('dette'); // 'dette' ou 'commission'
  const [paymentAmount, setPaymentAmount] = useState('');
  const [clientToPay, setClientToPay] = useState(null);

  useEffect(() => {
    fetchClients();
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

  // --- Gestion Création / Édition ---
  const handleShowModal = (client = null) => {
    if (client) {
      setCurrentClient(client);
      setEditMode(true);
    } else {
      setCurrentClient({ nom: '', email: '', telephone: '', type: 'Client', adresse: '', photo: '', dette: 0, commission: 0 });
      setEditMode(false);
    }
    setShowModal(true);
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) { // Limite 2Mo
        setError("L'image est trop volumineuse (max 2Mo)");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setCurrentClient({ ...currentClient, photo: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    // Vérification frontend : si dette > 0, échéance obligatoire
    if (parseFloat(currentClient.dette) > 0 && !currentClient.echeanceDette) {
      setError("L'échéance de la dette est obligatoire si une dette est saisie.");
      return;
    }
    try {
      if (editMode) {
        await clientAPI.update(currentClient._id, currentClient);
        setSuccessMessage('Client mis à jour avec succès !');
      } else {
        await clientAPI.create(currentClient);
        setSuccessMessage('Client créé avec succès !');
      }
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

    try {
      const amount = parseFloat(paymentAmount);
      const updatedClient = { ...clientToPay };

      if (payType === 'dette') {
        if (amount > updatedClient.dette) {
            setError("Le montant du remboursement ne peut pas dépasser la dette.");
            return;
        }
        updatedClient.dette -= amount;
      } else {
        if (amount > updatedClient.commission) {
            setError("Le montant versé ne peut pas dépasser la commission due.");
            return;
        }
        updatedClient.commission -= amount;
      }

      await clientAPI.update(clientToPay._id, updatedClient);
      setSuccessMessage(payType === 'dette' ? 'Dette remboursée !' : 'Commission versée !');
      fetchClients();
      setShowPayModal(false);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError("Erreur lors du paiement.");
    }
  };

  const handleDelete = async (id) => {
      if(window.confirm("Êtes-vous sûr de vouloir supprimer ce client ?")) {
          try {
              await clientAPI.delete(id);
              setSuccessMessage("Client supprimé.");
              fetchClients();
          } catch (err) {
              setError("Impossible de supprimer.");
          }
      }
  }

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
    { 
        key: 'photo', 
        label: 'Photo',
        render: (img, row) => img ? <img src={img} alt={row.nom} className="rounded-circle shadow-sm" style={{width: '40px', height: '40px', objectFit: 'cover'}} /> : <div className="bg-light rounded-circle d-flex align-items-center justify-content-center text-muted fw-bold shadow-sm" style={{width: '40px', height: '40px'}}>{row.nom.charAt(0).toUpperCase()}</div>
    },
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

  if (loading) return <Spinner animation="border" />;

  return (
    <div className="p-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h3 className="fw-bold mb-0">Gestion Clients & Ouvriers</h3>
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
            </Tabs>
        </Card.Body>
      </Card>

      {/* Modale Création / Édition */}
      <Modal show={showModal} onHide={() => setShowModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>{editMode ? 'Modifier Client' : 'Nouveau Client / Ouvrier'}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            <div className="d-flex justify-content-center mb-4">
                <div className="position-relative">
                    {currentClient.photo ? (
                        <img src={currentClient.photo} alt="Aperçu" className="rounded-circle shadow-sm object-fit-cover" style={{width: '100px', height: '100px'}} />
                    ) : (
                        <div className="bg-light rounded-circle d-flex align-items-center justify-content-center text-muted shadow-sm" style={{width: '100px', height: '100px'}}><iconify-icon icon="solar:camera-add-bold" style={{fontSize: '32px'}}></iconify-icon></div>
                    )}
                    <Form.Control type="file" accept="image/*" onChange={handleImageChange} className="position-absolute top-0 start-0 w-100 h-100 opacity-0" style={{cursor: 'pointer'}} />
                </div>
            </div>

            <Row>
                <Col md={6}>
                    <Form.Group className="mb-3">
                        <Form.Label>Nom complet</Form.Label>
                        <Form.Control type="text" value={currentClient.nom} onChange={e => setCurrentClient({...currentClient, nom: e.target.value})} required />
                    </Form.Group>
                </Col>
                <Col md={6}>
                    <Form.Group className="mb-3">
                        <Form.Label>Téléphone</Form.Label>
                        <Form.Control type="text" value={currentClient.telephone} onChange={e => setCurrentClient({...currentClient, telephone: e.target.value})} />
                    </Form.Group>
                </Col>
                <Col md={12}>
                    <Form.Group className="mb-3">
                        <Form.Label>Email</Form.Label>
                        <Form.Control type="email" value={currentClient.email} onChange={e => setCurrentClient({...currentClient, email: e.target.value})} placeholder="client@exemple.com" />
                    </Form.Group>
                </Col>
            </Row>
            <Form.Group className="mb-3">
                <Form.Label>Type</Form.Label>
                <Form.Select value={currentClient.type} onChange={e => setCurrentClient({...currentClient, type: e.target.value})}>
                    <option value="Client">Client Standard</option>
                    <option value="Ouvrier">Ouvrier / Apporteur d'affaires</option>
                </Form.Select>
                <Form.Text className="text-muted">
                    Les ouvriers peuvent accumuler des commissions sur les ventes qu'ils apportent.
                </Form.Text>
            </Form.Group>
            <Form.Group className="mb-3">
                <Form.Label>Adresse</Form.Label>
                <Form.Control type="text" value={currentClient.adresse} onChange={e => setCurrentClient({...currentClient, adresse: e.target.value})} />
            </Form.Group>
            
            {/* Champs Dettes et Commissions éditables manuellement si besoin */}
            <Row>
                <Col md={6}>
                    <Form.Group className="mb-3">
                        <Form.Label>Dette Initiale (GNF)</Form.Label>
                        <Form.Control type="number" value={currentClient.dette} onChange={e => setCurrentClient({...currentClient, dette: parseFloat(e.target.value) || 0})} />
                    </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Échéance de la dette</Form.Label>
                  <Form.Control type="date" value={currentClient.echeanceDette ? currentClient.echeanceDette.substring(0,10) : ''} onChange={e => setCurrentClient({...currentClient, echeanceDette: e.target.value})} required />
                  <Form.Text className="text-danger">Obligatoire si une dette est saisie</Form.Text>
                </Form.Group>
                </Col>
                {currentClient.type === 'Ouvrier' && (
                    <Col md={6}>
                        <Form.Group className="mb-3">
                            <Form.Label>Commission Due (GNF)</Form.Label>
                            <Form.Control type="number" value={currentClient.commission} onChange={e => setCurrentClient({...currentClient, commission: parseFloat(e.target.value) || 0})} />
                        </Form.Group>
                    </Col>
                )}
            </Row>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Annuler</Button>
            <Button variant="primary" type="submit">Enregistrer</Button>
          </Modal.Footer>
        </Form>
      </Modal>

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
    </div>
  );
};

export default ClientsView;