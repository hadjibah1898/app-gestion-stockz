// src/components/VentesView.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Form, Table, Alert, Spinner, Badge, Card, Row, Col, Modal, InputGroup, Tabs, Tab, Pagination } from 'react-bootstrap';
import { useSearchParams } from 'react-router-dom';
import { articleAPI, venteAPI, clientAPI } from '../services/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Html5QrcodeScanner } from "html5-qrcode";

const VentesView = ({ userRole, initialTab = 'sale' }) => {
  const [searchParams] = useSearchParams();
  const [articles, setArticles] = useState([]);
  const [historique, setHistorique] = useState([]);
  const [clients, setClients] = useState([]); // Liste des clients
  const [panier, setPanier] = useState([]);
  const [remisePanier, setRemisePanier] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [selectedArticle, setSelectedArticle] = useState('');
  const [quantite, setQuantite] = useState(1);
  const [barcode, setBarcode] = useState('');
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  const [selectedClientId, setSelectedClientId] = useState(''); // Client sélectionné
  const [montantPaye, setMontantPaye] = useState(''); // Montant payé par le client
  const [echeanceDette, setEcheanceDette] = useState(''); // Échéance pour la dette

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [saleToCancel, setSaleToCancel] = useState(null);

  // États pour le reçu après vente
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [lastSaleData, setLastSaleData] = useState(null);

  // États pour la création rapide de client
  const [showClientModal, setShowClientModal] = useState(false);
  const [newClient, setNewClient] = useState({ nom: '', telephone: '', type: 'Client' });
  const [clientLoading, setClientLoading] = useState(false);

  // Référence pour le champ de scan (pour garder le focus)
  const barcodeInputRef = useRef(null);

  // États pour la modale d'aperçu d'image
  const [showImageModal, setShowImageModal] = useState(false);
  const [previewImage, setPreviewImage] = useState('');

  // État pour le scanner caméra
  const [showScanner, setShowScanner] = useState(false);

  // État pour le filtre des ventes annulées
  const [showCancelledOnly, setShowCancelledOnly] = useState(false);
  const [pendingSales, setPendingSales] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const itemsPerPage = 15;

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        page: currentPage,
        limit: itemsPerPage,
        showCancelledOnly: showCancelledOnly
      };
      if (dateFilter.start) params.startDate = dateFilter.start;
      if (dateFilter.end) {
          const end = new Date(dateFilter.end);
          end.setHours(23, 59, 59, 999);
          params.endDate = end.toISOString();
      }

      const promises = [
        articleAPI.getAll(),
        venteAPI.getHistorique(params),
        clientAPI.getAll() // Charger les clients
      ];

      // Admin et Gérant peuvent voir les ventes en attente (le backend filtre pour le gérant)
      if (userRole === 'Admin' || userRole === 'Gérant') {
        promises.push(venteAPI.getPendingSales());
      }

      const [articlesRes, historiqueRes, clientsRes, pendingSalesRes] = await Promise.all(promises);

      setArticles((articlesRes.data || []).filter(a => a.quantite > 0));
      setHistorique(historiqueRes.data.ventes || []);
      setTotalPages(historiqueRes.data.totalPages || 0);
      setClients(clientsRes.data || []);

      if ((userRole === 'Admin' || userRole === 'Gérant') && pendingSalesRes) {
        setPendingSales(pendingSalesRes.data || []);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [dateFilter, userRole, currentPage, showCancelledOnly]);

  useEffect(() => {
    fetchData();
  }, [fetchData]); // Recharger quand les filtres ou la page changent

  const handleValidateRemise = async (venteId) => {
    try {
      await venteAPI.validateRemise(venteId);
      setSuccessMessage("Remise validée avec succès !");
      fetchData();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Erreur lors de la validation.");
    }
  };

  const handleRejectRemise = async (venteId) => {
    try {
      await venteAPI.rejectRemise(venteId);
      setSuccessMessage("Remise refusée avec succès !");
      fetchData();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Erreur lors du refus.");
    }
  };

  // Fonction utilitaire pour calculer le prix effectif d'un article (avec promo/remise)
  // Ajout d'un paramètre remise temporaire (pour le panier)
  const getEffectivePrice = (article, remiseTemp = null) => {
    let price = article.prixVente;
    // 1. Promo
    if (article.promoActive && article.promo > 0) {
        const now = new Date();
        const start = article.dateDebutPromo ? new Date(article.dateDebutPromo) : null;
        const end = article.dateFinPromo ? new Date(article.dateFinPromo) : null;
        if ((!start || now >= start) && (!end || now <= end)) {
            return price * (1 - article.promo / 100);
        }
    }
    // 2. Remise temporaire (panier)
    if (remiseTemp !== null && !isNaN(remiseTemp) && remiseTemp > 0) {
      return price * (1 - remiseTemp / 100);
    }
    // 3. Remise article (définitive)
    if (article.remise > 0) {
        return price * (1 - article.remise / 100);
    }
    return price;
  };

  const ajouterAuPanier = () => {
    if (parseInt(quantite) <= 0) {
      setError("La quantité doit être supérieure à 0");
      return;
    }
    if (remisePanier !== '' && (isNaN(remisePanier) || remisePanier < 0 || remisePanier > 50)) {
      setError("La remise doit être comprise entre 0 et 50%");
      return;
    }
    setError('');

    const article = articles.find(a => a._id === selectedArticle);
    if (!article) return;

    const remiseValue = remisePanier !== '' ? parseFloat(remisePanier) : null;
    const prixUnitaire = getEffectivePrice(article, remiseValue);

    const existeDeja = panier.find(item => item.article._id === selectedArticle);
    
    if (existeDeja) {
      setPanier(panier.map(item => 
        item.article._id === selectedArticle
          ? { 
              ...item, 
              quantite: item.quantite + parseInt(quantite),
              remiseTemp: remiseValue,
              prixTotal: getEffectivePrice(article, remiseValue) * (item.quantite + parseInt(quantite))
            }
          : item
      ));
    } else {
      setPanier([
        ...panier,
        {
          article,
          quantite: parseInt(quantite),
          remiseTemp: remiseValue,
          prixTotal: prixUnitaire * parseInt(quantite)
        }
      ]);
    }
    setSelectedArticle('');
    setQuantite(1);
    setRemisePanier('');
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

    const totalVente = calculerTotal();
    // Si le champ est vide, le client paie tout. Sinon, on prend la valeur saisie.
    const montantPayeFinal = montantPaye === '' || montantPaye === null ? totalVente : parseFloat(montantPaye);

    if (montantPayeFinal > totalVente) {
        setError("Le montant payé ne peut pas être supérieur au total de la vente.");
        return;
    }
    
    if (montantPayeFinal < 0) {
        setError("Le montant payé ne peut pas être négatif.");
        return;
    }

    // Vérifier si une remise a été appliquée dans le panier
    const hasRemise = panier.some(item => item.remiseTemp && item.remiseTemp > 0);
    
    // On ne peut créer une dette que si un client est sélectionné
    if (montantPayeFinal < totalVente && !selectedClientId) {
        setError("Veuillez sélectionner un client pour enregistrer une dette.");
        return;
    }

    // NOUVELLE VALIDATION: si une dette est créée, l'échéance est obligatoire
    if (montantPayeFinal < totalVente && !echeanceDette) {
        setError("Veuillez spécifier une date d'échéance pour la dette.");
        return;
    }

    const venteData = {
      panier: panier.map(item => ({
        article: item.article._id,
        quantite: item.quantite,
        remiseTemp: item.remiseTemp || 0, // Passer la remise temporaire
      })),
      clientId: selectedClientId || null, // Envoyer l'ID du client
      montantPaye: montantPayeFinal, // Envoyer le montant réellement payé
      echeanceDette: echeanceDette || null, // Envoyer la date d'échéance
      hasRemise: hasRemise // Indiquer si une remise a été appliquée
    };

    try {
      await venteAPI.create(venteData);

      if (hasRemise) {
        setSuccessMessage('Vente effectuée avec succès ! En attente de validation de l\'admin pour la remise.');
        // Pas de reçu pour les ventes en attente, l'admin le gérera
      } else {
        // Préparer les données pour le reçu pour les ventes normales
        const clientObj = clients.find(c => c._id === selectedClientId);
        const receiptData = {
            items: [...panier],
            total: totalVente,
            montantPaye: montantPayeFinal,
            client: clientObj ? clientObj.nom : 'Client de passage',
            date: new Date(),
            vendeur: localStorage.getItem('userName') || userRole,
            hasRemise: hasRemise
        };
        setLastSaleData(receiptData);
        setShowReceiptModal(true); // Ouvrir la modale de reçu
        setSuccessMessage('Vente effectuée avec succès !');
      }
      setPanier([]);
      setSelectedClientId(''); // Réinitialiser le client
      setMontantPaye(''); // Réinitialiser le montant payé
      setEcheanceDette(''); // Réinitialiser l'échéance
      fetchData();
      setTimeout(() => setSuccessMessage(''), 3000);
      // Refocus sur le champ scanner pour la prochaine vente
      if (hasRemise) {
        // Si pas de modale de reçu, on focus directement
        setTimeout(() => barcodeInputRef.current?.focus(), 100);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de la vente');
    }
  };

  const handlePrintReceipt = () => {
    if (!lastSaleData) return;
    
    const doc = new jsPDF();
    
    // En-tête
    doc.setFontSize(16);
    doc.text("REÇU DE VENTE", 105, 20, null, null, "center");
    doc.setFontSize(10);
    doc.text(`Date: ${lastSaleData.date.toLocaleString('fr-FR')}`, 14, 35);
    doc.text(`Vendeur: ${lastSaleData.vendeur}`, 14, 40);
    doc.text(`Client: ${lastSaleData.client}`, 14, 45);

    // Tableau des articles
    const tableColumn = ["Article", "Qté", "P.U.", "Total"];
    const tableRows = [];

    lastSaleData.items.forEach(item => {
      const row = [
        item.article.nom,
        item.quantite,
        (getEffectivePrice(item.article).toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' '),
        (item.prixTotal.toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' ')
      ];
      tableRows.push(row);
    });

    // Totaux
    tableRows.push(["", "", "TOTAL", (lastSaleData.total.toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' ')]);
    if (lastSaleData.montantPaye < lastSaleData.total) {
         tableRows.push(["", "", "Payé", (lastSaleData.montantPaye.toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' ')]);
         tableRows.push(["", "", "Reste à payer", ((lastSaleData.total - lastSaleData.montantPaye).toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' ')]);
    }

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 55,
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185] },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' } }
    });
    
    doc.text("Merci de votre confiance !", 105, doc.lastAutoTable.finalY + 10, null, null, "center");
    doc.save(`recu_${lastSaleData.date.getTime()}.pdf`);
    handleCloseReceiptModal();
  };

  const handleCloseReceiptModal = () => {
      setShowReceiptModal(false);
      // Refocus sur le champ scanner après la fermeture de la modale
      setTimeout(() => barcodeInputRef.current?.focus(), 100);
  };

  const handleCreateClient = async (e) => {
    e.preventDefault();
    setClientLoading(true);
    try {
        const res = await clientAPI.create(newClient);
        const createdClient = res.data;
        
        // Mettre à jour la liste et sélectionner le nouveau client
        setClients([...clients, createdClient]);
        setSelectedClientId(createdClient._id);
        
        setSuccessMessage(`Client ${createdClient.nom} créé avec succès !`);
        setShowClientModal(false);
        setNewClient({ nom: '', telephone: '', type: 'Client' }); // Reset form
        setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
        setError(err.response?.data?.message || "Erreur lors de la création du client.");
    } finally {
        setClientLoading(false);
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
            ? { ...item, quantite: item.quantite + 1, prixTotal: getEffectivePrice(article) * (item.quantite + 1) }
            : item
        );
      } else {
        return [
          ...prevPanier,
          {
            article,
            quantite: 1,
            prixTotal: getEffectivePrice(article) * 1
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
    
    const tableColumn = ["Date", "Article", "Quantité", "Prix Total", "Vendeur", "Client"];
    const tableRows = [];
    let totalGlobal = 0;

    historique.forEach(vente => {
      totalGlobal += vente.prixTotal;
      const venteData = [
        new Date(vente.createdAt).toLocaleDateString() + ' ' + new Date(vente.createdAt).toLocaleTimeString(),
        vente.article?.nom || 'Article supprimé',
        vente.quantite,
        (vente.prixTotal.toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' '),
        vente.gerant?.nom || 'Inconnu',
        vente.client?.nom || 'Passage'
      ];
      tableRows.push(venteData);
    });

    // Ajout de la ligne de Total Global
    tableRows.push([
      "", 
      "", 
      "TOTAL GLOBAL", 
      (totalGlobal.toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' '), 
      "",
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
                onChange={(e) => {
                    setCurrentPage(1);
                    setDateFilter({...dateFilter, start: e.target.value});
                }}
                className="rounded-pill shadow-sm"
                style={{ maxWidth: '160px' }}
                title="Date de début"
            />
            <Form.Control 
                type="date" 
                value={dateFilter.end}
                onChange={(e) => {
                    setCurrentPage(1);
                    setDateFilter({...dateFilter, end: e.target.value});
                }}
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
        <>
          {/* Section Ventes en Attente */}
          <Card className="border-0 shadow-sm rounded-4 mb-4">
            <Card.Header className="bg-warning-subtle">
              <div className="d-flex justify-content-between align-items-center">
                <h5 className="mb-0 fw-bold text-warning">
                  <iconify-icon icon="solar:clock-circle-bold" className="me-2"></iconify-icon>
                  Ventes en Attente de Validation
                </h5>
                <Button variant="outline-warning" size="sm" onClick={fetchData}>
                  <iconify-icon icon="solar:refresh-bold" className="me-1"></iconify-icon>
                  Actualiser
                </Button>
              </div>
            </Card.Header>
            <Card.Body>
              {pendingSales.length === 0 ? (
                <Alert variant="warning" className="text-center">
                  <iconify-icon icon="solar:box-minimalistic-bold" style={{fontSize: '48px'}} className="mb-2 opacity-50"></iconify-icon>
                  <p className="mb-0">Aucune vente en attente de validation pour le moment.</p>
                </Alert>
              ) : (
                <Table hover responsive className="align-middle mb-0">
                  <thead className="bg-light">
                    <tr>
                      <th className="ps-4 py-3 border-0 text-secondary small text-uppercase">Date</th>
                      <th className="py-3 border-0 text-secondary small text-uppercase">Article</th>
                      <th className="py-3 border-0 text-secondary small text-uppercase text-center">Qté</th>
                      <th className="py-3 border-0 text-secondary small text-uppercase text-end">Total</th>
                      <th className="py-3 border-0 text-secondary small text-uppercase">Vendeur</th>
                      <th className="py-3 border-0 text-secondary small text-uppercase">Client</th>
                      <th className="pe-4 py-3 border-0 text-secondary small text-uppercase text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingSales.map(vente => (
                      <tr key={vente._id} className="bg-warning-subtle">
                        <td className="ps-4">
                          <div className="fw-bold">{new Date(vente.createdAt).toLocaleDateString()}</div>
                          <div className="small text-muted">{new Date(vente.createdAt).toLocaleTimeString()}</div>
                        </td>
                        <td>
                          <div className="d-flex align-items-center">
                            {vente.article?.image ? (
                              <img src={vente.article?.image} alt="" className="rounded shadow-sm me-3" style={{width: '40px', height: '40px', objectFit: 'cover', cursor: 'pointer'}} onClick={() => handleImageClick(vente.article?.image)} />
                            ) : (
                              <div className="bg-light rounded d-flex align-items-center justify-content-center me-3" style={{width: '40px', height: '40px'}}><iconify-icon icon="solar:box-bold" className="text-muted"></iconify-icon></div>
                            )}
                            <div>
                              <div className="fw-bold">{vente.article?.nom || 'Article supprimé'}</div>
                              {vente.article?.code && <div className="small text-muted">{vente.article?.code}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="text-center"><Badge bg="warning" text="dark" className="border">{vente.quantite}</Badge></td>
                        <td className="text-end fw-bold text-warning">{vente.prixTotal.toLocaleString()} GNF</td>
                        <td>{vente.gerant?.nom || 'Inconnu'}</td>
                        <td>{vente.client?.nom || 'Passage'}</td>
                        <td className="pe-4 text-end">
                          <div className="d-flex gap-2 justify-content-end">
                            <Button 
                              variant="success" 
                              size="sm" 
                              className="rounded-pill px-3"
                              onClick={() => handleValidateRemise(vente._id)}
                            >
                              <iconify-icon icon="solar:check-circle-bold" className="me-1 align-middle"></iconify-icon>
                              Valider
                            </Button>
                            <Button 
                              variant="danger" 
                              size="sm" 
                              className="rounded-pill px-3"
                              onClick={() => handleRejectRemise(vente._id)}
                            >
                              <iconify-icon icon="solar:close-circle-bold" className="me-1 align-middle"></iconify-icon>
                              Refuser
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card.Body>
          </Card>

          {/* Section Historique Complet */}
          <Card className="border-0 shadow-sm rounded-4">
            <Card.Header>Historique complet des transactions</Card.Header>
            <Card.Body>
              <Table hover responsive className="align-middle mb-0">
                <thead className="bg-light">
                  <tr>
                    <th className="ps-4 py-3 border-0 text-secondary small text-uppercase">Date</th>
                    <th className="py-3 border-0 text-secondary small text-uppercase">Article</th>
                    <th className="py-3 border-0 text-secondary small text-uppercase text-center">Qté</th>
                    <th className="py-3 border-0 text-secondary small text-uppercase text-end">Total</th>
                    <th className="py-3 border-0 text-secondary small text-uppercase">Vendeur</th>
                    <th className="py-3 border-0 text-secondary small text-uppercase">Client</th>
                    <th className="pe-4 py-3 border-0 text-secondary small text-uppercase text-end">Statut / Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {historique.map(vente => (
                    <tr key={vente._id} className={
                      vente.statut === 'refusee' || vente.isCancelled ? "bg-light text-muted" :
                      vente.statut === 'en_attente_remise' ? "bg-warning-subtle" :
                      ""
                    }>
                      <td className="ps-4">
                        <div className="fw-bold">{new Date(vente.createdAt).toLocaleDateString()}</div>
                        <div className="small text-muted">{new Date(vente.createdAt).toLocaleTimeString()}</div>
                      </td>
                      <td>
                        <div className="d-flex align-items-center">
                          {vente.article?.image ? (
                            <img src={vente.article?.image} alt="" className="rounded shadow-sm me-3" style={{width: '40px', height: '40px', objectFit: 'cover', cursor: 'pointer', filter: vente.isCancelled ? 'grayscale(100%)' : 'none'}} onClick={() => handleImageClick(vente.article?.image)} />
                          ) : (
                            <div className="bg-light rounded d-flex align-items-center justify-content-center me-3" style={{width: '40px', height: '40px'}}><iconify-icon icon="solar:box-bold" className="text-muted"></iconify-icon></div>
                          )}
                          <div>
                            <div className={vente.isCancelled ? "text-decoration-line-through" : "fw-bold"}>{vente.article?.nom || 'Article supprimé'}</div>
                            {vente.article?.code && <div className="small text-muted">{vente.article?.code}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="text-center"><Badge bg="light" text="dark" className="border">{vente.quantite}</Badge></td>
                      <td className="text-end fw-bold text-primary">
                        {vente.isCancelled ? <span className="text-decoration-line-through text-muted">{vente.prixTotal.toLocaleString()} GNF</span> : `${vente.prixTotal.toLocaleString()} GNF`}
                      </td>
                      <td>{vente.gerant?.nom || 'Inconnu'}</td>
                      <td>{vente.client?.nom || 'Passage'}</td>
                      <td className="pe-4 text-end">
                        {(() => {
                          if (vente.statut === 'refusee') {
                            return (
                              <Badge bg="danger-subtle" text="danger" className="px-3 py-2 rounded-pill">
                                <iconify-icon icon="solar:close-circle-bold" className="me-1 align-middle"></iconify-icon>
                                REMISE REFUSÉE
                              </Badge>
                            );
                          }
                          if (vente.isCancelled) {
                            return (
                              <Badge bg="danger-subtle" text="danger" className="px-3 py-2 rounded-pill">
                                <iconify-icon icon="solar:close-circle-bold" className="me-1 align-middle"></iconify-icon>
                                VENTE ANNULÉE
                              </Badge>
                            );
                          }
                          if (vente.statut === 'en_attente_remise') {
                            return (
                              <Badge bg="warning-subtle" text="warning" className="px-3 py-2 rounded-pill">
                                <iconify-icon icon="solar:clock-circle-bold" className="me-1 align-middle"></iconify-icon>
                                EN ATTENTE
                              </Badge>
                            );
                          }
                          return (
                            <Button 
                              variant="outline-danger" 
                              size="sm" 
                              className="rounded-pill px-3"
                              onClick={() => { setSaleToCancel(vente); setShowCancelModal(true); }}
                              disabled={!isCancellationAllowed(vente)}
                              title={!isCancellationAllowed(vente) ? "Délai d'annulation dépassé (24h)" : "Annuler cette vente"}
                            >
                              <iconify-icon icon="solar:trash-bin-trash-bold" className="me-1 align-middle"></iconify-icon>
                              Annuler
                            </Button>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                  {historique.length === 0 && <tr><td colSpan="7" className="text-center py-5 text-muted"><iconify-icon icon="solar:bill-list-linear" style={{fontSize: '48px'}} className="mb-2 opacity-50"></iconify-icon><p className="mb-0">Aucune vente enregistrée</p></td></tr>}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </>
      ) : (
        <Tabs 
            defaultActiveKey={searchParams.get('tab') || initialTab} 
            id="gerant-ventes-tabs" 
            className="mb-3 nav-tabs-custom"
        >
            <Tab eventKey="sale" title={<span className="d-flex align-items-center"><iconify-icon icon="solar:cart-plus-bold" className="me-2"></iconify-icon>Effectuer une Vente</span>}>
                <Row>
                    <Col md={8}>
                    <Card className="mb-4 border-0 shadow-sm rounded-4">
                        <Card.Header className="bg-white py-3">
                            <div className="d-flex justify-content-between align-items-center">
                                <h5 className="mb-0 fw-bold">Panier de vente</h5>
                                <div className="d-flex gap-2">
                                    <Button variant="outline-primary" size="sm" onClick={() => setShowClientModal(true)} title="Nouveau Client">
                                        <iconify-icon icon="solar:user-plus-bold" className="me-1"></iconify-icon>
                                        Nouveau Client
                                    </Button>
                                    
                                </div>
                            </div>
                        </Card.Header>
                        <Card.Body>
                        {/* Sélection du Client */}
                        <Form.Group className="mb-4">
                            <Form.Label className="fw-bold">Client (Optionnel)</Form.Label>
                            <InputGroup>
                                <InputGroup.Text><iconify-icon icon="solar:user-circle-bold"></iconify-icon></InputGroup.Text>
                                <Form.Select 
                                    value={selectedClientId} 
                                    onChange={(e) => setSelectedClientId(e.target.value)}
                                    className="rounded-pill"
                                >
                                    <option value="">Client de passage (Anonyme)</option>
                                    {clients.map(client => (
                                        <option key={client._id} value={client._id}>{client.nom} {client.type === 'Ouvrier' ? '(Ouvrier)' : ''}</option>
                                    ))}
                                </Form.Select>
                            </InputGroup>
                        </Form.Group>

                        <Form onSubmit={handleBarcodeScan} className="mb-4">
                            <Form.Group>
                                <Form.Label className="fw-bold">Scanner un code-barres</Form.Label>
                                <InputGroup>
                                    <InputGroup.Text><iconify-icon icon="solar:barcode-scanner-bold-duotone"></iconify-icon></InputGroup.Text>
                                    <Form.Control
                                        ref={barcodeInputRef}
                                        type="text"
                                        name="barcode"
                                        id="barcode"
                                        placeholder="Scannez ou saisissez un code..."
                                        value={barcode}
                                        onChange={(e) => setBarcode(e.target.value)}
                                        autoFocus
                                        className="rounded-pill"
                                    />
                                    <Button type="submit" variant="primary" className="rounded-pill px-4">
                                        <iconify-icon icon="solar:add-circle-bold" className="me-2"></iconify-icon>
                                        Ajouter
                                    </Button>
                                </InputGroup>
                            </Form.Group>
                        </Form>
                        <div className="text-center text-muted my-3 small fw-bold">OU</div>
                        <Form className="mb-4" onSubmit={(e) => { e.preventDefault(); ajouterAuPanier(); }}>
                          <Row className="g-3">
                          <Col md={5}>
                            <Form.Group>
                            <Form.Label className="fw-bold">Article</Form.Label>
                            <Form.Select 
                              value={selectedArticle} 
                              onChange={(e) => setSelectedArticle(e.target.value)}
                              name="selectedArticle"
                              id="selectedArticle"
                              className="rounded-pill"
                            >
                              <option value="">Sélectionner un article</option>
                              {articles.map(article => (
                              <option key={article._id} value={article._id}>
                                {article.code ? `[${article.code}] ` : ''}{article.nom} - {getEffectivePrice(article).toLocaleString()} GNF 
                                {getEffectivePrice(article) < article.prixVente && (
                                  ` (Promo)`
                                )}
                                (Stock: {article.quantite})
                              </option>
                              ))}
                            </Form.Select>
                            </Form.Group>
                          </Col>
                          <Col md={2}>
                            <Form.Group>
                            <Form.Label className="fw-bold">Quantité</Form.Label>
                            <Form.Control
                              type="number"
                              min="1"
                              value={quantite}
                              onChange={(e) => setQuantite(e.target.value)}
                              name="quantite"
                              id="quantite"
                              className="rounded-pill"
                            />
                            </Form.Group>
                          </Col>
                          <Col md={2}>
                            <Form.Group>
                            <Form.Label className="fw-bold">Remise (%)</Form.Label>
                            <Form.Control
                              type="number"
                              min="0"
                              max="50"
                              value={remisePanier}
                              onChange={(e) => setRemisePanier(e.target.value)}
                              name="remisePanier"
                              id="remisePanier"
                              placeholder="0"
                              className="rounded-pill"
                            />
                            </Form.Group>
                          </Col>
                          <Col md={3} className="d-flex align-items-end">
                            <Button
                            variant="primary" 
                            onClick={ajouterAuPanier}
                            disabled={!selectedArticle}
                            className="w-100 rounded-pill py-2"
                            >
                            <iconify-icon icon="solar:cart-plus-bold" className="me-2"></iconify-icon>
                            Ajouter au panier
                            </Button>
                          </Col>
                          </Row>
                        </Form>

                        {panier.length > 0 ? (
                            <>
                            <Table hover responsive className="align-middle mb-0">
                                <thead className="bg-light">
                                    <tr>
                                        <th className="ps-4 py-3 border-0 text-secondary small text-uppercase">Article</th>
                                        <th className="py-3 border-0 text-secondary small text-uppercase">Prix unitaire</th>
                                        <th className="py-3 border-0 text-secondary small text-uppercase text-center">Quantité</th>
                                        <th className="py-3 border-0 text-secondary small text-uppercase text-end">Total</th>
                                        <th className="pe-4 py-3 border-0 text-secondary small text-uppercase text-end">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                {panier.map(item => (
                                  <tr key={item.article._id}>
                                    <td className="ps-4">
                                      <div className="d-flex align-items-center">
                                        {item.article.image ? (
                                          <img src={item.article.image} alt="" className="rounded shadow-sm me-3" style={{width: '40px', height: '40px', objectFit: 'cover', cursor: 'pointer'}} onClick={() => handleImageClick(item.article.image)} />
                                        ) : (
                                          <div className="bg-light rounded d-flex align-items-center justify-content-center me-3" style={{width: '40px', height: '40px'}}><iconify-icon icon="solar:box-bold" className="text-muted"></iconify-icon></div>
                                        )}
                                        <div>
                                          <div className="fw-bold">{item.article.nom}</div>
                                          {item.article.code && <div className="small text-muted">{item.article.code}</div>}
                                        </div>
                                      </div>
                                    </td>
                                    <td>
                                      {getEffectivePrice(item.article, item.remiseTemp) < item.article.prixVente ? (
                                        <>
                                          <span className="text-decoration-line-through text-muted me-2">{item.article.prixVente.toLocaleString()}</span>
                                          <span className="text-danger fw-bold">{getEffectivePrice(item.article, item.remiseTemp).toLocaleString()} GNF</span>
                                          {item.remiseTemp && <span className="badge bg-warning ms-2">Remise {item.remiseTemp}%</span>}
                                        </>
                                      ) : (
                                        `${item.article.prixVente.toLocaleString()} GNF`
                                      )}
                                    </td>
                                    <td className="text-center"><Badge bg="light" text="dark" className="border">{item.quantite}</Badge></td>
                                    <td className="text-end fw-bold text-primary">{item.prixTotal.toLocaleString()} GNF</td>
                                    <td className="pe-4 text-end">
                                      <Button 
                                      variant="outline-danger" 
                                      size="sm"
                                      onClick={() => retirerDuPanier(item.article._id)}
                                      >
                                      <iconify-icon icon="solar:trash-bin-trash-bold" className="me-1 align-middle"></iconify-icon>
                                      Retirer
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                                </tbody>
                            </Table>
                            {selectedClientId && (
                                <Row className="justify-content-end mt-3">
                                    <Col md={5}>
                                        <Form.Group className="mb-3">
                                            <Form.Label className="fw-bold">Montant Payé (Optionnel)</Form.Label>
                                            <InputGroup>
                                                <Form.Control
                                                    type="number"
                                                    placeholder={`Total : ${calculerTotal().toLocaleString()} GNF`}
                                                    value={montantPaye}
                                                    onChange={(e) => setMontantPaye(e.target.value)}
                                                    min="0"
                                                    className="rounded-pill"
                                                />
                                                <InputGroup.Text>GNF</InputGroup.Text>
                                            </InputGroup>
                                            <Form.Text className="text-muted">
                                                Si le montant est inférieur au total, la différence sera ajoutée à la dette du client.
                                            </Form.Text>
                                        </Form.Group>
                                    </Col>
                                    {/* Champ pour l'échéance, visible seulement si une dette est créée */}
                                    {montantPaye !== '' && parseFloat(montantPaye) < calculerTotal() && (
                                        <Col md={5}>
                                            <Form.Group className="mb-3">
                                                <Form.Label className="fw-bold text-danger">Échéance de la dette</Form.Label>
                                                <Form.Control
                                                    type="date"
                                                    value={echeanceDette}
                                                    onChange={(e) => setEcheanceDette(e.target.value)}
                                                    required
                                                    className="rounded-pill"
                                                />
                                            </Form.Group>
                                        </Col>
                                    )}
                                </Row>
                            )}
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
                        {historique.filter(v => !v.isCancelled).slice(0, 5).map(vente => ( // Affiche les 5 ventes valides les plus récentes
                            <div key={vente._id} className="d-flex gap-3 mb-3 pb-3 border-bottom">
                            {vente.article?.image && <img src={vente.article?.image} alt="" className="rounded" style={{width: '45px', height: '45px', objectFit: 'cover', cursor: 'pointer'}} onClick={() => handleImageClick(vente.article?.image)} />}
                            <div className="flex-grow-1">
                                <div className="d-flex justify-content-between">
                                    <span className="fw-bold">{vente.article?.nom || 'Article supprimé'}</span>
                                    <Badge bg="success" text="white">{vente.prixTotal.toLocaleString()} GNF</Badge>
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
                </Row>
            </Tab>
            <Tab 
                eventKey="pending" 
                title={
                    <span className="d-flex align-items-center">
                        <iconify-icon icon="solar:clock-circle-bold" className="me-2"></iconify-icon>
                        Ventes en Attente
                        {pendingSales.length > 0 && <Badge pill bg="warning" text="dark" className="ms-2">{pendingSales.length}</Badge>}
                    </span>
                }
            >
                <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
                    <Card.Header className="bg-white py-3">
                        <h5 className="mb-0 fw-bold">Ventes avec remise en attente de validation par l'administrateur</h5>
                    </Card.Header>
                    <Card.Body className="p-0">
                        {pendingSales.length > 0 ? (
                            <Table hover responsive className="align-middle mb-0">
                                <thead className="bg-light">
                                    <tr>
                                        <th className="ps-4 py-3 border-0 text-secondary small text-uppercase">Date</th>
                                        <th className="py-3 border-0 text-secondary small text-uppercase">Article</th>
                                        <th className="py-3 border-0 text-secondary small text-uppercase text-center">Qté</th>
                                        <th className="py-3 border-0 text-secondary small text-uppercase text-end">Total</th>
                                        <th className="py-3 border-0 text-secondary small text-uppercase">Client</th>
                                        <th className="pe-4 py-3 border-0 text-secondary small text-uppercase text-center">Statut</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pendingSales.map(vente => (
                                        <tr key={vente._id}>
                                            <td className="ps-4">
                                                <div className="fw-bold">{new Date(vente.createdAt).toLocaleDateString()}</div>
                                                <div className="small text-muted">{new Date(vente.createdAt).toLocaleTimeString()}</div>
                                            </td>
                                            <td>
                                                <div className="d-flex align-items-center">
                                                    {vente.article?.image ? (
                                                        <img src={vente.article?.image} alt="" className="rounded shadow-sm me-3" style={{width: '40px', height: '40px', objectFit: 'cover', cursor: 'pointer'}} onClick={() => handleImageClick(vente.article?.image)} />
                                                    ) : (
                                                        <div className="bg-light rounded d-flex align-items-center justify-content-center me-3" style={{width: '40px', height: '40px'}}><iconify-icon icon="solar:box-bold" className="text-muted"></iconify-icon></div>
                                                    )}
                                                    <div>
                                                        <div className="fw-bold">{vente.article?.nom || 'Article supprimé'}</div>
                                                        {vente.article?.code && <div className="small text-muted">{vente.article?.code}</div>}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="text-center"><Badge bg="light" text="dark" className="border">{vente.quantite}</Badge></td>
                                            <td className="text-end fw-bold text-primary">{vente.prixTotal.toLocaleString()} GNF</td>
                                            <td>{vente.client?.nom || 'Passage'}</td>
                                            <td className="pe-4 text-center">
                                                <Badge bg="warning-subtle" text="warning" className="px-3 py-2 rounded-pill">
                                                    <iconify-icon icon="solar:clock-circle-bold" className="me-1 align-middle"></iconify-icon>
                                                    En attente
                                                </Badge>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </Table>
                        ) : (
                            <Alert variant="success" className="m-4 text-center">
                                <iconify-icon icon="solar:check-circle-bold" style={{fontSize: '48px'}} className="mb-2 opacity-50"></iconify-icon>
                                <p className="mb-0">Vous n'avez aucune vente en attente de validation.</p>
                            </Alert>
                        )}
                    </Card.Body>
                </Card>
            </Tab>
            <Tab eventKey="history" title={<span className="d-flex align-items-center"><iconify-icon icon="solar:bill-list-bold" className="me-2"></iconify-icon>Historique Complet</span>}>
                <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
                    <Card.Header className="bg-white py-3 d-flex justify-content-between align-items-center">
                        <h5 className="mb-0 fw-bold">Historique des Transactions</h5>
                        <Form.Check 
                            type="switch"
                            id="cancelled-sales-switch"
                            label="Afficher uniquement les ventes annulées"
                            checked={showCancelledOnly}
                            onChange={(e) => {
                                setCurrentPage(1);
                                setShowCancelledOnly(e.target.checked);
                            }}
                        />
                    </Card.Header>
                    <Card.Body className="p-0">
                        <Table hover responsive className="align-middle mb-0">
                            <thead className="bg-light">
                                <tr>
                                    <th className="ps-4 py-3 border-0 text-secondary small text-uppercase">Date</th>
                                    <th className="py-3 border-0 text-secondary small text-uppercase">Article</th>
                                    <th className="py-3 border-0 text-secondary small text-uppercase text-center">Qté</th>
                                    <th className="py-3 border-0 text-secondary small text-uppercase text-end">Total</th>
                                    <th className="py-3 border-0 text-secondary small text-uppercase">Client</th>
                                    <th className="pe-4 py-3 border-0 text-secondary small text-uppercase text-end">Statut / Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {historique.map(vente => (
                                    <tr key={vente._id} className={
                                        vente.statut === 'refusee' || vente.isCancelled ? "bg-light text-muted" :
                                        vente.statut === 'en_attente_remise' ? "bg-warning-subtle" :
                                        ""
                                    }>
                                        <td className="ps-4">
                                            <div className="fw-bold">{new Date(vente.createdAt).toLocaleDateString()}</div>
                                            <div className="small text-muted">{new Date(vente.createdAt).toLocaleTimeString()}</div>
                                        </td>
                                        <td>
                                            <div className="d-flex align-items-center">
                                                {vente.article?.image ? (
                                                    <img src={vente.article?.image} alt="" className="rounded shadow-sm me-3" style={{width: '40px', height: '40px', objectFit: 'cover', cursor: 'pointer', filter: vente.isCancelled ? 'grayscale(100%)' : 'none'}} onClick={() => handleImageClick(vente.article?.image)} />
                                                ) : (
                                                    <div className="bg-light rounded d-flex align-items-center justify-content-center me-3" style={{width: '40px', height: '40px'}}><iconify-icon icon="solar:box-bold" className="text-muted"></iconify-icon></div>
                                                )}
                                                <div>
                                                    <div className={vente.isCancelled ? "text-decoration-line-through" : "fw-bold"}>{vente.article?.nom || 'Article supprimé'}</div>
                                                    {vente.article?.code && <div className="small text-muted">{vente.article?.code}</div>}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="text-center"><Badge bg="light" text="dark" className="border">{vente.quantite}</Badge></td>
                                        <td className="text-end fw-bold text-primary">
                                            {vente.isCancelled ? <span className="text-decoration-line-through text-muted">{vente.prixTotal.toLocaleString()} GNF</span> : `${vente.prixTotal.toLocaleString()} GNF`}
                                        </td>
                                        <td>{vente.client ? <div className="d-flex align-items-center gap-1"><iconify-icon icon="solar:user-circle-bold" className="text-muted"></iconify-icon> {vente.client.nom}</div> : <span className="text-muted small">Passage</span>}</td>
                                        <td className="pe-4 text-end">
                                            {(() => {
                                                if (vente.statut === 'refusee') {
                                                    return (
                                                        <Badge bg="danger-subtle" text="danger" className="px-3 py-2 rounded-pill">
                                                            <iconify-icon icon="solar:close-circle-bold" className="me-1 align-middle"></iconify-icon>
                                                            REMISE REFUSÉE
                                                        </Badge>
                                                    );
                                                }
                                                if (vente.isCancelled) {
                                                    return (
                                                        <Badge bg="danger-subtle" text="danger" className="px-3 py-2 rounded-pill">
                                                            <iconify-icon icon="solar:close-circle-bold" className="me-1 align-middle"></iconify-icon>
                                                            VENTE ANNULÉE
                                                        </Badge>
                                                    );
                                                }
                                                if (vente.statut === 'en_attente_remise') {
                                                    return (
                                                        <Badge bg="warning-subtle" text="warning" className="px-3 py-2 rounded-pill">
                                                            <iconify-icon icon="solar:clock-circle-bold" className="me-1 align-middle"></iconify-icon>
                                                            EN ATTENTE
                                                        </Badge>
                                                    );
                                                }
                                                return (
                                                    <Button 
                                                        variant="outline-danger" 
                                                        size="sm" 
                                                        className="rounded-pill px-3"
                                                        onClick={() => { setSaleToCancel(vente); setShowCancelModal(true); }}
                                                        disabled={!isCancellationAllowed(vente)}
                                                        title={!isCancellationAllowed(vente) ? "Délai d'annulation dépassé (24h)" : "Annuler cette vente"}
                                                    >
                                                        <iconify-icon icon="solar:trash-bin-trash-bold" className="me-1 align-middle"></iconify-icon>
                                                        Annuler
                                                    </Button>
                                                );
                                            })()}
                                        </td>
                                    </tr>
                                ))}
                               
                            </tbody>
                        </Table>
                    </Card.Body>
                </Card>
                    
            </Tab>
        </Tabs>
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

      {/* Modale Impression Reçu (Après Vente) */}
      <Modal show={showReceiptModal} onHide={handleCloseReceiptModal} centered backdrop="static" keyboard={false}>
        <Modal.Header>
            <Modal.Title className="text-success">
                <iconify-icon icon="solar:check-circle-bold" className="me-2 align-middle"></iconify-icon>
                Vente Validée !
            </Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center">
            <p className="mb-4 fs-5">La vente a été enregistrée avec succès.</p>
            <h6 className="mb-3 text-muted">Voulez-vous imprimer le reçu pour le client ?</h6>
            <div className="d-flex justify-content-center gap-3 mt-4">
                <Button variant="secondary" size="lg" onClick={handleCloseReceiptModal} className="px-4">
                    Ignorer
                </Button>
                <Button variant="primary" size="lg" onClick={handlePrintReceipt} className="px-4">
                    <iconify-icon icon="solar:printer-bold" className="me-2 align-middle"></iconify-icon>
                    Imprimer
                </Button>
            </div>
        </Modal.Body>
      </Modal>

      {/* Modale Création Rapide Client */}
      <Modal show={showClientModal} onHide={() => setShowClientModal(false)} centered>
        <Modal.Header closeButton>
            <Modal.Title>Nouveau Client</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleCreateClient}>
            <Modal.Body>
                <Form.Group className="mb-3">
                    <Form.Label>Nom complet</Form.Label>
                    <Form.Control 
                        type="text" 
                        required 
                        value={newClient.nom} 
                        onChange={(e) => setNewClient({...newClient, nom: e.target.value})} 
                        placeholder="Ex: Mamadou Bah"
                        autoFocus
                    />
                </Form.Group>
                <Form.Group className="mb-3">
                    <Form.Label>Téléphone</Form.Label>
                    <Form.Control 
                        type="text" 
                        value={newClient.telephone} 
                        onChange={(e) => setNewClient({...newClient, telephone: e.target.value})} 
                        placeholder="Ex: 620..."
                    />
                </Form.Group>
                <Form.Group className="mb-3">
                    <Form.Label>Type</Form.Label>
                    <Form.Select 
                        value={newClient.type} 
                        onChange={(e) => setNewClient({...newClient, type: e.target.value})}
                    >
                        <option value="Client">Client Standard</option>
                        <option value="Ouvrier">Ouvrier / Apporteur</option>
                    </Form.Select>
                </Form.Group>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={() => setShowClientModal(false)}>Annuler</Button>
                <Button variant="primary" type="submit" disabled={clientLoading}>
                    {clientLoading ? <Spinner size="sm" /> : 'Créer'}
                </Button>
            </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
}

export default VentesView;