// src/components/VentesView.js
/**
 * @file VentesView.js
 * @description Ce composant est le "cerveau" de la page des ventes. Il agit comme un conteneur "intelligent" :
 * - Il gère l'état global de la page (panier, historique, articles, clients).
 * - Il contient toute la logique métier (ajout au panier, validation de vente, annulation, etc.).
 * - Il récupère les données depuis l'API.
 * - Il orchestre l'affichage des sous-composants (SaleTab, HistoryTab, AdminHistoryTab) et des modales, en leur passant les données et les fonctions nécessaires via les props.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Form, Alert, Spinner, Tabs, Tab } from 'react-bootstrap';
import { useSearchParams } from 'react-router-dom';
import { articleAPI, venteAPI, clientAPI } from '../services/api';
import { Html5QrcodeScanner } from "html5-qrcode";
import ClientModal from './common/ClientModal'; // Importer le composant réutilisable
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logo from '../assets/logo.png';
import SaleTab from './SaleTab';
import HistoryTab from './HistoryTab';
import AdminHistoryTab from './AdminHistoryTab';
import CancelSaleModal from './CancelSaleModal';
import ReceiptModal from './ReceiptModal';
import ImagePreviewModal from './ImagePreviewModal';
import ScannerModal from './ScannerModal';

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

  const [isSubmitting, setIsSubmitting] = useState(false); // Pour le feedback sur le bouton de vente
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [saleToCancel, setSaleToCancel] = useState(null);

  // États pour la modale d'impression du ticket
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [currentReceiptData, setCurrentReceiptData] = useState(null);

  // États pour la création rapide de client
  const [showClientModal, setShowClientModal] = useState(false);

  // Référence pour le champ de scan (pour garder le focus)
  const barcodeInputRef = useRef(null);

  // États pour la modale d'aperçu d'image
  const [showImageModal, setShowImageModal] = useState(false);
  const [previewImage, setPreviewImage] = useState('');

  // État pour le scanner caméra
  const [showScanner, setShowScanner] = useState(false);

  // État pour le filtre des ventes annulées
  const [showCancelledOnly, setShowCancelledOnly] = useState(false);
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
      ];

      // Charger les clients uniquement si l'utilisateur n'est pas un admin,
      // car seul le gérant a besoin de la liste pour créer une nouvelle vente.
      if (userRole !== 'Admin') {
        promises.push(clientAPI.getAll());
      }

      const results = await Promise.all(promises);
      const articlesRes = results[0];
      const historiqueRes = results[1];
      const clientsRes = userRole !== 'Admin' ? results[2] : { data: [] };

      setArticles((articlesRes.data.data || []).filter(a => a.quantite > 0));
      setHistorique(historiqueRes.data.ventes || []);
      setTotalPages(historiqueRes.data.totalPages || 0);
      setClients(clientsRes.data || []);
    } catch (err) {
      setError(err.response?.data?.message || "Erreur lors du chargement des données de vente.");
    } finally {
      setLoading(false);
    }
  }, [dateFilter, currentPage, showCancelledOnly, userRole]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
    // 2. Remise temporaire (panier) - maintenant en GNF
    if (remiseTemp !== null && !isNaN(remiseTemp) && remiseTemp > 0) {
      return Math.max(0, price - remiseTemp);
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
    
    // Sécurité : Forcer un entier pour éviter les décimales non gérées
    if (!Number.isInteger(parseFloat(quantite))) {
        setError("La quantité doit être un nombre entier.");
        return;
    }

    if (remisePanier !== '' && (isNaN(parseFloat(remisePanier)) || parseFloat(remisePanier) < 0)) {
      setError("La remise doit être un montant positif (supérieur ou égal à 0 GNF)");
      return;
    }
    setError('');

    const article = articles.find(a => a._id === selectedArticle);
    if (!article) return;

    const remiseValue = remisePanier !== '' ? parseFloat(remisePanier) : null;

    if (remiseValue && remiseValue > article.prixVente) {
        setError(`La remise (${remiseValue.toLocaleString()} GNF) ne peut pas être supérieure au prix de l'article (${article.prixVente.toLocaleString()} GNF).`);
        return;
    }

    const prixUnitaire = getEffectivePrice(article, remiseValue);

    const existeDeja = panier.find(item => item.article._id === selectedArticle);
    
    if (existeDeja) {
      setPanier(panier.map(item => 
        item.article._id === selectedArticle
          ? { 
              ...item, 
              quantite: item.quantite + parseInt(quantite),
              remiseTemp: remiseValue,
          prixUnitaire: prixUnitaire,
          prixTotal: prixUnitaire * (item.quantite + parseInt(quantite))
            }
          : item
      ));
    } else {
      setPanier([
        ...panier,
        {
          article,
          quantite: parseInt(quantite),
          remiseTemp: remiseValue, // en GNF
          prixUnitaire: prixUnitaire,
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

    setIsSubmitting(true);
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

      const subTotal = panier.reduce((acc, item) => acc + (item.article.prixVente * item.quantite), 0);
      const totalRemise = subTotal - totalVente;

      // 4. Dynamisme : Récupération des informations de la boutique depuis le panier.
      const boutiqueInfo = panier.length > 0 ? panier[0].article.boutique : null;
      const clientObj = clients.find(c => c._id === selectedClientId);
      const receiptData = {
          shopName: boutiqueInfo?.nom,
          address: boutiqueInfo?.adresse,
          phone: boutiqueInfo?.telephone, // Ce champ pourrait ne pas exister sur le modèle
          transactionId: `VTE-${Date.now()}`,
          cashierName: localStorage.getItem('userName') || userRole,
          clientName: clientObj ? clientObj.nom : 'Client de passage',
          date: new Date(),
          items: panier,
          subTotal: subTotal,
          discount: totalRemise,
          totalNet: totalVente,
          amountPaid: montantPayeFinal,
          change: montantPayeFinal - totalVente,
          echeanceDette: echeanceDette, // Ajout de l'échéance pour le ticket
      };
      // Stocker les données et afficher la modale de choix au lieu d'imprimer directement
      setCurrentReceiptData(receiptData);
      setShowReceiptModal(true);
      
        setSuccessMessage('Vente effectuée avec succès !');

      setPanier([]);
      setSelectedClientId(''); // Réinitialiser le client
      setMontantPaye(''); // Réinitialiser le montant payé
      setEcheanceDette(''); // Réinitialiser l'échéance
      fetchData();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de la vente');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClientCreationSuccess = (createdClient, isEdit) => {
    if (isEdit) return; // Ne devrait pas arriver depuis cette vue

    // Mettre à jour la liste et sélectionner le nouveau client
    setClients(prevClients => [...prevClients, createdClient]);
    setSelectedClientId(createdClient._id);
    
    setSuccessMessage(`Client ${createdClient.nom} créé avec succès !`);
    setShowClientModal(false);
    
    setTimeout(() => setSuccessMessage(''), 3000);
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

  // Génération du ticket de caisse (Format ticket thermique)
  const generateReceiptPDF = (ticketData) => {
    if (!ticketData) return;

    // Helper pour nettoyer le formatage des nombres pour le PDF
    const formatPrice = (price) => {
        return (price || 0).toLocaleString('fr-FR').replace(/[\u00a0\u202f]/g, ' ');
    };

    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [80, 150 + (ticketData.items.length * 8)] // Hauteur dynamique
    });

    const {
        shopName = 'BOUTIQUE',
        address = '',
        phone = '',
        transactionId = 'N/A',
        date = new Date(),
        clientName = 'Client de passage',
        cashierName = 'N/A',
        items = [],
        subTotal = 0,
        discount = 0,
        totalNet = 0,
        amountPaid = 0,
        echeanceDette = null, // Récupération de l'échéance
    } = ticketData;

    // --- En-tête ---
    try {
        doc.addImage(logo, 'PNG', 25, 5, 30, 10);
    } catch (e) {
        doc.setFontSize(14);
        doc.text(shopName || 'BOUTIQUE', 40, 10, { align: 'center' });
    }
    
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(address || '', 40, 20, { align: 'center' });
    if (phone) doc.text(`Tel: ${phone}`, 40, 24, { align: 'center' });
    doc.text("------------------------------------------------", 40, 30, { align: 'center' });

    // --- Infos Transaction ---
    doc.text(`Ticket: ${transactionId}`, 5, 35);
    doc.text(`Date: ${new Date(date).toLocaleString('fr-FR')}`, 5, 39);
    doc.text(`Client: ${clientName}`, 5, 43);
    doc.text(`Caissier: ${cashierName}`, 5, 47);
    
    // --- Tableau Articles ---
    const tableRows = items.map(item => [
        item.article.nom.substring(0, 20),
        item.quantite,
        formatPrice(item.prixUnitaire),
        formatPrice(item.prixTotal)
    ]);

    autoTable(doc, {
        head: [["Article", "Qté", "P.U.", "Total"]],
        body: tableRows,
        startY: 50,
        theme: 'plain',
        styles: { fontSize: 7, cellPadding: 1 },
        headStyles: { fontStyle: 'bold', halign: 'center' },
        columnStyles: {
            0: { cellWidth: 25 },
            1: { halign: 'center' },
            2: { halign: 'right' },
            3: { halign: 'right' }
        },
        margin: { left: 2, right: 2 }
    });

    let finalY = doc.lastAutoTable.finalY + 5;

    // --- Totaux ---
    doc.setFontSize(8);
    doc.text('Sous-total:', 5, finalY);
    doc.text(`${formatPrice(subTotal)} GNF`, 75, finalY, { align: 'right' });
    finalY += 4;

    if (discount > 0) {
        doc.text('Remise:', 5, finalY);
        doc.text(`- ${formatPrice(discount)} GNF`, 75, finalY, { align: 'right' });
        finalY += 4;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text('TOTAL NET:', 5, finalY);
    doc.text(`${formatPrice(totalNet)} GNF`, 75, finalY, { align: 'right' });
    finalY += 5;
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text('Montant versé:', 5, finalY);
    doc.text(`${formatPrice(amountPaid)} GNF`, 75, finalY, { align: 'right' });
    finalY += 5;

    const balance = amountPaid - totalNet;

    if (balance >= 0) {
        // Cas normal : Monnaie à rendre
        doc.text('Monnaie rendue:', 5, finalY);
        doc.text(`${formatPrice(balance)} GNF`, 75, finalY, { align: 'right' });
    } else {
        // Cas dette : Reste à payer
        doc.setFont("helvetica", "bold");
        doc.text('RESTE A PAYER:', 5, finalY);
        doc.text(`${formatPrice(Math.abs(balance))} GNF`, 75, finalY, { align: 'right' });
        
        if (echeanceDette) {
            finalY += 5;
            doc.setFontSize(7);
            doc.setFont("helvetica", "italic");
            doc.text(`Echeance le : ${new Date(echeanceDette).toLocaleDateString('fr-FR')}`, 40, finalY, { align: 'center' });
        }
    }

    // --- Pied de page ---
    doc.text("------------------------------------------------", 40, finalY + 10, { align: 'center' });
    doc.setFont("helvetica", "bold");
    doc.text("Merci de votre visite !", 40, finalY + 15, { align: 'center' });

    doc.save(`ticket_${transactionId}.pdf`);
  };

  // Génération de l'historique (Format A4)
  const generateHistoryPDF = (sales, logoImg) => {
    const doc = new jsPDF();
    try { doc.addImage(logoImg, 'PNG', 14, 8, 40, 15); } catch (e) {}

    doc.setFontSize(18);
    doc.setTextColor(41, 128, 185);
    doc.text("Historique des Ventes", 60, 16);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Généré le : ${new Date().toLocaleString('fr-FR')}`, 60, 22);

    const tableRows = sales.map(v => [
        new Date(v.createdAt).toLocaleString('fr-FR'),
        v.article?.nom || 'N/A',
        v.quantite,
        (v.prixTotal || 0).toLocaleString('fr-FR').replace(/[\u00a0\u202f]/g, ' ') + ' GNF',
        v.gerant?.nom || 'N/A',
        v.isCancelled ? 'Annulée' : 'OK'
    ]);

    autoTable(doc, {
        head: [["Date", "Article", "Qté", "Total", "Vendeur", "Statut"]],
        body: tableRows,
        startY: 30,
        theme: 'grid',
        headStyles: { fillColor: [41, 128, 185] },
        styles: { fontSize: 8 }
    });

    doc.save(`historique_ventes_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  const handlePrintReceipt = () => {
    if (currentReceiptData) {
      generateReceiptPDF(currentReceiptData);
    }
    handleCloseReceiptModal();
  };

  const handleGenerateTicket = async (venteId, setError) => {
    try {
      const res = await venteAPI.genererTicket(venteId);
      const downloadUrl = res.data.downloadUrl;
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `ticket_${venteId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      setError(err.response?.data?.message || "Erreur lors de la génération du ticket.");
    }
  };
  const handleCloseReceiptModal = () => {
    setShowReceiptModal(false);
    setTimeout(() => barcodeInputRef.current?.focus(), 100);
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
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
        <h3 className="fw-bold mb-0 text-body">{userRole === 'Admin' ? 'Historique des Ventes' : 'Gestion des Ventes'}</h3>
        <div className="d-flex gap-2 align-items-center">
            <Form.Control 
                type="date"
                value={dateFilter.start}
                onChange={(e) => {
                    setCurrentPage(1);
                    setDateFilter({...dateFilter, start: e.target.value});
                }}
                className="rounded-pill shadow-sm w-auto"
                title="Date de début"
            />
            <span className="text-muted d-none d-md-inline">-</span>
            <Form.Control 
                type="date" 
                value={dateFilter.end}
                onChange={(e) => {
                    setCurrentPage(1);
                    setDateFilter({...dateFilter, end: e.target.value});
                }}
                className="rounded-pill shadow-sm w-auto"
                title="Date de fin"
            />
            <Button variant="outline-secondary" onClick={() => generateHistoryPDF(historique, logo)} className="rounded-pill px-4 shadow-sm">
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
          <AdminHistoryTab
            historique={historique}
            totalPages={totalPages}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            isCancellationAllowed={isCancellationAllowed}
            handleImageClick={handleImageClick}
            setSaleToCancel={setSaleToCancel}
            setShowCancelModal={setShowCancelModal}
            handleGenerateTicket={handleGenerateTicket}
            setError={setError}
          />
        </>
      ) : (
        <Tabs 
            defaultActiveKey={searchParams.get('tab') || initialTab} 
            id="gerant-ventes-tabs" 
            className="mb-3 nav-tabs-custom"
        >
            <Tab eventKey="sale" title={<span className="d-flex align-items-center"><iconify-icon icon="solar:cart-plus-bold" className="me-2"></iconify-icon>Effectuer une Vente</span>}>
                <SaleTab
                    panier={panier}
                    clients={clients}
                    articles={articles}
                    selectedClientId={selectedClientId}
                    setSelectedClientId={setSelectedClientId}
                    setShowClientModal={setShowClientModal}
                    barcodeInputRef={barcodeInputRef}
                    barcode={barcode}
                    setBarcode={setBarcode}
                    handleBarcodeScan={handleBarcodeScan}
                    selectedArticle={selectedArticle}
                    setSelectedArticle={setSelectedArticle}
                    quantite={quantite}
                    setQuantite={setQuantite}
                    remisePanier={remisePanier}
                    setRemisePanier={setRemisePanier}
                    ajouterAuPanier={ajouterAuPanier}
                    getEffectivePrice={getEffectivePrice}
                    handleImageClick={handleImageClick}
                    retirerDuPanier={retirerDuPanier}
                    montantPaye={montantPaye}
                    setMontantPaye={setMontantPaye}
                    echeanceDette={echeanceDette}
                    setEcheanceDette={setEcheanceDette}
                    calculerTotal={calculerTotal}
                    effectuerVente={effectuerVente}
                    historique={historique}
                    isSubmitting={isSubmitting}
                />
            </Tab>
            <Tab eventKey="history" title={<span className="d-flex align-items-center"><iconify-icon icon="solar:bill-list-bold" className="me-2"></iconify-icon>Historique Complet</span>}>
                <HistoryTab
                    historique={historique}
                    showCancelledOnly={showCancelledOnly}
                    setShowCancelledOnly={setShowCancelledOnly}
                    setCurrentPage={setCurrentPage}
                    isCancellationAllowed={isCancellationAllowed}
                    handleImageClick={handleImageClick}
                    setSaleToCancel={setSaleToCancel}
                    setShowCancelModal={setShowCancelModal}
                />
            </Tab>
        </Tabs>
      )}

      {/* Modale de confirmation d'annulation */}
      <CancelSaleModal
        show={showCancelModal}
        onHide={() => setShowCancelModal(false)}
        onConfirm={confirmCancel}
      />

      {/* Modale d'aperçu d'image */}
      <ImagePreviewModal
        show={showImageModal}
        onHide={() => setShowImageModal(false)}
        image={previewImage}
      />

      {/* Modale Scanner Caméra */}
      <ScannerModal
        show={showScanner}
        onHide={() => setShowScanner(false)}
        error={error}
      />

      {/* Modale Impression Ticket (Imprimer ou Ignorer) */}
      <ReceiptModal
        show={showReceiptModal}
        onHide={handleCloseReceiptModal}
        onPrint={handlePrintReceipt}
      />

      {/* Modale Création Rapide Client */}
      <ClientModal
        show={showClientModal}
        onHide={() => setShowClientModal(false)}
        clientToEdit={null} // Toujours en mode création
        onSuccess={handleClientCreationSuccess}
      />
    </div>
  );
}

export default VentesView;