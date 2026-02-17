// src/components/VentesView.js
import React, { useState, useEffect } from 'react';
import { Button, Form, Table, Alert, Spinner, Badge, Card, Row, Col } from 'react-bootstrap';
import { articleAPI, venteAPI } from '../services/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const VentesView = ({ userRole }) => {
  const [articles, setArticles] = useState([]);
  const [historique, setHistorique] = useState([]);
  const [panier, setPanier] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedArticle, setSelectedArticle] = useState('');
  const [quantite, setQuantite] = useState(1);
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });

  useEffect(() => {
    fetchData();
  }, [dateFilter]); // Recharger quand les dates changent

  const fetchData = async () => {
    try {
      const params = {};
      if (dateFilter.start) params.startDate = dateFilter.start;
      if (dateFilter.end) params.endDate = dateFilter.end;

      const [articlesRes, historiqueRes] = await Promise.all([
        articleAPI.getAll(),
        venteAPI.getHistorique(params)
      ]);
      setArticles(articlesRes.data.filter(a => a.quantite > 0));
      setHistorique(historiqueRes.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  const ajouterAuPanier = () => {
    const article = articles.find(a => a._id === selectedArticle);
    if (!article) return;

    const existeDeja = panier.find(item => item.article._id === selectedArticle);
    
    if (existeDeja) {
      setPanier(panier.map(item => 
        item.article._id === selectedArticle 
          ? { ...item, quantite: item.quantite + parseInt(quantite) }
          : item
      ));
    } else {
      setPanier([
        ...panier,
        {
          article,
          quantite: parseInt(quantite),
          prixTotal: article.prixVente * parseInt(quantite)
        }
      ]);
    }
    
    setSelectedArticle('');
    setQuantite(1);
  };

  const retirerDuPanier = (id) => {
    setPanier(panier.filter(item => item.article._id !== id));
  };

  const calculerTotal = () => {
    return panier.reduce((total, item) => total + item.prixTotal, 0);
  };

  const effectuerVente = async () => {
    if (panier.length === 0) {
      setError('Le panier est vide');
      return;
    }

    const venteData = {
      panier: panier.map(item => ({
        article: item.article._id,
        quantite: item.quantite
      }))
    };

    try {
      await venteAPI.create(venteData);
      setPanier([]);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de la vente');
    }
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.text("Historique des Ventes", 14, 15);
    
    const tableColumn = ["Date", "Article", "Quantité", "Prix Total", "Vendeur"];
    const tableRows = [];
    let totalGlobal = 0;

    historique.forEach(vente => {
      totalGlobal += vente.prixTotal;
      const venteData = [
        new Date(vente.createdAt).toLocaleDateString() + ' ' + new Date(vente.createdAt).toLocaleTimeString(),
        vente.article?.nom || 'Article supprimé',
        vente.quantite,
        (vente.prixTotal.toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' '),
        vente.gerant?.nom || 'Inconnu'
      ];
      tableRows.push(venteData);
    });

    // Ajout de la ligne de Total Global
    tableRows.push([
      "", 
      "", 
      "TOTAL GLOBAL", 
      (totalGlobal.toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' '), 
      ""
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 20,
      columnStyles: {
        3: { halign: 'right' }
      },
      // Mettre en gras et gris clair la dernière ligne (Total)
      didParseCell: (data) => {
        if (data.row.index === tableRows.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [240, 240, 240];
        }
      }
    });
    doc.save("historique_ventes.pdf");
  };

  if (loading) return <Spinner animation="border" />;

  return (
    <div className="p-4">
      {/* Style pour colorer l'icône du calendrier natif en bleu primaire */}
      <style>{`
        input[type="date"]::-webkit-calendar-picker-indicator {
            cursor: pointer;
            filter: invert(33%) sepia(78%) saturate(2646%) hue-rotate(203deg) brightness(102%) contrast(103%);
        }
      `}</style>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h3 className="fw-bold mb-0 text-body">{userRole === 'Admin' ? 'Historique des Ventes' : 'Gestion des Ventes'}</h3>
        <div className="d-flex gap-2">
            <Form.Control 
                type="date" 
                value={dateFilter.start}
                onChange={(e) => setDateFilter({...dateFilter, start: e.target.value})}
                className="rounded-pill shadow-sm"
                style={{ maxWidth: '160px' }}
                title="Date de début"
            />
            <Form.Control 
                type="date" 
                value={dateFilter.end}
                onChange={(e) => setDateFilter({...dateFilter, end: e.target.value})}
                className="rounded-pill shadow-sm"
                style={{ maxWidth: '160px' }}
                title="Date de fin"
            />
            <Button variant="outline-secondary" onClick={handleExportPDF} className="rounded-pill px-4 shadow-sm">
                <iconify-icon icon="solar:printer-bold" class="me-2 align-middle"></iconify-icon>
                Exporter PDF
            </Button>
        </div>
      </div>

      {error && <Alert variant="danger" onClose={() => setError('')} dismissible>
        {error}
      </Alert>}

      {userRole === 'Admin' ? (
        <Card className="border-0 shadow-sm rounded-4">
          <Card.Header>Historique complet des transactions</Card.Header>
          <Card.Body>
            <Table striped bordered hover responsive>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Article</th>
                  <th>Quantité</th>
                  <th>Prix Total</th>
                  <th>Vendeur</th>
                </tr>
              </thead>
              <tbody>
                {historique.map(vente => (
                  <tr key={vente._id}>
                    <td>{new Date(vente.createdAt).toLocaleDateString()} {new Date(vente.createdAt).toLocaleTimeString()}</td>
                    <td>{vente.article?.nom || 'Article supprimé'}</td>
                    <td>{vente.quantite}</td>
                    <td>{vente.prixTotal.toLocaleString()} GNF</td>
                    <td>{vente.gerant?.nom || 'Inconnu'}</td>
                  </tr>
                ))}
                {historique.length === 0 && <tr><td colSpan="5" className="text-center">Aucune vente enregistrée</td></tr>}
              </tbody>
            </Table>
          </Card.Body>
        </Card>
      ) : (
      <Row>
        <Col md={8}>
          <Card className="mb-4 border-0 shadow-sm rounded-4">
            <Card.Header>Panier de vente</Card.Header>
            <Card.Body>
              <Form className="mb-4">
                <Row>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label>Article</Form.Label>
                      <Form.Select 
                        value={selectedArticle} 
                        onChange={(e) => setSelectedArticle(e.target.value)}
                      >
                        <option value="">Sélectionner un article</option>
                        {articles.map(article => (
                          <option key={article._id} value={article._id}>
                            {article.nom} - {article.prixVente} GNF (Stock: {article.quantite})
                          </option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group>
                      <Form.Label>Quantité</Form.Label>
                      <Form.Control
                        type="number"
                        min="1"
                        value={quantite}
                        onChange={(e) => setQuantite(e.target.value)}
                      />
                    </Form.Group>
                  </Col>
                  <Col md={2} className="d-flex align-items-end">
                    <Button 
                      variant="primary" 
                      onClick={ajouterAuPanier}
                      disabled={!selectedArticle}
                    >
                      Ajouter
                    </Button>
                  </Col>
                </Row>
              </Form>

              {panier.length > 0 ? (
                <>
                  <Table striped bordered hover>
                    <thead>
                      <tr>
                        <th>Article</th>
                        <th>Prix unitaire</th>
                        <th>Quantité</th>
                        <th>Total</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {panier.map(item => (
                        <tr key={item.article._id}>
                          <td>{item.article.nom}</td>
                          <td>{item.article.prixVente.toLocaleString()} GNF</td>
                          <td>{item.quantite}</td>
                          <td>{item.prixTotal.toLocaleString()} GNF</td>
                          <td>
                            <Button 
                              variant="outline-danger" 
                              size="sm"
                              onClick={() => retirerDuPanier(item.article._id)}
                            >
                              Retirer
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  <div className="d-flex justify-content-between align-items-center mt-3">
                    <h4>Total: {calculerTotal().toLocaleString()} GNF</h4>
                    <Button variant="success" size="lg" onClick={effectuerVente}>
                      Valider la vente
                    </Button>
                  </div>
                </>
              ) : (
                <Alert variant="info">
                  Le panier est vide. Ajoutez des articles pour effectuer une vente.
                </Alert>
              )}
            </Card.Body>
          </Card>
        </Col>

        <Col md={4}>
          <Card className="border-0 shadow-sm rounded-4">
            <Card.Header>Historique récent</Card.Header>
            <Card.Body>
              {historique.slice(0, 5).map(vente => (
                <div key={vente._id} className="mb-3 pb-3 border-bottom">
                  <div className="d-flex justify-content-between">
                    <span className="fw-bold">{vente.article.nom}</span>
                    <Badge bg="success">
                      {vente.prixTotal.toLocaleString()} GNF
                    </Badge>
                  </div>
                  <div className="text-muted small">
                    Quantité: {vente.quantite} | 
                    Date: {new Date(vente.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
              {historique.length === 0 && (
                <Alert variant="info">Aucune vente enregistrée</Alert>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
      )}
    </div>
  );
};

export default VentesView;