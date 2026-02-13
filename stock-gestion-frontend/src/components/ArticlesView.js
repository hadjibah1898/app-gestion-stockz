// src/components/ArticlesView.js
import React, { useState, useEffect } from 'react';
import { Button, Form, Modal, Alert, Spinner, Badge, Card, OverlayTrigger, Tooltip } from 'react-bootstrap';
import TableComponent from './common/Table';
import { articleAPI, boutiqueAPI } from '../services/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const ArticlesView = ({ userRole }) => {
  const [articles, setArticles] = useState([]);
  const [boutiques, setBoutiques] = useState([]);
  const [filterBoutique, setFilterBoutique] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentArticle, setCurrentArticle] = useState({
    _id: '',
    nom: '',
    prixAchat: '',
    prixVente: '',
    quantite: '',
    boutique: '' // Ajout du champ boutique
  });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [articlesRes, boutiquesRes] = await Promise.all([
          articleAPI.getAll(),
          userRole === 'Admin' ? boutiqueAPI.getAll() : Promise.resolve({ data: [] })
        ]);
        setArticles(articlesRes.data);
        setBoutiques(boutiquesRes.data);
      } catch (err) {
        setError(err.response?.data?.message || 'Erreur de chargement');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [userRole]);

  const handleShowModal = (article = null) => {
    if (article) {
      setCurrentArticle(article);
      setEditMode(true);
    } else {
      setCurrentArticle({
        nom: '',
        prixAchat: '',
        prixVente: '',
        quantite: '',
        boutique: ''
      });
      setEditMode(false);
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
  };

  const handleChange = (e) => {
    setCurrentArticle({
      ...currentArticle,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Correction : S'assurer que l'ID de la boutique est envoyé, pas l'objet complet
    const payload = {
        ...currentArticle,
        boutique: currentArticle.boutique?._id || currentArticle.boutique
    };

    try {
      if (editMode) {
        await articleAPI.update(currentArticle._id, payload);
      } else {
        await articleAPI.create(payload);
      }
      window.location.reload(); // Recharge la page pour voir les changements
      handleCloseModal();
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur d\'enregistrement');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cet article ?')) {
      try {
        await articleAPI.delete(id);
        window.location.reload(); // Recharge la page
      } catch (err) {
        setError(err.response?.data?.message || 'Erreur de suppression');
      }
    }
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.text("Liste des Articles", 14, 15);
    
    const tableColumn = ["Nom", "Boutique", "Prix Achat", "Prix Vente", "Quantité"];
    const tableRows = [];

    filteredArticles.forEach(article => {
      const articleData = [
        article.nom,
        article.boutique?.nom || 'Non assignée',
        (article.prixAchat.toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' '),
        (article.prixVente.toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' '),
        article.quantite
      ];
      tableRows.push(articleData);
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 20,
    });
    doc.save("articles.pdf");
  };

  const columns = [
    { key: 'nom', label: 'Nom' },
    {
      key: 'boutique',
      label: 'Boutique',
      render: (boutique) => boutique?.nom || <Badge bg="secondary">Non assignée</Badge>
    },
    { 
      key: 'prixAchat', 
      label: 'Prix Achat',
      render: (value) => `${value.toLocaleString()} GNF`
    },
    { 
      key: 'prixVente', 
      label: 'Prix Vente',
      render: (value) => `${value.toLocaleString()} GNF`
    },
    { 
      key: 'quantite', 
      label: 'Quantité',
      render: (value) => (
        <Badge bg={value > 10 ? 'success' : value > 0 ? 'warning' : 'danger'}>
          {value} unités
        </Badge>
      )
    },
    { 
      key: 'actions',
      label: 'Actions',
      render: (_, article) => userRole === 'Admin' && (
        <div className="d-flex gap-2">
          <OverlayTrigger overlay={<Tooltip>Modifier</Tooltip>}>
            <Button variant="link" className="text-primary p-0" onClick={() => handleShowModal(article)}>
              <iconify-icon icon="solar:pen-new-square-linear" style={{ fontSize: '20px' }}></iconify-icon>
            </Button>
          </OverlayTrigger>

          <OverlayTrigger overlay={<Tooltip>Supprimer</Tooltip>}>
            <Button variant="link" className="text-danger p-0" onClick={() => handleDelete(article._id)}>
              <iconify-icon icon="solar:trash-bin-trash-linear" style={{ fontSize: '20px' }}></iconify-icon>
            </Button>
          </OverlayTrigger>
        </div>
      )
    }
  ];

  // Filtrer les articles si une boutique est sélectionnée
  const filteredArticles = filterBoutique 
    ? articles.filter(a => (a.boutique?._id || a.boutique) === filterBoutique)
    : articles;

  if (loading) return <Spinner animation="border" />;

  return (
    <div className="p-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h3 className="fw-bold mb-0 text-body">Gestion des Articles</h3>
        <div className="d-flex gap-2">
            <Button variant="outline-secondary" onClick={handleExportPDF} className="rounded-pill px-4 shadow-sm">
                <iconify-icon icon="solar:printer-bold" class="me-2 align-middle"></iconify-icon>
                Exporter PDF
            </Button>
            {userRole === 'Admin' && (
            <Button variant="primary" onClick={() => handleShowModal()} className="rounded-pill px-4 shadow-sm">
                <iconify-icon icon="solar:add-circle-bold" class="me-2 align-middle"></iconify-icon>
                Ajouter un Article
            </Button>
            )}
        </div>
      </div>

      {/* Filtre par boutique (Visible uniquement pour l'Admin) */}
      {userRole === 'Admin' && (
        <div className="mb-4">
          <Form.Select 
            value={filterBoutique} 
            onChange={(e) => setFilterBoutique(e.target.value)}
            style={{ maxWidth: '300px' }}
          >
            <option value="">Toutes les boutiques</option>
            {boutiques.map(boutique => (
              <option key={boutique._id} value={boutique._id}>{boutique.nom}</option>
            ))}
          </Form.Select>
        </div>
      )}

      {error && <Alert variant="danger" onClose={() => setError('')} dismissible>
        {error}
      </Alert>}

      <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
        <Card.Body className="p-0">
          <TableComponent 
            columns={columns}
            data={filteredArticles}
            emptyMessage="Aucun article trouvé"
          />
        </Card.Body>
      </Card>

      <Modal show={showModal} onHide={handleCloseModal}>
        <Modal.Header closeButton>
          <Modal.Title>
            {editMode ? 'Modifier l\'Article' : 'Nouvel Article'}
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Nom de l'article</Form.Label>
              <Form.Control
                type="text"
                name="nom"
                value={currentArticle.nom}
                onChange={handleChange}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Boutique</Form.Label>
              <Form.Select
                name="boutique"
                value={currentArticle.boutique?._id || currentArticle.boutique || ''}
                onChange={handleChange}
                required
                disabled={userRole !== 'Admin'}
              >
                <option value="">Sélectionner une boutique</option>
                {boutiques.map(boutique => (
                  <option key={boutique._id} value={boutique._id}>
                    {boutique.nom}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Prix d'achat (GNF)</Form.Label>
              <Form.Control
                type="number"
                name="prixAchat"
                value={currentArticle.prixAchat}
                onChange={handleChange}
                min="0"
                step="0.01"
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Prix de vente (GNF)</Form.Label>
              <Form.Control
                type="number"
                name="prixVente"
                value={currentArticle.prixVente}
                onChange={handleChange}
                min="0"
                step="0.01"
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Quantité initiale</Form.Label>
              <Form.Control
                type="number"
                name="quantite"
                value={currentArticle.quantite}
                onChange={handleChange}
                min="0"
                required
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
    </div>
  );
};

export default ArticlesView;
