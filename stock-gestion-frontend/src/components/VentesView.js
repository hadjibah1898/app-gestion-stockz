// src/components/VentesView.js
/**
 * @file VentesView.js
 * @description Ce composant est le "cerveau" de la page des ventes. Il agit comme un conteneur "intelligent" :
 * - Il gère l'état global de la page (panier, historique, articles, clients).
 * - Il contient toute la logique métier (ajout au panier, validation de vente, annulation, etc.).
 * - Il récupère les données depuis l'API.
 * - Il orchestre l'affichage des sous-composants (SaleTab, HistoryTab, AdminHistoryTab) et des modales, en leur passant les données et les fonctions nécessaires via les props.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Alert, Spinner, Modal, Button, Badge, Form, Row, Col } from 'react-bootstrap';
import { useSearchParams } from 'react-router-dom';
import { articleAPI, venteAPI, clientAPI } from '../services/api'; // Importez les API nécessaires
import { Html5QrcodeScanner } from "html5-qrcode"; // Pour le scanner de code-barres
import { generateReceiptPDF } from '../utils/pdfUtils'; // Importez la fonction de génération de PDF
import ClientModal from './common/ClientModal'; // Importer le composant réutilisable
import SaleTab from './SaleTab';
import HistoryTab from './HistoryTab';
import AdminHistoryTab from './AdminHistoryTab';
import CancelSaleModal from './CancelSaleModal';
import ReceiptModal from './ReceiptModal';
import ImagePreviewModal from './ImagePreviewModal';
import ScannerModal from './ScannerModal';
import { playSuccessSound, playBeep } from '../utils/audioUtils';
import { useVenteLogic } from '../hooks/useVenteLogic'; // Import du hook personnalisé
import { saveVenteOffline, syncVentes, getOfflineVentesCount } from '../utils/offlineSync';

const VentesView = ({ userRole, initialTab = 'sale' }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [articles, setArticles] = useState([]);
  const [historique, setHistorique] = useState([]);
  const [clients, setClients] = useState([]); // Liste des clients
  const [panier, setPanier] = useState([]);
  const [itemRemiseInput, setItemRemiseInput] = useState('');
  const [itemRemiseType, setItemRemiseType] = useState('montant'); // Nouvel état pour le type de remise (montant ou pourcentage)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [selectedArticle, setSelectedArticle] = useState('');
  const [quantite, setQuantite] = useState(1);
  const [barcode, setBarcode] = useState('');
  const [numeroTable, setNumeroTable] = useState('');
  const [selectedClientId, setSelectedClientId] = useState(''); // Client sélectionné
  const [montantPaye, setMontantPaye] = useState(''); // Montant payé par le client
  const [modePaiement, setModePaiement] = useState('Cash'); // Mode de paiement (Cash, Orange Money, Dette, etc.)
  const [transactionRef, setTransactionRef] = useState(''); // Référence transactionnelle pour paiements électroniques
  const [echeanceDette, setEcheanceDette] = useState(''); // Échéance pour la dette
  const [brouillons, setBrouillons] = useState([]); // État pour les ventes en brouillon
  const [showMobilePanier, setShowMobilePanier] = useState(false); // État pour le panier mobile
  const [offlineCount, setOfflineCount] = useState(0); // État pour le badge hors-ligne
  
  // États pour l'export CSV mensuel
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportDate, setExportDate] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear() });

  const [isSubmitting, setIsSubmitting] = useState(false); // Pour le feedback sur le bouton de vente
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false); // Nouveau : pour les mises à jour sans Spinner global
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
  const [boutiqueConfig, setBoutiqueConfig] = useState(null); // Stocker le taux et l'état des pourboires
  const itemsPerPage = 15;

  // Utilisation du hook personnalisé pour la logique de vente
  const { getEffectivePrice } = useVenteLogic();

  // Calcul du total des pourboires pour le serveur (Session en cours)
  const totalPourboires = useMemo(() => {
    return historique.filter(v => !v.isCancelled).reduce((sum, v) => sum + (v.pourboire || 0), 0);
  }, [historique]);

  // Liste dynamique des catégories disponibles pour les filtres de vente
  const availableCategories = useMemo(() => {
    const existingArticleCategories = articles
      .map(a => a.categorie || 'Divers')
      .filter(Boolean); // Filtrer les catégories vides ou nulles
    const uniqueCategories = [...new Set(existingArticleCategories)];
    // Convertir au format { key, label } attendu par SaleTab
    return uniqueCategories.map(cat => ({ key: cat, label: cat }));
  }, [articles]);

  const activeTab = searchParams.get('tab') || initialTab;

  const fetchData = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      
      // Paramètres de filtrage : Si c'est un gérant, on filtre par son ID
      const params = { 
        page: currentPage, 
        limit: itemsPerPage, 
        showCancelledOnly: showCancelledOnly,
        // Le serveur voit ses ventes, le gérant voit toute la boutique
        gerantId: userRole === 'Serveur' ? localStorage.getItem('userId') : undefined,
        // Logique de filtrage intelligente par statut
        statut: searchParams.get('filter') === 'pending' ? (showCancelledOnly ? 'annulee' : 'commande') : undefined,
        excludeStatut: searchParams.get('filter') === 'finalized' ? 'commande' : undefined
      };

      // Paramètre pour ne charger que les articles de sa propre boutique (pour Gérant et Serveur)
      const articlesParams = ['Gérant', 'Serveur'].includes(userRole) ? { boutique: localStorage.getItem('boutiqueId') } : {};

      const promises = [
        articleAPI.getAll(articlesParams),
        venteAPI.getHistorique(params),
      ];

      // Charger les clients uniquement si l'utilisateur n'est pas un admin,
      // car seul le gérant a besoin de la liste pour créer une nouvelle vente.
      if (userRole !== 'Admin') {
        const boutiqueId = localStorage.getItem('boutiqueId');
        promises.push(clientAPI.getAll({ boutiqueId }));
      }

      const results = await Promise.all(promises);
      const articlesRes = results[0];
      const historiqueRes = results[1];
      const clientsRes = userRole !== 'Admin' ? results[2] : { data: [] };

      const allArticles = articlesRes.data.data || [];
      
      // Récupérer la config de la boutique depuis le premier article (tous sont de la même boutique pour Gérant/Serveur)
      if (allArticles.length > 0 && ['Gérant', 'Serveur'].includes(userRole)) {
        setBoutiqueConfig(allArticles[0].boutique);
      }

      setArticles(allArticles.filter(a => a.quantite > 0));
      
      // LOGIQUE DE REGROUPEMENT INTELLIGENTE
      const rawVentes = historiqueRes.data.ventes || [];
      const groupedVentes = {};
      const isPendingView = searchParams.get('filter') === 'pending';

      rawVentes.forEach(vente => {
        // SI EN ATTENTE : On regroupe par NUMÉRO DE TABLE
        // SINON (Historique) : On regroupe par TRANSACTION (orderGroupId)
        const groupId = isPendingView ? (vente.numeroTable || `EMPORTER_${vente._id}`) : (vente.orderGroupId || vente._id);

        if (!groupedVentes[groupId]) {
          groupedVentes[groupId] = {
            orderGroupId: groupId,
            numeroTable: vente.numeroTable,
            client: vente.client,
            gerant: vente.gerant,
            boutique: vente.boutique,
            createdAt: vente.createdAt ? new Date(vente.createdAt) : new Date(),
            items: [],
            totalGroupPrice: 0,
            hasPending: false,
            allCancelled: true
          };
        }
        groupedVentes[groupId].items.push(vente);
        
        // Calcul intelligent des propriétés du groupe
        if (!vente.isCancelled) {
          groupedVentes[groupId].totalGroupPrice += (vente.prixTotal || 0);
          groupedVentes[groupId].allCancelled = false;
          if (vente.statut === 'commande') {
            groupedVentes[groupId].hasPending = true;
          }
        }
      });

      const finalGroups = Object.values(groupedVentes).map(group => ({
        ...group,
        isCancelled: group.allCancelled,
        statut: group.hasPending ? 'commande' : (group.allCancelled ? 'annulee' : 'finalisee')
      }));

      // Tri : Les commandes les plus anciennes en premier pour la préparation (Premier arrivé, premier servi)
      const sorted = isPendingView 
        ? finalGroups.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        : finalGroups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      setHistorique(sorted);
      setTotalPages(historiqueRes.data.totalPages || 0);
      setClients(clientsRes.data || []);
    } catch (err) {
      setError(err.response?.data?.message || "Erreur de connexion au serveur.");
      setShowErrorModal(true);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [currentPage, showCancelledOnly, userRole, searchParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Gestion du mode Offline
  useEffect(() => {
    const updateOfflineCount = async () => {
      const count = await getOfflineVentesCount();
      setOfflineCount(count);
    };

    updateOfflineCount();

    const handleOnlineStatus = async () => {
      if (navigator.onLine) {
        const result = await syncVentes();
        if (result.success > 0) {
          setSuccessMessage(`${result.success} vente(s) synchronisée(s) automatiquement.`);
          playSuccessSound();
          fetchData();
        }
        updateOfflineCount();
      }
    };

    window.addEventListener('online', handleOnlineStatus);
    return () => window.removeEventListener('online', handleOnlineStatus);
  }, [fetchData]);

  const ajouterAuPanier = () => {
    if (parseInt(quantite) <= 0) {
      setError("La quantité doit être supérieure à 0");
      setShowErrorModal(true);
      return;
    }
    
    // Sécurité : Forcer un entier pour éviter les décimales non gérées
    if (!Number.isInteger(parseFloat(quantite))) {
        setError("La quantité doit être un nombre entier.");
        setShowErrorModal(true);
        return;
    }

    const remiseValue = itemRemiseInput !== '' ? parseFloat(itemRemiseInput) : null;

    const article = articles.find(a => a._id === selectedArticle);
    if (!article) return;

    if (remiseValue !== null && (isNaN(remiseValue) || remiseValue < 0)) {
      setError("La remise doit être un nombre positif (supérieur ou égal à 0).");
      setShowErrorModal(true);
      return;
    }

    if (remiseValue !== null) {
        if (itemRemiseType === 'pourcentage' && (remiseValue < 0 || remiseValue > 100)) {
            setError("La remise en pourcentage doit être entre 0 et 100%.");
            setShowErrorModal(true);
            return;
        }
        if (itemRemiseType === 'montant' && remiseValue > article.prixVente) {
            setError(`La remise (${remiseValue.toLocaleString()} GNF) ne peut pas être supérieure au prix de l'article (${article.prixVente.toLocaleString()} GNF).`);
            setShowErrorModal(true);
            return;
        }
    }
    setError('');
    
    // Validation du stock disponible
    const qtyToAdd = parseInt(quantite);
    const itemInPanier = panier.find(item => item.article._id === selectedArticle);
    const totalQtyRequested = (itemInPanier ? itemInPanier.quantite : 0) + qtyToAdd;

    if (totalQtyRequested > article.quantite) {
        setError(`Stock insuffisant pour "${article.nom}". (Disponible: ${article.quantite}${itemInPanier ? `, déjà dans le panier: ${itemInPanier.quantite}` : ''})`);
        setShowErrorModal(true);
        return;
    }

    const prixUnitaire = getEffectivePrice(article, remiseValue, itemRemiseType);

    const existeDeja = panier.find(item => item.article._id === selectedArticle);
    
    if (existeDeja) {
      setPanier(panier.map(item => 
        item.article._id === selectedArticle
          ? { 
              ...item, 
              quantite: item.quantite + parseInt(quantite),
              remiseTemp: remiseValue,
              remiseType: itemRemiseType, // Stocker le type de remise
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
          remiseType: itemRemiseType, // Stocker le type de remise
          prixUnitaire: prixUnitaire,
          prixTotal: prixUnitaire * parseInt(quantite)
        }
      ]);
    }
    setSelectedArticle('');
    setQuantite(1); // Reset quantity
    setItemRemiseInput(''); // Reset item discount input
    setItemRemiseType('montant'); // Reset item discount type
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

  // ...
  const effectuerVente = async () => {
    // ...
    if (panier.length === 0) {
      setError('Le panier est vide');
      setShowErrorModal(true);
      return;
    }

    const totalVente = calculerTotal();
    // Si le champ est vide, le client paie tout. Sinon, on prend la valeur saisie.
    const montantPayeFinal = montantPaye === '' || montantPaye === null ? totalVente : parseFloat(montantPaye);

    if (montantPayeFinal > totalVente) {
        setError("Le montant payé ne peut pas être supérieur au total de la vente.");
        setShowErrorModal(true);
        return;
    }
    
    if (montantPayeFinal < 0) {
        setError("Le montant payé ne peut pas être négatif.");
        setShowErrorModal(true);
        return;
    }

    // Vérifier si une remise a été appliquée dans le panier
    const hasRemise = panier.some(item => item.remiseTemp && item.remiseTemp > 0);
    
    // On ne peut créer une dette que si un client est sélectionné
    if (montantPayeFinal < totalVente && !selectedClientId && totalVente > 0) { // Ajout de totalVente > 0 pour éviter le blocage si panier vide
        setError("Veuillez sélectionner un client pour enregistrer une dette.");
        setShowErrorModal(true);
        return;
    }

    // NOUVELLE VALIDATION: si une dette est créée, l'échéance est obligatoire
    if (montantPayeFinal < totalVente && !echeanceDette) {
        setError("Veuillez spécifier une date d'échéance pour la dette.");
        setShowErrorModal(true);
        return;
    }

    // Validation : Date d'échéance ne doit pas être dans le passé
    if (montantPayeFinal < totalVente && echeanceDette) {
        const dateEcheance = new Date(echeanceDette);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (dateEcheance < today) {
            setError("La date d'échéance ne peut pas être dans le passé.");
            setShowErrorModal(true);
            return;
        }
    }

    // Validation du numéro de table pour le rôle Serveur
    if (userRole === 'Serveur' && (!numeroTable || !numeroTable.trim())) {
        setError("Veuillez saisir un numéro de table ou un emplacement pour cette commande.");
        setShowErrorModal(true);
        return;
    }

    setIsSubmitting(true);
    const venteData = {
      panier: panier.map(item => ({
        article: item.article._id,
        quantite: item.quantite,
        remiseTemp: item.remiseTemp || 0, // Passer la remise temporaire
        remiseType: item.remiseType || 'montant', // Passer le type de remise
      })),
      clientId: selectedClientId || null, // Envoyer l'ID du client
      montantPaye: montantPayeFinal, // Envoyer le montant réellement payé
      modePaiement: modePaiement, // Envoyer le mode de paiement sélectionné
      echeanceDette: (montantPayeFinal < totalVente) ? (echeanceDette || null) : null, // Envoyer la date d'échéance seulement si dette
      hasRemise: hasRemise, // Indiquer si une remise a été appliquée
      transactionRef: transactionRef, // Envoyer la référence de transaction
      numeroTable: numeroTable // Envoyer le numéro de table pour le serveur
    };

    try {
      if (!navigator.onLine) {
        await saveVenteOffline(venteData);
        setSuccessMessage('Connexion instable. Vente sauvegardée localement (Offline).');
        const count = await getOfflineVentesCount();
        setOfflineCount(count);
      } else {
        await venteAPI.create(venteData);
      }

      const subTotal = panier.reduce((acc, item) => acc + (item.article.prixVente * item.quantite), 0);
      const totalAfterItemDiscounts = panier.reduce((acc, item) => acc + item.prixTotal, 0);
      const itemLevelDiscount = subTotal - totalAfterItemDiscounts;
      const finalTotalNet = calculerTotal();

      const isServeur = userRole === 'Serveur';

      // 4. Dynamisme : Récupération des informations de la boutique depuis le panier.
      const boutiqueInfo = panier.length > 0 ? panier[0].article.boutique : null;
      
      // Calcul du pourboire pour le ticket si c'est un serveur
      let totalPourboire = 0;
      if (isServeur && boutiqueInfo && boutiqueInfo.tipsEnabled !== false) {
          const tipRate = (boutiqueInfo.tipPercentage !== undefined ? boutiqueInfo.tipPercentage : 5) / 100;
          totalPourboire = Math.round(totalVente * tipRate);
      }

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
          modePaiement: modePaiement, // Inclure pour le ticket
          subTotal: subTotal, // Total before any discounts
          itemLevelDiscount: itemLevelDiscount, // Sum of item-level discounts
          pourboire: totalPourboire,
          totalNet: finalTotalNet,
          amountPaid: montantPayeFinal,
          change: montantPayeFinal - totalVente,
          echeanceDette: echeanceDette, // Ajout de l'échéance pour le ticket
          transactionRef: transactionRef // Ajout de la référence de transaction pour le ticket
      };

      // Seul le gérant ou l'admin propose l'impression du ticket final au client
      if (!isServeur) {
          setCurrentReceiptData(receiptData);
          setShowReceiptModal(true);
      }
      
      setSuccessMessage(isServeur ? 'Commande envoyée au bar avec succès !' : 'Vente effectuée avec succès !');

      setPanier([]);
      setSelectedClientId(''); // Réinitialiser le client
      setNumeroTable(''); // Réinitialiser le numéro de table
      setMontantPaye(''); // Réinitialiser le montant payé
      setModePaiement('Cash'); // Réinitialiser le mode de paiement
      setTransactionRef(''); // Réinitialiser la référence de transaction
      setEcheanceDette(''); // Réinitialiser l'échéance
      fetchData();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      // Si l'erreur est réseau (pas de réponse du serveur)
      if (!err.response) {
        await saveVenteOffline(venteData);
        setSuccessMessage('Erreur réseau. Vente sécurisée en mode Offline.');
        const count = await getOfflineVentesCount();
        setOfflineCount(count);
        setPanier([]);
      } else {
        setError(err.response?.data?.message || 'Erreur lors de la vente');
        setShowErrorModal(true);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Gestion des Brouillons (Ventes en attente) ---
  const mettreEnBrouillon = () => {
    if (panier.length === 0) {
        setError("Le panier est vide, impossible de mettre en brouillon.");
        setShowErrorModal(true);
        return;
    }

    const clientObj = clients.find(c => c._id === selectedClientId);
    const newDraft = {
        id: Date.now(),
        date: new Date(),
        panier: [...panier],
        selectedClientId,
        clientName: clientObj ? clientObj.nom : 'Client de passage',
        montantPaye,
        echeanceDette,
        total: calculerTotal()
    };

    setBrouillons([newDraft, ...brouillons]);
    
    // Réinitialiser la vente actuelle pour passer à une autre personne
    setPanier([]);
    setSelectedClientId('');
    setMontantPaye('');
    setEcheanceDette('');
    setSuccessMessage("Vente mise en brouillon ! Vous pouvez maintenant servir un nouveau client.");
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const chargerBrouillon = (draft) => {
    // Si le panier actuel n'est pas vide, on demande confirmation
    if (panier.length > 0 && !window.confirm("Le panier actuel sera remplacé par ce brouillon. Continuer ?")) {
        return;
    }
    setPanier(draft.panier);
    setSelectedClientId(draft.selectedClientId);
    setMontantPaye(draft.montantPaye);
    setEcheanceDette(draft.echeanceDette);
    
    // Retirer du brouillon car il redevient la vente active
    setBrouillons(brouillons.filter(b => b.id !== draft.id));
  };

  const handleFinalizeOrder = async (id, nextStatus, isGroup = false) => {
    try {
        setIsUpdatingStatus(true);
        if (isGroup) {
            await venteAPI.updateGroupStatus(id, { status: nextStatus });

            // Préparation du ticket de caisse pour le groupe si la vente est finalisée
            if (nextStatus === 'finalisee') {
                const group = historique.find(g => g.orderGroupId === id);
                if (group) {
                    const subTotal = group.items.reduce((acc, item) => acc + ((item.article?.prixVente || (item.prixTotal / item.quantite)) * item.quantite), 0);
                    
                    const receiptData = {
                        shopName: group.boutique?.nom || "Ma Boutique",
                        address: group.boutique?.adresse || "",
                        phone: group.boutique?.telephone || "",
                        transactionId: `GRP-${id.toString().slice(-6).toUpperCase()}`,
                        cashierName: localStorage.getItem('userName') || userRole,
                        serverName: group.gerant?.nom || 'N/A', // Ajouter le nom du serveur
                        clientName: group.client?.nom || 'Client de passage',
                        date: new Date(),
                        items: group.items.map(item => ({
                            article: item.article,
                            quantite: item.quantite,
                            prixUnitaire: item.prixTotal / item.quantite,
                            prixTotal: item.prixTotal
                        })),
                        modePaiement: group.items[0]?.modePaiement || 'Cash',
                        subTotal: subTotal,
                        itemLevelDiscount: subTotal - group.totalGroupPrice,
                        totalNet: group.totalGroupPrice,
                        amountPaid: group.totalGroupPrice,
                        change: 0
                    };
                    setCurrentReceiptData(receiptData);
                    setShowReceiptModal(true);
                }
            }
            
            const msg = nextStatus === 'en_preparation' 
                ? "Commande marquée comme PRÊTE. Le serveur a été notifié." 
                : "Table encaissée avec succès.";
            setSuccessMessage(msg);
        } else {
            await venteAPI.updateStatus(id, { status: nextStatus });
            setSuccessMessage(`Commande mise à jour.`);
        }
        // Rafraîchissement "silencieux" (sans faire apparaître le Spinner global)
        await fetchData(true); 
        setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
        console.error("Détail erreur statut:", err.response?.data || err);
        const errorMsg = err.response?.data?.message || "Erreur lors de la mise à jour du statut";
        setError(errorMsg);
        setShowErrorModal(true);
    } finally {
        setIsUpdatingStatus(false);
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
      setShowErrorModal(true);
    } finally {
      setShowCancelModal(false);
      setTimeout(() => setSuccessMessage(''), 3000);
    }
  };

  const handlePrintReceipt = () => {
    if (currentReceiptData) {
      generateReceiptPDF(currentReceiptData);
    }
    handleCloseReceiptModal();
  };

  const handleCloseReceiptModal = () => {
    setShowReceiptModal(false);
    setTimeout(() => barcodeInputRef.current?.focus(), 100);
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
        // Correction : Maintenir la remise existante lors du scan
        const currentRemise = existeDeja.remiseTemp || 0;
        const currentRemiseType = existeDeja.remiseType || 'montant'; // Récupérer le type de remise existant
        const newUnitPrice = getEffectivePrice(article, currentRemise, currentRemiseType); // Passer le type de remise
        return prevPanier.map(item => 
          item.article._id === article._id 
            ? { ...item, quantite: item.quantite + 1, prixUnitaire: newUnitPrice, prixTotal: newUnitPrice * (item.quantite + 1) }
            : item
        );
      } else {
        return [
          ...prevPanier,
          {
            article,
            remiseType: 'montant', // Par défaut, pas de remise temporaire sur un nouvel article scanné
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

  // Logique d'exportation CSV mensuelle des transactions
  const handleExportCSV = async () => {
    try {
      setLoading(true);
      // Bornes du mois sélectionné
      const startDate = new Date(exportDate.year, exportDate.month - 1, 1).toISOString();
      const endDate = new Date(exportDate.year, exportDate.month, 0, 23, 59, 59).toISOString();
      
      const res = await venteAPI.getHistorique({ startDate, endDate, limit: 0 });
      const data = res.data.ventes || [];
      
      if (data.length === 0) {
        setError(`Aucune transaction trouvée pour ${exportDate.month}/${exportDate.year}.`);
        setShowErrorModal(true);
        setShowExportModal(false);
        return;
      }

      // Construction du contenu CSV
      const headers = ["Date", "Heure", "Boutique", "Gerant", "Client", "Article", "Ref", "Quantite", "PU (GNF)", "Remise", "Total (GNF)", "Annulee"];
      const rows = data.map(v => [
        new Date(v.createdAt).toLocaleDateString('fr-FR'),
        new Date(v.createdAt).toLocaleTimeString('fr-FR'),
        v.boutique?.nom || 'N/A',
        v.gerant?.nom || 'N/A',
        v.client?.nom || 'Passage',
        v.article?.nom || 'N/A',
        v.article?.code || '-',
        v.quantite,
        v.prixTotal / v.quantite,
        `${v.remiseAppliquee}${v.remiseType === 'pourcentage' ? '%' : ' GNF'}`,
        v.prixTotal,
        v.isCancelled ? "OUI" : "NON"
      ]);

      const csvContent = [headers.join(","), ...rows.map(r => r.map(val => `"${val}"`).join(","))].join("\n");
      const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `rapport_mensuel_ventes_${exportDate.month}_${exportDate.year}.csv`);
      link.click();
      setShowExportModal(false);
    } catch (err) {
      setError("Erreur lors de la génération du rapport CSV.");
      setShowErrorModal(true);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Spinner animation="border" />;

  return (
    <div className="p-4">
      {/* Style pour colorer l'icône du calendrier natif en bleu primaire */}
      <style>{`
        input[type="date"]::-webkit-calendar-picker-indicator {
            cursor: pointer;
            filter: invert(33%) sepia(78%) saturate(2646%) hue-rotate(203deg) brightness(102%) contrast(103%); //
        }

        /* Animation pour le panier */
        @keyframes pulse-cart {
            0% {
                transform: scale(1);
                box-shadow: 0 0 0 rgba(0, 0, 0, 0.2);
            }
            50% {
                transform: scale(1.02);
                box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
            }
            100% {
                transform: scale(1);
                box-shadow: 0 0 0 rgba(0, 0, 0, 0.2);
            }
        }

        .cart-pulse {
            animation: pulse-cart 0.5s ease-in-out;
        }
      `}</style>
      <div className="d-flex justify-content-between align-items-center mb-4 gap-3">
        <div className="d-flex align-items-center gap-2">
          <h3 className="fw-bold mb-0 text-body">{activeTab === 'sale' ? 'Prendre Commande' : 'Mes Commandes'}</h3>
          {userRole === 'Serveur' && (
            <Badge bg="success" pill className="ms-2 py-2 px-3 shadow-sm d-flex align-items-center">
              <iconify-icon icon="solar:hand-stars-bold" className="me-1"></iconify-icon>
              Mes Pourboires: {totalPourboires.toLocaleString()} GNF
            </Badge>
          )}
        </div>
       
          {offlineCount > 0 && (
            <Badge bg="warning" text="dark" pill className="ms-2 fs-6 align-middle shadow-sm animate__animated animate__bounceIn">
              <iconify-icon icon="solar:cloud-upload-bold-duotone" className="me-1 align-middle"></iconify-icon>
              {offlineCount}
              <span className="d-none d-sm-inline ms-1 small">hors-ligne</span>
            </Badge>
          )}

        {/* Bouton pour afficher le calendrier de vente */}

        {/* Icône du panier pour mobile dans le header */}
        {activeTab === 'sale' && userRole === 'Gérant' && (
          <Button 
            variant="primary" 
            className="d-md-none rounded-circle position-relative p-0 d-flex align-items-center justify-content-center shadow-sm"
            style={{ width: '45px', height: '45px', minWidth: '45px' }}
            onClick={() => setShowMobilePanier(true)}
          >
            <iconify-icon icon="solar:cart-large-bold" style={{ fontSize: '24px' }}></iconify-icon>
            {panier.length > 0 && (
              <Badge pill bg="danger" className="position-absolute top-0 start-100 translate-middle border border-light" style={{ fontSize: '0.7em', padding: '0.4em 0.6em' }}>
                {panier.reduce((acc, item) => acc + item.quantite, 0)}
              </Badge>
            )}
          </Button>
        )}

        {/* Bouton Export CSV Mensuel pour Admin */}
        {userRole === 'Admin' && (
          <Button variant="outline-success" className="rounded-pill px-4 shadow-sm d-flex align-items-center" onClick={() => setShowExportModal(true)}>
            <iconify-icon icon="solar:file-spreadsheet-bold" className="me-2" style={{ fontSize: '20px' }}></iconify-icon>
            Export Mensuel
          </Button>
        )}
      </div>

      {/* Erreur sous forme de modale pour les actions bloquantes */}
      <Modal show={showErrorModal} onHide={() => setShowErrorModal(false)} centered size="sm">
        <Modal.Header closeButton className="bg-danger text-white border-0 py-2">
          <Modal.Title className="h6 mb-0">Action bloquée</Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center p-4">
          <iconify-icon icon="solar:danger-triangle-bold-duotone" style={{ fontSize: '56px', color: '#dc3545' }}></iconify-icon>
          <div className="mt-3 fw-bold text-dark">{error}</div>
        </Modal.Body>
        <Modal.Footer className="justify-content-center border-0 pt-0">
          <Button variant="danger" className="rounded-pill px-4 shadow-sm" onClick={() => setShowErrorModal(false)}>
            J'ai compris
          </Button>
        </Modal.Footer>
      </Modal>

      {successMessage && <Alert variant="success">{successMessage}</Alert>}
      
      {searchParams.get('filter') === 'pending' && (
        <Alert variant="info" className="d-flex justify-content-between align-items-center shadow-sm rounded-4 border-0 mb-4 animate__animated animate__fadeIn">
            <span><iconify-icon icon="solar:info-circle-bold" className="me-2 align-middle fs-5"></iconify-icon> Mode gestion : Affichage des <strong>commandes serveurs en attente</strong> uniquement.</span>
            <Button variant="link" size="sm" className="text-decoration-none fw-bold" onClick={() => setSearchParams({ tab: 'history' })}>Voir tout l'historique</Button>
        </Alert>
      )}

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
            setError={setError}
          />
        </>
      ) : (
        activeTab === 'history' ? (
          <HistoryTab
            historique={historique}
            showCancelledOnly={showCancelledOnly}
            setShowCancelledOnly={setShowCancelledOnly}
            currentPage={currentPage}
            totalPages={totalPages}
            setCurrentPage={setCurrentPage}
            isCancellationAllowed={isCancellationAllowed}
            handleImageClick={handleImageClick}
            setSaleToCancel={setSaleToCancel}
            setShowCancelModal={setShowCancelModal}
            handleFinalizeOrder={handleFinalizeOrder}
            isUpdatingStatus={isUpdatingStatus}
            userRole={userRole}
            isPendingView={searchParams.get('filter') === 'pending'}
          />
        ) : (
            <SaleTab
              panier={panier}
              userRole={userRole}
              setPanier={setPanier}
              clients={clients}
              articles={articles}
              selectedClientId={selectedClientId}
              availableCategories={availableCategories}
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
              numeroTable={numeroTable}
              setNumeroTable={setNumeroTable}
              itemRemiseInput={itemRemiseInput}
              setItemRemiseInput={setItemRemiseInput}
              itemRemiseType={itemRemiseType} // Nouveau prop
              setItemRemiseType={setItemRemiseType} // Nouveau prop
              ajouterAuPanier={ajouterAuPanier}
              getEffectivePrice={getEffectivePrice}
              handleImageClick={handleImageClick}
              retirerDuPanier={retirerDuPanier}
              montantPaye={montantPaye}
              setMontantPaye={setMontantPaye}
              modePaiement={modePaiement}
              transactionRef={transactionRef} // Nouveau prop
              setTransactionRef={setTransactionRef} // Nouveau prop
              setModePaiement={setModePaiement}
              echeanceDette={echeanceDette}
              setEcheanceDette={setEcheanceDette}
              calculerTotal={calculerTotal}
              effectuerVente={effectuerVente}
              historique={historique}
              isSubmitting={isSubmitting}
              brouillons={brouillons}
              mettreEnBrouillon={mettreEnBrouillon}
              chargerBrouillon={chargerBrouillon}
              setBrouillons={setBrouillons}
              showMobilePanier={showMobilePanier}
              setShowMobilePanier={setShowMobilePanier}
              boutiqueConfig={boutiqueConfig} // Passer la config à l'onglet de vente
            />
        )
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

      {/* Modale de sélection pour l'Export CSV */}
      <Modal show={showExportModal} onHide={() => setShowExportModal(false)} centered size="sm">
        <Modal.Header closeButton className="border-0 pb-0">
          <Modal.Title className="fw-bold h5">Rapport Mensuel</Modal.Title>
        </Modal.Header>
        <Modal.Body className="py-3">
          <Row className="g-2">
            <Col xs={7}>
              <Form.Label className="small fw-bold text-muted">Mois</Form.Label>
              <Form.Select size="sm" className="rounded-3" value={exportDate.month} onChange={(e) => setExportDate({...exportDate, month: parseInt(e.target.value)})}>
                {Array.from({length: 12}, (_, i) => (
                  <option key={i+1} value={i+1}>{new Date(2024, i).toLocaleString('fr-FR', {month: 'long'})}</option>
                ))}
              </Form.Select>
            </Col>
            <Col xs={5}>
              <Form.Label className="small fw-bold text-muted">Année</Form.Label>
              <Form.Select size="sm" className="rounded-3" value={exportDate.year} onChange={(e) => setExportDate({...exportDate, year: parseInt(e.target.value)})}>
                {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
              </Form.Select>
            </Col>
          </Row>
          <div className="mt-3 p-2 bg-light rounded x-small text-muted">
            Ce rapport contient l'historique complet des transactions structurées pour le mois sélectionné.
          </div>
        </Modal.Body>
        <Modal.Footer className="border-0 pt-0">
          <Button variant="success" className="w-100 rounded-pill fw-bold shadow-sm" onClick={handleExportCSV}>
            Générer CSV
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default VentesView;