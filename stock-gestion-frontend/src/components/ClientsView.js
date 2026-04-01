// src/components/ClientsView.js
// Composant de gestion des clients
// Permet de visualiser, créer, modifier et supprimer les clients
// Affiche l'historique des achats et les remises accordées
// Contient les fonctionnalités de recherche et de filtres

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Form,  Alert, Spinner, Badge, Card, Tab, Tabs,  } from 'react-bootstrap';
import TableComponent from './common/Table';
import { clientAPI } from '../services/api';
import XLSX from 'xlsx-js-style';
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

  const fetchClients = useCallback(async () => {
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
  }, []);

  const fetchDebtHistory = useCallback(async () => {
    try {
        setHistoryLoading(true);
        const res = await clientAPI.getDebtHistory();
        setDebtHistory(res.data);
    } catch (err) {
        setError("Erreur lors du chargement de l'historique des dettes.");
    } finally {
        setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
    fetchDebtHistory();
  }, [fetchClients, fetchDebtHistory]);

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

  const handleExportExcel = () => {
    const dataToExport = filteredClients.map(c => ({
      'Nom': c.nom,
      'Email': c.email || '-',
      'Téléphone': c.telephone || '-',
      'Type': c.type,
      'Total Achats (GNF)': c.totalAchats || 0,
      'Dette Actuelle (GNF)': c.dette || 0,
      'Commission Due (Ouvriers)': c.commission || 0,
      'Date Création': new Date(c.createdAt).toLocaleDateString()
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Clients");
    XLSX.writeFile(workbook, `export_clients_${new Date().toISOString().split('T')[0]}.xlsx`);
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
        val > 0 ? <Badge bg="danger">{(val).toLocaleString()} GNF</Badge> : <span className="text-muted">-</span>
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
                val > 0 ? <Badge bg="primary">{(val).toLocaleString()} GNF</Badge> : <span className="text-muted">0 GNF</span>
            ) : <span className="text-muted small">N/A</span>
        )
    },
    {
        key: 'createur',
        label: 'Créé par',
        render: (user) => user?.nom || <span className="text-muted">N/A</span>
    },
    {
        key: 'createdAt',
        label: 'Date Création',
        render: (date) => date ? new Date(date).toLocaleDateString('fr-FR') : <span className="text-muted">-</span>
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
        <div className="d-flex gap-2">
          <Button variant="outline-success" onClick={handleExportExcel} className="rounded-pill px-4 shadow-sm">
            <iconify-icon icon="solar:file-spreadsheet-bold" className="me-2 align-middle"></iconify-icon>
            Exporter Excel
          </Button>
          {userRole === 'Gérant' && (
            <Button variant="primary" onClick={() => handleShowModal()} className="rounded-pill px-4 shadow-sm">
              <iconify-icon icon="solar:user-plus-bold" className="me-2 align-middle"></iconify-icon>
              Nouveau Client
            </Button>
          )}
        </div>
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
    </div>
  );
};

export default ClientsView;