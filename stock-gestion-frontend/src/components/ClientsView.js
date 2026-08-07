// src/components/ClientsView.js
// Composant de gestion des clients
// Permet de visualiser, créer, modifier et supprimer les clients
// Affiche l'historique des achats et les remises accordées
// Contient les fonctionnalités de recherche et de filtres

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Form, Alert, Spinner, Badge, Card, Tab, Tabs, Modal } from 'react-bootstrap';
import TableComponent from './common/Table';
import { clientAPI } from '../services/api';
import XLSX from 'xlsx-js-style';
import ClientModal from './common/ClientModal'; // Importer le composant réutilisable
import CrmDashboard from './CrmDashboard'; // Tableau de bord CRM moderne

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
  const [crmData, setCrmData] = useState([]);
  const [crmLoading, setCrmLoading] = useState(false);
  const [crmQuartiers, setCrmQuartiers] = useState([]);
// États pour Modale Création/Édition
  const [showModal, setShowModal] = useState(false);
  const [currentClient, setCurrentClient] = useState(null);
  // États pour Modale de Relance (personnalisation du message)
  const [showRelanceModal, setShowRelanceModal] = useState(false);
  const [relanceClientId, setRelanceClientId] = useState(null);
  const [relanceClientNom, setRelanceClientNom] = useState('');
  const [relanceMessage, setRelanceMessage] = useState('');
  const [relanceSending, setRelanceSending] = useState(false);

  const fetchClients = useCallback(async () => {
    try {
      setLoading(true);
      // Simulation de données si l'API n'est pas encore prête côté backend
      try {
          const res = await clientAPI.getAll();
          // L'intercepteur Axios unwrappe déjà : res est le tableau directement
          setClients(Array.isArray(res) ? res : (res.data || []));
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
        // L'intercepteur Axios unwrappe déjà : res est le tableau directement
        setDebtHistory(Array.isArray(res) ? res : (res.data || []));
    } catch (err) {
        setError("Erreur lors du chargement de l'historique des dettes.");
    } finally {
        setHistoryLoading(false);
    }
  }, []);

  const fetchCrmAnalytics = useCallback(async () => {
    try {
        setCrmLoading(true);
        const [analyticsRes, quartiersRes] = await Promise.all([
            clientAPI.getCrmAnalytics(),
            clientAPI.getCrmQuartiers()
        ]);
        setCrmData(Array.isArray(analyticsRes) ? analyticsRes : (analyticsRes.data || []));
        setCrmQuartiers(Array.isArray(quartiersRes) ? quartiersRes : (quartiersRes.data || []));
    } catch (err) {
        console.error("Erreur CRM:", err);
    } finally {
        setCrmLoading(false);
    }
  }, []);

// Ouvre la modale de relance pour personnaliser le message avant envoi
  const handleRelancerClient = (clientId, clientNom) => {
    setRelanceClientId(clientId);
    setRelanceClientNom(clientNom);
    setRelanceMessage('');
    setShowRelanceModal(true);
  };

  // Envoie effectivement l'email de relance avec le message personnalisé (ou le message par défaut)
  const confirmRelance = async () => {
    setRelanceSending(true);
    try {
        await clientAPI.relancerClient(relanceClientId, { message: relanceMessage });
        setSuccessMessage(`Relance envoyée à ${relanceClientNom} par email.`);
        setShowRelanceModal(false);
        setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
        setError(err.response?.data?.message || "Erreur lors de l'envoi de la relance.");
    } finally {
        setRelanceSending(false);
    }
  };

  useEffect(() => {
    fetchClients();
    fetchDebtHistory();
    fetchCrmAnalytics();
  }, [fetchClients, fetchDebtHistory, fetchCrmAnalytics]);

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
        key: 'createdAt',
        label: 'Date Création',
        render: (date) => date ? new Date(date).toLocaleDateString('fr-FR') : <span className="text-muted">-</span>
    }
  ];

  // Regrouper les mouvements de dette par client pour un affichage cumulé
  const groupedDebtHistory = useMemo(() => {
    const map = {};
    (debtHistory || []).forEach(mvt => {
      const clientId = mvt.client?._id || mvt.client;
      const clientNom = mvt.client?.nom || 'Client inconnu';
      if (!map[clientId]) {
        map[clientId] = {
          client: mvt.client,
          clientNom,
          totalDettes: 0,
          totalRemboursements: 0,
          soldeActuel: 0,
          dernierMouvement: mvt.createdAt,
          nbMouvements: 0
        };
      }
      if (mvt.type === 'CREATION') {
        map[clientId].totalDettes += (mvt.montant || 0);
        map[clientId].soldeActuel += (mvt.montant || 0);
      } else if (mvt.type === 'REMBOURSEMENT') {
        map[clientId].totalRemboursements += (mvt.montant || 0);
        map[clientId].soldeActuel -= (mvt.montant || 0);
      }
      map[clientId].nbMouvements++;
      if (new Date(mvt.createdAt) > new Date(map[clientId].dernierMouvement)) {
        map[clientId].dernierMouvement = mvt.createdAt;
      }
    });
    return Object.values(map).sort((a, b) => new Date(b.dernierMouvement) - new Date(a.dernierMouvement));
  }, [debtHistory]);

  const debtHistoryColumns = [
    { 
        key: 'clientNom', 
        label: 'Client',
        render: (nom) => <span className="fw-bold">{nom}</span>
    },
    { 
        key: 'nbMouvements', 
        label: 'Nb Opérations',
        render: (val) => <Badge bg="secondary">{val}</Badge>
    },
    { 
        key: 'totalDettes', 
        label: 'Total Dettes Créées',
        render: (val) => <span className="fw-bold text-danger">+ {(val || 0).toLocaleString()} GNF</span>
    },
    { 
        key: 'totalRemboursements', 
        label: 'Total Remboursements',
        render: (val) => <span className="fw-bold text-success">- {(val || 0).toLocaleString()} GNF</span>
    },
    { 
        key: 'soldeActuel', 
        label: 'Solde Actuel',
        render: (val) => (
            <span className={`fw-bold ${val > 0 ? 'text-danger' : 'text-success'}`}>
                {(val || 0).toLocaleString()} GNF
            </span>
        )
    },
{ 
        key: 'dernierMouvement', 
        label: 'Dernière Opération',
        render: (date) => new Date(date).toLocaleString('fr-FR')
    },
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
                    <TableComponent columns={debtHistoryColumns} data={groupedDebtHistory} loading={historyLoading} emptyMessage="Aucun mouvement de dette enregistré." />
                </Tab>
<Tab eventKey="crm" title={<span className="text-primary"><iconify-icon icon="solar:widget-bold" className="me-1"></iconify-icon>Analyse CRM</span>}>
                    <div className="p-3">
<CrmDashboard
                            crmData={crmData}
                            crmQuartiers={crmQuartiers}
                            loading={crmLoading}
                            onRelancer={handleRelancerClient}
                            onSettingsUpdated={fetchCrmAnalytics}
                        />
                    </div>
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

      {/* Modale de Relance (message personnalisé) */}
      <Modal show={showRelanceModal} onHide={() => setShowRelanceModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>
            <iconify-icon icon="solar:mail-bold" className="me-2 align-middle"></iconify-icon>
            Envoyer une relance à {relanceClientNom}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-2">
            <Form.Label>Message de relance (personnalisé)</Form.Label>
            <Form.Control
              as="textarea"
              rows={7}
              value={relanceMessage}
              onChange={(e) => setRelanceMessage(e.target.value)}
              placeholder={"Laissez vide pour utiliser le message automatique personnalisé (basé sur l'historique d'achat du client)."}
            />
          </Form.Group>
          <small className="text-muted">
            Si vide, un message automatique sera généré en fonction des habitudes d'achat du client (jours d'inactivité, dépense totale, catégorie préférée).
          </small>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowRelanceModal(false)} disabled={relanceSending}>
            Annuler
          </Button>
          <Button variant="primary" onClick={confirmRelance} disabled={relanceSending}>
            {relanceSending ? <Spinner as="span" size="sm" animation="border" /> : (
              <><iconify-icon icon="solar:send-bold" className="me-1 align-middle"></iconify-icon> Envoyer la relance</>
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default ClientsView;