// src/components/ArticlesView.js
import React, { useState, useEffect, useCallback } from 'react';
import { Button, Form, Modal, Alert, Spinner, Badge, Card, OverlayTrigger, Tooltip, Row, Col } from 'react-bootstrap';
import TableComponent from './common/Table';
import { articleAPI, boutiqueAPI } from '../services/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const ArticlesView = ({ userRole, boutiqueId, title, headerActions }) => {
  const [articles, setArticles] = useState([]);
  const [boutiques, setBoutiques] = useState([]);
  const [filterBoutique, setFilterBoutique] = useState(boutiqueId || '');
  const [searchTerm, setSearchTerm] = useState(''); // État pour la barre de recherche
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentArticle, setCurrentArticle] = useState({
    _id: '',
    nom: '',
    code: '',
    prixAchat: '',
    prixVente: '',
    quantite: '',
    boutique: '', // Ajout du champ boutique
    image: ''
  });

  // États pour la confirmation de suppression
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [articleToDelete, setArticleToDelete] = useState(null);

  const fetchData = useCallback(async () => {
    try {
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
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur de chargement');
    }
  }, [userRole]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleShowModal = (article = null) => {
    if (article) {
      setCurrentArticle(article);
      setEditMode(true);
    } else {
      setCurrentArticle({
        nom: '',
        code: '',
        prixAchat: '',
        prixVente: '',
        quantite: '',
        boutique: '',
        image: ''
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

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) { // Limite 2Mo
        setError("L'image est trop volumineuse (max 2Mo)");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setCurrentArticle({ ...currentArticle, image: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    
    // Correction : S'assurer que l'ID de la boutique est envoyé, pas l'objet complet
    const payload = {
        ...currentArticle,
        boutique: currentArticle.boutique?._id || currentArticle.boutique
    };

    try {
      if (editMode) {
        if (!currentArticle._id) {
            setError("Erreur interne : ID de l'article manquant.");
            return;
        }
        await articleAPI.update(currentArticle._id, payload);
        setSuccessMessage('Article modifié avec succès !');
      } else {
        await articleAPI.create(payload);
        setSuccessMessage('Article créé avec succès !');
      }
      fetchData();
      handleCloseModal();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur d\'enregistrement');
    }
  };

  const confirmDelete = (id) => {
    setArticleToDelete(id);
    setShowDeleteModal(true);
  };

  const executeDelete = async () => {
    setError('');
    setSuccessMessage('');
    try {
      await articleAPI.delete(articleToDelete);
      setShowDeleteModal(false);
      setSuccessMessage('Article supprimé avec succès !');
      fetchData();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur de suppression');
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
    {
      key: 'image',
      label: 'Image',
      render: (img) => img ? <img src={img} alt="produit" className="rounded shadow-sm" style={{width: '40px', height: '40px', objectFit: 'cover'}} /> : <div className="bg-light rounded d-flex align-items-center justify-content-center text-muted small" style={{width: '40px', height: '40px'}}><iconify-icon icon="solar:camera-linear"></iconify-icon></div>
    },
    { key: 'code', label: 'Code' },
    { key: 'nom', label: 'Nom' },
    {
      key: 'boutique',
      label: 'Boutique',
      render: (boutique) => {
        if (!boutique) {
          return <Badge bg="secondary">Non assignée</Badge>;
        }
        return (
          <span>
            {boutique.nom} {boutique.type === 'Centrale' && <Badge bg="primary" pill className="ms-2">Centrale</Badge>}
          </span>
        );
      }
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
            <Button variant="link" className="text-danger p-0" onClick={() => confirmDelete(article._id)}>
              <iconify-icon icon="solar:trash-bin-trash-linear" style={{ fontSize: '20px' }}></iconify-icon>
            </Button>
          </OverlayTrigger>
        </div>
      )
    }
  ];

  // Filtrer les articles en fonction de la boutique sélectionnée et du terme de recherche
  const filteredArticles = articles.filter(article => {
    const matchBoutique = !filterBoutique || (article.boutique?._id || article.boutique) === filterBoutique;
    const matchSearch = !searchTerm || article.nom.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        (article.code && article.code.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchBoutique && matchSearch;
  });

  if (loading) return <Spinner animation="border" />;

  return (
    <div className="p-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h3 className="fw-bold mb-0 text-body">{title || 'Gestion des Articles'}</h3>
        <div className="d-flex gap-2">
            <Button variant="outline-secondary" onClick={handleExportPDF} className="rounded-pill px-4 shadow-sm">
                <iconify-icon icon="solar:printer-bold" class="me-2 align-middle"></iconify-icon>
                Exporter PDF
            </Button>
            {headerActions}
        </div>
      </div>

      {/* Filtres */}
      <Row className="mb-4">
        <Col md={4}>
          <Form.Control
            type="text"
            placeholder="Rechercher par nom ou code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </Col>
        {userRole === 'Admin' && (
          <Col md={4}>
            <Form.Select 
              value={filterBoutique} 
              onChange={(e) => setFilterBoutique(e.target.value)}
              disabled={!!boutiqueId}
            >
              <option value="">Toutes les boutiques</option>
              {boutiques.map(boutique => (
                <option key={boutique._id} value={boutique._id}>{boutique.nom}</option>
              ))}
            </Form.Select>
          </Col>
        )}
      </Row>

      {successMessage && <Alert variant="success">{successMessage}</Alert>}
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
              <Form.Label>Image du produit</Form.Label>
              <Form.Control type="file" accept="image/*" onChange={handleImageChange} />
              {currentArticle.image && (
                <div className="mt-2 text-center position-relative">
                  <img src={currentArticle.image} alt="Aperçu" className="img-fluid rounded shadow-sm" style={{maxHeight: '150px'}} />
                  <Button variant="danger" size="sm" className="position-absolute top-0 end-0 m-1 rounded-circle p-1 d-flex align-items-center justify-content-center" style={{width:'24px', height:'24px'}} onClick={() => setCurrentArticle({...currentArticle, image: ''})}>
                    <iconify-icon icon="solar:close-circle-bold"></iconify-icon>
                  </Button>
                </div>
              )}
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Code Article (Référence)</Form.Label>
              <Form.Control
                type="text"
                name="code"
                value={currentArticle.code}
                onChange={handleChange}
                placeholder="Ex: REF-001"
              />
            </Form.Group>
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

      {/* Modale de Confirmation de Suppression */}
      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="text-danger">⚠️ Suppression d'Article</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="fw-bold">Êtes-vous sûr de vouloir supprimer cet article ?</p>
          <Alert variant="warning" className="mb-0 small">
            Cette action est irréversible et supprimera l'article de votre inventaire.
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

export default ArticlesView;
