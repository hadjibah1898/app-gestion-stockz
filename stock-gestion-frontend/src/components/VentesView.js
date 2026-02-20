// src/components/VentesView.js
import React, { useState, useEffect, useRef } from 'react';
import { Button, Form, Table, Alert, Spinner, Badge, Card, Row, Col, Modal, InputGroup } from 'react-bootstrap';
import { articleAPI, venteAPI } from '../services/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Html5QrcodeScanner } from "html5-qrcode";

const VentesView = ({ userRole }) => {
  const [articles, setArticles] = useState([]);
  const [historique, setHistorique] = useState([]);
  const [panier, setPanier] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [selectedArticle, setSelectedArticle] = useState('');
  const [quantite, setQuantite] = useState(1);
  const [barcode, setBarcode] = useState('');
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [saleToCancel, setSaleToCancel] = useState(null);

  // Référence pour le champ de scan (pour garder le focus)
  const barcodeInputRef = useRef(null);

  // États pour la modale d'aperçu d'image
  const [showImageModal, setShowImageModal] = useState(false);
  const [previewImage, setPreviewImage] = useState('');

  // État pour le scanner caméra
  const [showScanner, setShowScanner] = useState(false);

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
    if (parseInt(quantite) <= 0) {
      setError("La quantité doit être supérieure à 0");
      return;
    }
    setError('');

    const article = articles.find(a => a._id === selectedArticle);
    if (!article) return;

    const existeDeja = panier.find(item => item.article._id === selectedArticle);
    
    if (existeDeja) {
      setPanier(panier.map(item => 
        item.article._id === selectedArticle
          ? { 
              ...item, 
              quantite: item.quantite + parseInt(quantite),
              prixTotal: article.prixVente * (item.quantite + parseInt(quantite))
            }
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
    // Refocus sur le champ scanner pour enchaîner (Mode Douchette Bluetooth)
    setTimeout(() => barcodeInputRef.current?.focus(), 10);
  };

  const retirerDuPanier = (id) => {
    setPanier(panier.filter(item => item.article._id !== id));
    // Refocus sur le champ scanner après suppression (Mode Douchette Bluetooth)
    setTimeout(() => barcodeInputRef.current?.focus(), 10);
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
      setSuccessMessage('Vente effectuée avec succès !');
      setPanier([]);
      fetchData();
      setTimeout(() => setSuccessMessage(''), 3000);
      // Refocus sur le champ scanner pour la prochaine vente (Mode Douchette Bluetooth)
      setTimeout(() => barcodeInputRef.current?.focus(), 10);
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de la vente');
    }
  };

   const isCancellationAllowed = (vente) => {
    if (userRole === 'Admin') {
        return true; // Admin can always cancel
    }
    if (userRole === 'Gérant') {
        const now = new Date();
        const saleDate = new Date(vente.createdAt);
        const diffInHours = (now - saleDate) / (1000 * 60 * 60);
        return diffInHours <= 24;
    }
    return false;
  };

  const confirmCancel = async () => {
    try {
      await venteAPI.cancel(saleToCancel._id);
      setSuccessMessage("Vente annulée avec succès. Le stock a été restauré.");
      fetchData();
    } catch (err) {
      setError(err.response?.data?.message || "Erreur lors de l'annulation.");
    } finally {
      setShowCancelModal(false);
      setTimeout(() => setSuccessMessage(''), 3000);
    }
  };

  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(1000, audioCtx.currentTime); // Fréquence 1000Hz
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime); // Volume 10%
      
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1); // Durée 100ms
    } catch (e) {
      console.error("Audio error", e);
    }
  };

  // Logique de traitement du code-barres (extraite pour être utilisée par le scanner et l'input)
  const processBarcode = (code) => {
    if (!code) return;

    const article = articles.find(a => a.code && a.code.toLowerCase() === code.toLowerCase());
    if (!article) {
        setError(`Aucun article trouvé avec le code "${code}".`);
        // On ne vide pas forcément le champ si c'est une erreur de frappe manuelle, mais pour le scan c'est mieux
        return;
    }

    if (article.quantite <= 0) {
        setError(`Stock épuisé pour l'article "${article.nom}".`);
        return;
    }

    setPanier(prevPanier => {
      const existeDeja = prevPanier.find(item => item.article._id === article._id);
      
      if (existeDeja) {
        // Vérifier si on peut ajouter une unité de plus
        if (article.quantite <= existeDeja.quantite) {
            setError(`Stock insuffisant pour ajouter plus de "${article.nom}".`);
            setBarcode(''); // Vider le champ même en cas d'erreur
            return prevPanier; // Ne pas modifier le panier
        }
        return prevPanier.map(item => 
          item.article._id === article._id 
            ? { ...item, quantite: item.quantite + 1, prixTotal: article.prixVente * (item.quantite + 1) }
            : item
        );
      } else {
        return [
          ...prevPanier,
          {
            article,
            quantite: 1,
            prixTotal: article.prixVente * 1
          }
        ];
      }
    });
    
    playBeep();
    setError('');
    setBarcode('');
    
    // Garder le focus sur le champ de scan pour enchaîner les articles
    setTimeout(() => barcodeInputRef.current?.focus(), 10);
  };

  const handleBarcodeScan = (e) => {
    e.preventDefault();
    processBarcode(barcode);
  };

  // Gestion du scanner caméra
  useEffect(() => {
    if (showScanner) {
        const scanner = new Html5QrcodeScanner(
            "reader",
            { fps: 10, qrbox: { width: 250, height: 250 } },
            /* verbose= */ false
        );
        
        let lastScannedCode = null;
        let lastScannedTime = 0;

        scanner.render((decodedText) => {
            const now = Date.now();
            // Empêcher les scans multiples immédiats du même code (délai de 1.5s)
            if (decodedText === lastScannedCode && now - lastScannedTime < 1500) {
                return;
            }
            lastScannedCode = decodedText;
            lastScannedTime = now;

            setBarcode(decodedText); // Affiche le code scanné dans le champ
            processBarcode(decodedText); // Traite le code
        }, (error) => {
            // console.warn(error); // Ignorer les erreurs de scan en continu
        });

        return () => {
            scanner.clear().catch(error => console.error("Failed to clear html5-qrcode scanner. ", error));
        };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showScanner]); // On ne met pas 'articles' ou 'panier' ici pour éviter de recréer le scanner à chaque ajout

  const handleImageClick = (img) => {
    setPreviewImage(img);
    setShowImageModal(true);
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
                <iconify-icon icon="solar:printer-bold" className="me-2 align-middle"></iconify-icon>
                Exporter PDF
            </Button>
        </div>
      </div>

      {error && <Alert variant="danger" onClose={() => setError('')} dismissible>
        {error}
      </Alert>}
      {successMessage && <Alert variant="success">{successMessage}</Alert>}

      {userRole === 'Admin' ? (
        <Card className="border-0 shadow-sm rounded-4">
          <Card.Header>Historique complet des transactions</Card.Header>
          <Card.Body>
            <Table striped bordered hover responsive>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Image</th>
                  <th>Article</th>
                  <th>Quantité</th>
                  <th>Prix Total</th>
                  <th>Vendeur</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {historique.map(vente => (
                  <tr key={vente._id}>
                    <td>{new Date(vente.createdAt).toLocaleDateString()} {new Date(vente.createdAt).toLocaleTimeString()}</td>
                    <td>{vente.article?.image ? <img src={vente.article.image} alt="" className="rounded" style={{width: '30px', height: '30px', objectFit: 'cover', cursor: 'pointer'}} onClick={() => handleImageClick(vente.article.image)} /> : '-'}</td>
                    <td>{vente.article?.nom || 'Article supprimé'}</td>
                    <td>{vente.quantite}</td>
                    <td>{vente.prixTotal.toLocaleString()} GNF</td>
                    <td>{vente.gerant?.nom || 'Inconnu'}</td>
                    <td>
                      {vente.isCancelled && <Badge bg="secondary">Annulé</Badge>}
                    </td>
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
              <Form onSubmit={handleBarcodeScan} className="mb-3">
                <Form.Group>
                    <Form.Label>Scanner un code-barres</Form.Label>
                    <InputGroup>
                        <InputGroup.Text><iconify-icon icon="solar:barcode-scanner-bold-duotone"></iconify-icon></InputGroup.Text>
                        <Form.Control
                            ref={barcodeInputRef}
                            type="text"
                            placeholder="Scannez ou saisissez un code..."
                            value={barcode}
                            onChange={(e) => setBarcode(e.target.value)}
                            autoFocus
                        />
                        <Button variant="outline-secondary" onClick={() => setShowScanner(true)} title="Scanner avec la caméra">
                            <iconify-icon icon="solar:camera-bold" style={{ fontSize: '20px' }}></iconify-icon>
                        </Button>
                        <Button type="submit" variant="secondary">Ajouter</Button>
                    </InputGroup>
                </Form.Group>
              </Form>
              <div className="text-center text-muted my-3 small fw-bold">OU</div>
              <Form className="mb-4" onSubmit={(e) => { e.preventDefault(); ajouterAuPanier(); }}>
                <Row className="align-items-end">
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
                            {article.code ? `[${article.code}] ` : ''}{article.nom} - {article.prixVente} GNF (Stock: {article.quantite})
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
                        <th>Img</th>
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
                          <td>{item.article.image ? <img src={item.article.image} alt="" className="rounded" style={{width: '140px', height: '100px', objectFit: 'cover', cursor: 'pointer'}} onClick={() => handleImageClick(item.article.image)} /> : null}</td>
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
                    <h2 className="fw-bold text-primary">Total: {calculerTotal().toLocaleString()} GNF</h2>
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
              {historique.slice(0, 5).map(vente => ( // Affiche les 5 ventes les plus récentes
                <div key={vente._id} className="d-flex gap-3 mb-3 pb-3 border-bottom">
                  {vente.article?.image && <img src={vente.article.image} alt="" className="rounded" style={{width: '45px', height: '45px', objectFit: 'cover', cursor: 'pointer'}} onClick={() => handleImageClick(vente.article.image)} />}
                  <div className="flex-grow-1">
                      <div className="d-flex justify-content-between">
                          <span className="fw-bold">{vente.article.nom}</span>
                          <Badge bg="success">
                              {vente.prixTotal.toLocaleString()} GNF
                          </Badge>
                      </div>
                      <div className="text-muted small">
                          Quantité: {vente.quantite} | Date: {new Date(vente.createdAt).toLocaleDateString()}
                      </div>
                  </div>
                </div>
              ))}
              {historique.length === 0 && (
                <Alert variant="info">Aucune vente enregistrée</Alert>
              )}
            </Card.Body>
          </Card>
        </Col>

        {/* Historique Complet pour le Gérant */}
        <Col md={12} className="mt-4">
            <Card className="border-0 shadow-sm rounded-4">
                <Card.Header>Historique complet de mes ventes</Card.Header>
                <Card.Body>
                    <Table striped bordered hover responsive size="sm">
                        <thead>
                            <tr><th>Date</th><th>Image</th><th>Article</th><th>Quantité</th><th>Prix Total</th><th>Actions</th></tr>
                        </thead>
                        <tbody>
                            {historique.map(vente => (
                                <tr key={vente._id}>
                                    <td>{new Date(vente.createdAt).toLocaleDateString()} {new Date(vente.createdAt).toLocaleTimeString()}</td>
                                    <td>{vente.article?.image ? <img src={vente.article.image} alt="" className="rounded" style={{width: '30px', height: '30px', objectFit: 'cover', cursor: 'pointer'}} onClick={() => handleImageClick(vente.article.image)} /> : '-'}</td>
                                    <td>{vente.article?.nom || 'Article supprimé'}</td>
                                    <td>{vente.quantite}</td>
                                    <td>{vente.prixTotal.toLocaleString()} GNF</td>
                                    <td>
                                      {!vente.isCancelled ? (
                                        <Button 
                                          variant="outline-danger" 
                                          size="sm" 
                                          onClick={() => { setSaleToCancel(vente); setShowCancelModal(true); }}
                                          disabled={!isCancellationAllowed(vente)}
                                          title={!isCancellationAllowed(vente) ? "L'annulation par un gérant n'est possible que dans les 24h." : "Annuler la vente"}
                                        >Annuler</Button>
                                      ) : <Badge bg="secondary">Annulé</Badge>}
                                    </td>
                                </tr>
                            ))}
                            {historique.length === 0 && <tr><td colSpan="4" className="text-center">Aucune vente enregistrée</td></tr>}
                        </tbody>
                    </Table>
                </Card.Body>
            </Card>
        </Col>
      </Row>
      )}

      {/* Modale de confirmation d'annulation */}
      <Modal show={showCancelModal} onHide={() => setShowCancelModal(false)}>
        <Modal.Header closeButton><Modal.Title>Annuler la vente</Modal.Title></Modal.Header>
        <Modal.Body>Êtes-vous sûr de vouloir annuler cette vente ? Le stock sera restauré.</Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowCancelModal(false)}>Non</Button>
          <Button variant="danger" onClick={confirmCancel}>Oui, annuler</Button>
        </Modal.Footer>
      </Modal>

      {/* Modale d'aperçu d'image */}
      <Modal show={showImageModal} onHide={() => setShowImageModal(false)} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Aperçu du produit</Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center bg-light p-4">
          {previewImage && <img src={previewImage} alt="Aperçu grand format" className="img-fluid rounded shadow" style={{ maxHeight: '80vh' }} />}
        </Modal.Body>
      </Modal>

      {/* Modale Scanner Caméra */}
      <Modal show={showScanner} onHide={() => setShowScanner(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Scanner un code-barres</Modal.Title>
        </Modal.Header>
        <Modal.Body>
            <div id="reader" width="100%"></div>
            <p className="text-center text-muted mt-2 small">Le scanner reste ouvert pour ajouter plusieurs articles.</p>
            {error && <Alert variant="danger" className="mt-2 py-2 small text-center">{error}</Alert>}
        </Modal.Body>
      </Modal>
    </div>
  );
};

export default VentesView;