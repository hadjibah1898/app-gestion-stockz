// src/components/ArticlesView.js
// Composant de gestion des articles
// Permet de visualiser, créer, modifier et supprimer les articles
// Affiche les informations sur le stock, les promotions et les remises
// Contient les fonctionnalités d'export PDF et de filtres avancés

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Button,
  Form,
  Modal,
  Alert,
  Spinner,
  Badge,
  OverlayTrigger,
  Tooltip,
  Pagination,
  Tabs,
  Tab,
  Row,
  Col,
  Card,
} from "react-bootstrap";
import { useLocation, useSearchParams } from "react-router-dom";
import XLSX from "xlsx-js-style";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// Vos services et composants personnalisés
import {
  articleAPI,
  boutiqueAPI,
  fournisseurAPI,
  mouvementAPI,
} from "../services/api";
import InventoryTab from "./InventoryTab";
import AdjustmentsTab from "./AdjustmentsTab";
import ArticleFormModal from "./ArticleFormModal";
import ArticleActionModals from "./ArticleActionModals";
import AdjustmentModals from "./AdjustmentModals";
import IntelligentSupplyModal from "./common/IntelligentSupplyModal";
import ImagePreviewModal from "./ImagePreviewModal";

// Vos assets
import logo from "../assets/logo.png";
/**
 * Calcule le temps écoulé depuis l'expédition pour identifier les retards.
 */
const getTimeElapsed = (dateString) => {
  const diffInMs = new Date() - new Date(dateString);
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));

  if (diffInHours < 1) return "à l'instant";
  if (diffInHours < 24) return `il y a ${diffInHours}h`;
  const days = Math.floor(diffInHours / 24);
  if (days === 1) return "hier";
  return `il y a ${days} jours`;
};

const ArticlesView = ({ userRole, boutiqueId, title, headerActions }) => {
  const [articles, setArticles] = useState([]);
  const [boutiques, setBoutiques] = useState([]);
  const [fournisseurs, setFournisseurs] = useState([]);
  const [centralShopId, setCentralShopId] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation(); // Pour récupérer les données de redirection
  const [filterBoutique, setFilterBoutique] = useState(
    boutiqueId ||
      (userRole !== "Admin" ? localStorage.getItem("boutiqueId") : ""),
  );
  const [searchTerm, setSearchTerm] = useState(""); // État pour la barre de recherche
  const [filterFournisseur, setFilterFournisseur] = useState(""); // Nouvel état pour le filtre fournisseur
  const [filterStatus, setFilterStatus] = useState(""); // Nouvel état pour le filtre état du stock
  const [showPromoOnly, setShowPromoOnly] = useState(false); // État pour le filtre promo
  const [activeTab, setActiveTab] = useState("inventory"); // 'inventory' (liste) ou 'adjustments' (workflow)

  // État pour les réceptions en attente (Gérant)
  const [pendingMovements, setPendingMovements] = useState([]);
  const [receivedMovements, setReceivedMovements] = useState([]);
  const [showReceptionHistory, setShowReceptionHistory] = useState(false);
  const [showReceptionModal, setShowReceptionModal] = useState(false);
  const [selectedMovement, setSelectedMovement] = useState(null);
  const [receptionItems, setReceptionItems] = useState([]);
  const [globalReceptionComment, setGlobalReceptionComment] = useState("");
  const [filterReceptionBoutique, setFilterReceptionBoutique] = useState("");

  // États pour les ajustements de stock
  const [adjustments, setAdjustments] = useState([]);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [adjustmentFormData, setAdjustmentFormData] = useState({
    article: "",
    quantite: "",
    raison: "Casse",
    justification: "",
    imageJustificatif: "",
  });
  const [adjLoading, setAdjLoading] = useState(false);
  const [adjSubmitLoading, setAdjSubmitLoading] = useState(false);

  // États pour la validation des ajustements (Admin)
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [selectedAdj, setSelectedAdj] = useState(null);
  const [valDecision, setValDecision] = useState(""); // 'VALIDE' ou 'REJETE'
  const [valComment, setValComment] = useState("");
  const [valLoading, setValLoading] = useState(false);

  // États pour la prévisualisation d'image
  const [showImageModal, setShowImageModal] = useState(false);
  const [previewImage, setPreviewImage] = useState("");

  // État pour le tri avec persistance
  const [sortConfig, setSortConfig] = useState(() => {
    const savedSort = localStorage.getItem("articlesViewSort");
    return savedSort ? JSON.parse(savedSort) : { key: "nom", direction: "asc" };
  });

  // Sauvegarder le tri dès qu'il change
  useEffect(() => {
    localStorage.setItem("articlesViewSort", JSON.stringify(sortConfig));
  }, [sortConfig]);

  // Gestion de la redirection vers l'onglet des réceptions (depuis le Dashboard)
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "receptions") {
      setActiveTab("receptions");
      setShowReceptionHistory(false); // S'assurer de voir les colis à réceptionner
    }
  }, [searchParams, setSearchParams]);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentArticle, setCurrentArticle] = useState({
    _id: "",
    nom: "",
    code: "",
    prixAchat: "",
    prixVente: "",
    quantite: "",
    boutique: "",
    image: "",
    promo: 0,
    promoActive: false,
    dateDebutPromo: "",
    dateFinPromo: "",
    remise: 0,
    datePeremption: "",
    categorie: "Divers",
    seuilAlerte: 10,
    tva: 0,
    type: "Stockable",
    uniteMesure: "Unités",
    description: "",
  });

  const [availableCategories, setAvailableCategories] = useState([
    "Divers",
    "Fast food",
    "Restauration",
    "Boulangerie",
    "Boucherie",
    "Habillement",
  ]);

  // Mettre à jour la liste des catégories disponibles en fonction des articles existants
  useEffect(() => {
    if (articles.length > 0) {
      const existingCats = articles.map((a) => a.categorie).filter(Boolean);
      setAvailableCategories((prev) => {
        const combined = [...new Set([...prev, ...existingCats])];
        return combined;
      });
    }
  }, [articles]);

  const handleAddCategory = () => {
    const newCat = prompt("Entrez le nom de la nouvelle catégorie :");
    if (newCat && newCat.trim() !== "") {
      const trimmedCat = newCat.trim();

      // Vider l'erreur de catégorie si elle existe
      setFieldErrors((prev) => {
        const updated = { ...prev };
        delete updated.categorie;
        return updated;
      });

      if (!availableCategories.includes(trimmedCat)) {
        setAvailableCategories((prev) => [...prev, trimmedCat]);
        setCurrentArticle((prev) => ({ ...prev, categorie: trimmedCat }));
      } else {
        setCurrentArticle((prev) => ({ ...prev, categorie: trimmedCat }));
      }
    }
  };

  const handleRenameCategory = async () => {
    const oldCat = prompt("Entrez le nom exact de la catégorie à modifier :");
    if (!oldCat || !availableCategories.includes(oldCat)) {
      alert("Catégorie introuvable dans la liste actuelle.");
      return;
    }

    const newCat = prompt(`Entrez le nouveau nom pour remplacer "${oldCat}" :`);
    if (!newCat || newCat.trim() === "" || newCat === oldCat) return;

    if (
      window.confirm(
        `Voulez-vous vraiment renommer "${oldCat}" en "${newCat}" pour TOUS les articles ?`,
      )
    ) {
      try {
        setLoading(true);
        // On envoie une requête de mise à jour groupée au backend
        await articleAPI.updateMany({
          oldCategorie: oldCat,
          newCategorie: newCat.trim(),
        });
        setSuccessMessage(
          `La catégorie "${oldCat}" a été renommée en "${newCat}" avec succès.`,
        );
        fetchData();
        setTimeout(() => setSuccessMessage(""), 3000);
      } catch (err) {
        setError(
          err.response?.data?.message || "Erreur lors du renommage global.",
        );
      } finally {
        setLoading(false);
      }
    }
  };

  // États pour la confirmation de suppression
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [articleToDelete, setArticleToDelete] = useState(null);

  // États pour la sélection multiple et l'approvisionnement
  const [selectedArticles, setSelectedArticles] = useState([]);
  const [showIntelligentSupplyModal, setShowIntelligentSupplyModal] =
    useState(false);
  const [preSelectedSupplier, setPreSelectedSupplier] = useState("");

  // États pour la promo automatique péremption
  const [showAutoPromoModal, setShowAutoPromoModal] = useState(false);
  const [autoPromoConfig, setAutoPromoConfig] = useState({
    jours: 7,
    pourcentage: 20,
  });
  const [autoPromoLoading, setAutoPromoLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");

    // Préparer les paramètres de tri pour l'API
    let sortParam = sortConfig.key;
    let orderParam = sortConfig.direction;

    // Le backend ne gère pas encore les tries complexes comme "margeUnitaire",
    // donc pour ces cas, on doit soit les trier en frontend après réception,
    // soit ajuster le backend pour qu'il les supporte.
    // Pour l'instant, on envoie uniquement les clés directes du modèle.
    const allowedBackendSortKeys = [
      "nom",
      "code",
      "prixAchat",
      "prixVente",
      "quantite",
      "datePeremption",
    ];
    if (!allowedBackendSortKeys.includes(sortParam)) {
      sortParam = "nom"; // Revenir à un tri par défaut si la clé n'est pas supportée par le backend
      orderParam = "asc";
    }

    // Logique de tri côté client si la colonne triée n'est pas gérée par le backend
    // ou si on a des calculs complexes (marge, valeur stock)
    const applyClientSideSort = (articlesArray) => {
      const sorted = [...articlesArray].sort((a, b) => {
        // Ici, vous pouvez implémenter une logique de tri complexe pour les colonnes calculées si nécessaire
        // Pour les colonnes simples gérées par le backend, ce tri est redondant mais inoffensif.
        // Exemple: pour 'nom' ou 'quantite', le backend devrait déjà avoir fait le travail.
        // Cette partie serait utile pour des colonnes comme 'valeurStock' si le backend ne la trie pas.
        return 0; // Pour l'instant, pas de tri client côté article, on se repose sur le backend.
      });
      return sorted;
    };

    const params = {
      page: currentPage,
      limit: 15,
      search: searchTerm,
      boutique: filterBoutique,
      fournisseur: filterFournisseur,
      status: filterStatus,
      sort: sortParam, // Utiliser le paramètre validé (incluant le fallback)
      order: orderParam, // Utiliser le paramètre validé (incluant le fallback)
    };

    try {
      const [articlesRes, boutiquesRes, fournisseursRes] = await Promise.all([
        articleAPI.getAll(params), // Le backend filtrera déjà par Admin grâce au service modifié
        userRole === "Admin"
          ? boutiqueAPI.getAll()
          : Promise.resolve({ data: [] }),
        userRole === "Admin"
          ? fournisseurAPI.getAll()
          : Promise.resolve({ data: [] }),
      ]);

      // Handle paginated response or simple array
      if (articlesRes.data && articlesRes.data.data) {
        setArticles(applyClientSideSort(articlesRes.data.data)); // Appliquer un tri client si nécessaire
        setTotalPages(articlesRes.data.totalPages);
      } else {
        setArticles(articlesRes.data || []);
        setTotalPages(1);
      }

      setBoutiques(boutiquesRes.data);
      // Identifier la boutique centrale pour la logique de filtrage
      const centrale = boutiquesRes.data.find((b) => b.type === "Centrale");
      const effectiveCentralId = centrale ? centrale._id : centralShopId;

      if (centrale) {
        setCentralShopId(centrale._id);
      }

      // Si c'est un gérant ou un admin, on charge les réceptions/transferts
      if (userRole === "Gérant" || userRole === "Admin") {
        const bId = localStorage.getItem("boutiqueId");
        const paramsPending = { statutTransfert: "EXPEDIE", type: "Transfert" }; // Ajout du filtre de type
        const paramsReceived = { statutTransfert: "RECU", limit: 10, type: "Transfert" }; // Ajout du filtre de type

        if (userRole === "Gérant") {
          paramsPending.boutiqueDestination = bId;
          paramsReceived.boutiqueDestination = bId;
        } else if (userRole === "Admin" && filterReceptionBoutique) {
          // Appliquer le filtre de destination pour l'admin
          paramsPending.boutiqueDestination = filterReceptionBoutique;
          paramsReceived.boutiqueDestination = filterReceptionBoutique;
        }

        // Pour l'Admin, les transferts listés sont toujours depuis sa centrale vers ses secondaires
        if (userRole === "Admin") {
          if (!effectiveCentralId)
            throw new Error(
              "Dépôt Principal non trouvé pour l'administrateur. Impossible de suivre les transferts.",
            );
          paramsPending.boutiqueSource = effectiveCentralId;
          paramsPending.boutiqueDestinationType = "Secondaire"; // Ajout d'un filtre pour le type

          paramsReceived.boutiqueSource = effectiveCentralId;
          paramsReceived.boutiqueDestinationType = "Secondaire"; // Ajout d'un filtre pour le type
        }

        const [pendingRes, receivedRes] = await Promise.all([
          mouvementAPI.getAll(paramsPending),
          mouvementAPI.getAll(paramsReceived),
        ]);
        setPendingMovements(pendingRes.data.data || pendingRes.data || []);
        setReceivedMovements(receivedRes.data.data || receivedRes.data || []);
      }

      setFournisseurs(fournisseursRes.data);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [
    userRole,
    currentPage,
    searchTerm,
    filterBoutique,
    filterFournisseur,
    filterStatus,
    sortConfig,
    filterReceptionBoutique,
    centralShopId,
  ]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // eslint-disable-next-line no-unused-vars
  const handleRemindManager = async (mvtId) => {
    try {
      await mouvementAPI.relancerGerant(mvtId);
      setSuccessMessage("Notification de rappel envoyée au gérant.");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Erreur lors de la relance.");
    }
  };

  // eslint-disable-next-line no-unused-vars
  const handleCancelTransfer = async (mvtId) => {
    if (
      !window.confirm(
        "Voulez-vous vraiment annuler ce transfert ? Le stock retournera en Centrale.",
      )
    )
      return;
    try {
      await articleAPI.annulerTransfert(mvtId);
      setSuccessMessage("Transfert annulé et stock restauré.");
      fetchData();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Erreur lors de l'annulation.");
    }
  };

  const handleOpenReceptionModal = (mvt) => {
    setSelectedMovement(mvt);
    setReceptionItems(
      mvt.articles.map((a) => ({
        articleId: a.articleId,
        nomArticle: a.nomArticle,
        quantiteAttendue: a.quantite,
        quantiteRecue: a.quantite,
        commentaire: "",
      })),
    );
    setGlobalReceptionComment("");
    setShowReceptionModal(true);
  };

  const handleGenerateReceptionPDF = (mvt, itemsRecus, commentaireGlobal) => {
    const doc = new jsPDF();
    try {
      doc.addImage(logo, "PNG", 14, 10, 40, 15);
    } catch (e) {}

    doc.setFontSize(18).setTextColor(41, 128, 185).setFont("helvetica", "bold");
    doc.text("BON DE RÉCEPTION", 105, 20, { align: "center" });

    doc.setFontSize(10).setTextColor(100).setFont("helvetica", "normal");
    doc.text(
      `Transfert : #${mvt._id.toString().slice(-6).toUpperCase()}`,
      105,
      27,
      { align: "center" },
    );
    doc.text(`Date : ${new Date().toLocaleString("fr-FR")}`, 196, 20, {
      align: "right",
    });

    // Infos de provenance
    doc.setFontSize(10).setTextColor(0).setFont("helvetica", "bold");
    doc.text(
      `Provenance : ${mvt.boutiqueSource?.nom || "Dépôt Principal"}`,
      14,
      35,
    );
    doc.text(
      `Destination : ${mvt.boutiqueDestination?.nom || "Ma Boutique"}`,
      105,
      35,
    );

    const tableColumn = ["Article", "Prévu", "Reçu", "Écart / État"];
    const tableRows = itemsRecus.map((item) => [
      item.nomArticle,
      item.quantiteAttendue,
      item.quantiteRecue,
      item.commentaire ||
        (item.quantiteAttendue !== item.quantiteRecue
          ? `Manquant: ${item.quantiteAttendue - item.quantiteRecue}`
          : "Conforme"),
    ]);

    autoTable(doc, {
      startY: 40,
      head: [tableColumn],
      body: tableRows,
      theme: "grid",
      headStyles: { fillColor: [41, 128, 185], halign: "center" },
      columnStyles: { 1: { halign: "center" }, 2: { halign: "center" } },
    });

    let finalY = doc.lastAutoTable.finalY + 10;

    if (commentaireGlobal) {
      doc.setFontSize(10).setTextColor(0).setFont("helvetica", "bold");
      doc.text("Observations :", 14, finalY);
      doc.setFont("helvetica", "normal");
      doc.text(commentaireGlobal, 14, finalY + 7, { maxWidth: 180 });
      finalY += 15;
    }

    // Inclusion du justificatif original de l'Admin si présent
    if (mvt.imageJustificatif) {
      if (finalY > 230) {
        doc.addPage();
        finalY = 20;
      }
      doc.setFontSize(10).setTextColor(100).setFont("helvetica", "bold");
      doc.text("Justificatif d'expédition original (BL) :", 14, finalY);
      try {
        doc.addImage(mvt.imageJustificatif, "JPEG", 14, finalY + 5, 70, 50);
      } catch (e) {
        console.error("PDF Image error:", e);
      }
    }

    doc.save(`reception_${mvt._id.toString().slice(-6)}.pdf`);
  };

  // eslint-disable-next-line no-unused-vars
  const handleFinalReception = async (e) => {
    e.preventDefault();
    setValLoading(true);
    try {
      const itemsRecus = receptionItems.map((item) => ({
        nomArticle: item.nomArticle,
        quantiteRecue: item.quantiteRecue,
      }));
      const detailNotes = receptionItems
        .filter((i) => i.commentaire)
        .map((i) => `${i.nomArticle}: ${i.commentaire}`)
        .join(" | ");
      const finalComment = globalReceptionComment
        ? `${globalReceptionComment}${detailNotes ? ` | ${detailNotes}` : ""}`
        : detailNotes;

      const res = await mouvementAPI.confirmerReception(selectedMovement._id, {
        itemsRecus,
        commentaire: finalComment,
      });
      handleGenerateReceptionPDF(
        selectedMovement,
        receptionItems,
        finalComment,
      );
      setSuccessMessage(
        res.data.message || "Réception validée et reçu généré !",
      );
      setShowReceptionModal(false);
      fetchData();
      setShowReceptionHistory(true); // Basculer automatiquement vers l'historique (les archives) après validation
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Erreur lors de la réception");
    } finally {
      setValLoading(false);
    }
  };

  const handleOpenValModal = (adj, decision) => {
    setSelectedAdj(adj);
    setValDecision(decision);
    setValComment("");
    setShowValidationModal(true);
  };

  const handleValSubmit = async (e) => {
    e.preventDefault();
    setValLoading(true);
    try {
      await articleAPI.validateAdjustment(selectedAdj._id, {
        decision: valDecision,
        commentaire: valComment,
      });
      setSuccessMessage(
        `Ajustement ${valDecision === "VALIDE" ? "validé" : "rejeté"} avec succès.`,
      );
      setShowValidationModal(false);
      fetchAdjustments(); // Rafraîchir la liste
      fetchData(); // Rafraîchir l'inventaire car le stock a pu changer
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Erreur lors de la validation.");
    } finally {
      setValLoading(false);
    }
  };

  // Charger les ajustements si l'onglet est actif
  useEffect(() => {
    if (activeTab === "adjustments") {
      fetchAdjustments();
    }
  }, [activeTab]);

  const fetchAdjustments = async () => {
    setAdjLoading(true);
    try {
      const res = await articleAPI.getAdjustments();
      setAdjustments(res.data);
    } catch (err) {
      console.error("Erreur chargement ajustements", err);
    } finally {
      setAdjLoading(false);
    }
  };

  const handleOpenAdjustmentModal = () => {
    setAdjustmentFormData({
      article: "",
      quantite: "",
      raison: "Casse",
      justification: "",
      imageJustificatif: "",
    });
    setShowAdjustmentModal(true);
  };

  const handleAdjustmentPhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setAdjustmentFormData({
          ...adjustmentFormData,
          imageJustificatif: event.target.result,
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAdjustmentSubmit = async (e) => {
    e.preventDefault();
    setAdjSubmitLoading(true);
    try {
      await articleAPI.createAdjustment(adjustmentFormData);
      setSuccessMessage("Demande d'ajustement envoyée à l'administrateur.");
      setShowAdjustmentModal(false);
      fetchAdjustments();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Erreur lors de la demande.");
    } finally {
      setAdjSubmitLoading(false);
    }
  };

  const handleImageClick = (img) => {
    setPreviewImage(img);
    setShowImageModal(true);
  };

  // Fonction pour gérer le changement de tri
  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key)
      return (
        <iconify-icon
          icon="solar:sort-vertical-linear"
          className="ms-1 align-middle opacity-50"
        ></iconify-icon>
      );
    return sortConfig.direction === "asc" ? (
      <iconify-icon
        icon="solar:sort-from-top-to-bottom-bold"
        className="ms-1 align-middle text-primary"
      ></iconify-icon>
    ) : (
      <iconify-icon
        icon="solar:sort-from-bottom-to-top-bold"
        className="ms-1 align-middle text-primary"
      ></iconify-icon>
    );
  };

  // Effet pour gérer l'ouverture automatique de la modale d'approvisionnement depuis le Dashboard
  useEffect(() => {
    if (location.state?.openSupplyModal && !loading && articles.length > 0) {
      const { articleId, supplierId } = location.state;

      if (articleId) {
        const targetArticle = articles.find((a) => a._id === articleId);
        if (targetArticle) {
          setSelectedArticles([articleId]);
          if (supplierId) {
            setFilterFournisseur(supplierId);
          }
          // S'assurer que les articles sélectionnés ne sont pas vides
          if (articleId) setSelectedArticles([articleId]);
          setShowIntelligentSupplyModal(true);
          // Nettoyer l'état pour éviter la réouverture intempestive
          window.history.replaceState({}, document.title);
        }
      }
    }
  }, [loading, articles, location.state]);

  // Effet pour gérer l'ouverture via les paramètres d'URL (Notifications)
  useEffect(() => {
    if (!loading && articles.length > 0) {
      const openEditId = searchParams.get("openEdit");
      const openSupplyId = searchParams.get("openSupply");

      if (openEditId) {
        const article = articles.find((a) => a._id === openEditId);
        if (article) {
          handleShowModal(article);
          // Nettoyer l'URL
          setSearchParams((params) => {
            params.delete("openEdit");
            return params;
          });
        }
      }

      if (openSupplyId) {
        const article = articles.find((a) => a._id === openSupplyId);
        if (article) {
          setSelectedArticles([article._id]);
          if (article.fournisseur) {
            setFilterFournisseur(
              article.fournisseur._id || article.fournisseur,
            );
          }
          setShowIntelligentSupplyModal(true);
          setSearchParams((params) => {
            params.delete("openSupply");
            return params;
          });
        }
      }
    }
  }, [loading, articles, searchParams, setSearchParams]);

  const handleShowModal = (article = null) => {
    if (article) {
      setCurrentArticle(article);
      setEditMode(true);
    } else {
      setCurrentArticle({
        nom: "",
        code: "",
        prixAchat: "",
        prixVente: "",
        quantite: "",
        boutique: "",
        image: "",
        promo: 0,
        promoActive: false,
        dateDebutPromo: "",
        dateFinPromo: "",
        remise: 0,
        datePeremption: "",
        tva: 0,
        type: "Stockable",
        uniteMesure: "Unités",
        description: "",
      });
      setEditMode(false);
    }
    setShowModal(true);
    setFieldErrors({});
  };

  const handleCloseModal = () => {
    setShowModal(false);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    setCurrentArticle((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));

    // Vider l'erreur du champ spécifique dès que l'utilisateur commence à le modifier
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const updatedErrors = { ...prev };
        delete updatedErrors[name];
        return updatedErrors;
      });
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);

          const compressedBase64 = canvas.toDataURL("image/jpeg", 0.7);
          setCurrentArticle({ ...currentArticle, image: compressedBase64 });
        };
      };
      reader.readAsDataURL(file);
    }
  };

  // Fonction pour générer un code unique (timestamp + random)
  const generateUniqueCode = () => {
    const timestamp = Date.now().toString(36); // Convertit le timestamp en base 36
    const random = Math.random().toString(36).substring(2, 7); // 5 caractères alphanumériques aléatoires
    return `ART-${timestamp}-${random}`.toUpperCase();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    setFieldErrors({});

    // 1. Validation Frontend (Expérience Utilisateur) : Unicité du code
    if (currentArticle.code && currentArticle.code.trim() !== "") {
      const codeSaisi = currentArticle.code.trim().toLowerCase();
      const duplicate = articles.find(
        (a) =>
          a.code &&
          a.code.trim().toLowerCase() === codeSaisi &&
          a._id !== currentArticle._id,
      );

      if (duplicate) {
        setError(
          `Le code "${currentArticle.code}" est déjà utilisé par l'article "${duplicate.nom}".`,
        );
        setFieldErrors({ code: "Ce code article doit être unique." });
        return; // Bloque l'envoi au serveur
      }
    }

    // Correction : S'assurer que l'ID de la boutique est envoyé, pas l'objet complet
    const payload = {
      ...currentArticle,
      boutique: currentArticle.boutique?._id || currentArticle.boutique,
      fournisseur:
        currentArticle.fournisseur?._id || currentArticle.fournisseur,
    };

    try {
      if (editMode) {
        if (!currentArticle._id) {
          setError("Erreur interne : ID de l'article manquant.");
          return;
        }
        await articleAPI.update(currentArticle._id, payload);
        setSuccessMessage("Article modifié avec succès !");
      } else {
        await articleAPI.create(payload);
        setSuccessMessage("Article créé avec succès !");
      }
      fetchData();
      handleCloseModal();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      if (err.response?.status === 400 && err.response.data.errors) {
        // Si le backend renvoie des erreurs de validation par champ
        setFieldErrors(err.response.data.errors);
        setError(err.response.data.message);
      } else {
        setError(err.response?.data?.message || "Erreur d'enregistrement");
      }
    }
  };

  const confirmDelete = (id) => {
    setArticleToDelete(id);
    setShowDeleteModal(true);
  };

  const executeDelete = async () => {
    setError("");
    setSuccessMessage("");
    try {
      await articleAPI.delete(articleToDelete);
      setShowDeleteModal(false);
      setSuccessMessage("Article supprimé avec succès !");
      fetchData();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Erreur de suppression");
    }
  };

  const handleExportPDF = async () => {
    try {
      setLoading(true);
      // 1. On récupère l'intégralité des articles correspondant aux filtres (limit: 0)
      const params = {
        limit: 0,
        search: searchTerm,
        boutique: filterBoutique,
        fournisseur: filterFournisseur,
        status: filterStatus,
      };
      const res = await articleAPI.getAll(params);
      let allArticles = res.data.data || res.data || [];

      // 2. Application du filtre local promo si actif
      if (showPromoOnly) {
        allArticles = allArticles.filter((a) => a.promoActive && a.promo > 0);
      }

      if (allArticles.length === 0) {
        alert("Aucun article à exporter pour ces critères.");
        return;
      }

      const doc = new jsPDF();
      let finalY = 0;

      // --- 1. EN-TÊTE ---
      doc.addImage(logo, "PNG", 14, 8, 40, 15);

      doc.setFontSize(18);
      doc.setTextColor(41, 128, 185);
      doc.setFont("helvetica", "bold");
      doc.text(title || "Rapport de Stock", 60, 16);

      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(
        `Généré le : ${new Date().toLocaleDateString("fr-FR")} à ${new Date().toLocaleTimeString("fr-FR")}`,
        60,
        22,
      );
      finalY = 35;

      // Calcul des statistiques globales pour le PDF
      const totalArticles = allArticles.reduce(
        (acc, curr) => acc + curr.quantite,
        0,
      );
      const totalValeurAchat = allArticles.reduce(
        (acc, curr) => acc + curr.prixAchat * curr.quantite,
        0,
      );
      const totalValeurVente = allArticles.reduce(
        (acc, curr) => acc + curr.prixVente * curr.quantite,
        0,
      );

      // Affichage des résumés dans un cadre
      doc.setFillColor(245, 247, 250);
      doc.setDrawColor(200, 200, 200);
      doc.roundedRect(14, finalY, 182, 25, 2, 2, "FD");
      finalY += 5;

      doc.setFontSize(10);
      doc.setTextColor(50);

      // Ligne 1 : Nombre d'articles
      doc.text(`Nombre total d'articles :`, 20, finalY + 5);
      doc.setFont("helvetica", "bold");
      doc.text(`${totalArticles}`, 65, finalY + 5);
      doc.setFont("helvetica", "normal");

      // Ligne 2 : Valeurs financières
      doc.text(`Valeur Stock (Achat) :`, 20, finalY + 13);
      doc.setFont("helvetica", "bold");
      doc.text(
        `${(totalValeurAchat.toLocaleString("fr-FR") + " GNF").replace(/[\u00a0\u202f]/g, " ")}`,
        65,
        finalY + 13,
      );

      doc.setFont("helvetica", "normal");
      doc.text(`Valeur Potentielle (Vente) :`, 110, finalY + 13);
      doc.setFont("helvetica", "bold");
      doc.text(
        `${(totalValeurVente.toLocaleString("fr-FR") + " GNF").replace(/[\u00a0\u202f]/g, " ")}`,
        160,
        finalY + 13,
      );
      doc.setFont("helvetica", "normal");
      finalY += 30;

      const tableColumn = [
        "Nom",
        "Code",
        "Boutique",
        "P. Achat",
        "P. Vente",
        "Qté",
        "Valeur Stock",
      ];
      const tableRows = [];

      allArticles.forEach((article) => {
        const valeurStock = article.prixAchat * article.quantite;
        const articleData = [
          article.nom,
          article.code || "-",
          article.boutique?.nom || "Non assignée",
          (article.prixAchat.toLocaleString("fr-FR") + " GNF").replace(
            /[\u00a0\u202f]/g,
            " ",
          ),
          (article.prixVente.toLocaleString("fr-FR") + " GNF").replace(
            /[\u00a0\u202f]/g,
            " ",
          ),
          article.quantite,
          (valeurStock.toLocaleString("fr-FR") + " GNF").replace(
            /[\u00a0\u202f]/g,
            " ",
          ),
        ];
        tableRows.push(articleData);
      });

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: finalY,
        theme: "grid",
        styles: {
          fontSize: 9,
          cellPadding: 3,
          valign: "middle",
          lineColor: [220, 220, 220],
          lineWidth: 0.1,
        },
        headStyles: {
          fillColor: [41, 128, 185],
          textColor: 255,
          fontStyle: "bold",
          halign: "center",
        },
        columnStyles: {
          0: { cellWidth: "auto" }, // Nom
          1: { cellWidth: 25 }, // Code
          2: { cellWidth: 30 }, // Boutique
          3: { halign: "right", cellWidth: 28 }, // P. Achat
          4: { halign: "right", cellWidth: 28 }, // P. Vente
          5: { halign: "center", cellWidth: 15 }, // Qté
          6: { halign: "right", fontStyle: "bold", cellWidth: 30 }, // Valeur Stock
        },
        alternateRowStyles: { fillColor: [248, 249, 250] },
      });

      // Pied de page avec numérotation
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        const pageSize = doc.internal.pageSize;
        const pageHeight = pageSize.height
          ? pageSize.height
          : pageSize.getHeight();
        doc.text(`StockDash - Gestion de Stock`, 14, pageHeight - 10);
        doc.text(
          `Page ${i} sur ${pageCount}`,
          pageSize.width - 20,
          pageHeight - 10,
          { align: "right" },
        );
      }

      const fileName = title
        ? `${title.replace(/\s+/g, "_").toLowerCase()}_${new Date().toISOString().split("T")[0]}.pdf`
        : "articles.pdf";
      doc.save(fileName);
    } catch (err) {
      console.error("Erreur export PDF:", err);
      setError("Impossible de générer le PDF complet.");
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      setLoading(true);
      // Récupération de tous les articles sans pagination
      const params = {
        limit: 0,
        search: searchTerm,
        boutique: filterBoutique,
        fournisseur: filterFournisseur,
        status: filterStatus,
      };
      const res = await articleAPI.getAll(params);
      const allData = res.data.data || res.data || [];

      const dataToExport = allData.map((a) => ({
        Code: a.code || "-",
        Nom: a.nom,
        Boutique: a.boutique?.nom || "N/A",
        Fournisseur: a.fournisseur?.nom || "N/A",
        "Prix Achat (GNF)": a.prixAchat,
        "Prix Vente (GNF)": a.prixVente,
        Quantité: a.quantite,
        Péremption: a.datePeremption
          ? new Date(a.datePeremption).toLocaleDateString()
          : "-",
        "Valeur Stock (Achat)": a.prixAchat * a.quantite,
        "Statut Promo": a.promoActive ? `Oui (-${a.promo}%)` : "Non",
      }));

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Articles");
      XLSX.writeFile(
        workbook,
        `export_articles_${new Date().toISOString().split("T")[0]}.xlsx`,
      );

      setSuccessMessage("Fichier Excel généré avec succès !");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError("Erreur lors de la génération du fichier Excel.");
    } finally {
      setLoading(false);
    }
  };

  const handleAutoPromoSubmit = async (e) => {
    e.preventDefault();
    setAutoPromoLoading(true);
    setError("");
    try {
      const res = await articleAPI.applyAutoPromo(autoPromoConfig);
      setSuccessMessage(res.data.message);
      setShowAutoPromoModal(false);
      fetchData();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Erreur lors de l'application des promotions.",
      );
    } finally {
      setAutoPromoLoading(false);
    }
  };

  // Client-side filtering removed/simplified as we now do server-side filtering
  // We still keep the promo filter client-side or we could move it to backend too
  let filteredArticles = articles.filter((article) => {
    // Le filtrage promo sera fait par le backend si l'API est mise à jour pour cela, sinon il reste client-side
    const matchPromo =
      !showPromoOnly ||
      (article.promoActive && (article.promo > 0 || article.remise > 0)); // Inclure aussi les remises manuelles
    return matchPromo;
  });

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedArticles(filteredArticles.map((a) => a._id));
    } else {
      setSelectedArticles([]);
    }
  };

  const handleSelectOne = (id) => {
    if (selectedArticles.includes(id)) {
      setSelectedArticles(selectedArticles.filter((item) => item !== id));
    } else {
      setSelectedArticles([...selectedArticles, id]);
    }
  };

  // Adapter le composant TableComponent pour qu'il gère le tri via la prop `onSort`
  // ou utiliser un tableau HTML natif pour gérer les clics sur les en-têtes.
  // Pour cet exemple, nous allons modifier le `render` de chaque colonne.
  const columns = [
    ...(filterFournisseur
      ? [
          {
            key: "select",
            label: (
              <Form.Check
                type="checkbox"
                onChange={handleSelectAll}
                checked={
                  filteredArticles.length > 0 &&
                  selectedArticles.length === filteredArticles.length
                }
              />
            ),
            render: (_, article) => (
              <Form.Check
                type="checkbox"
                checked={selectedArticles.includes(article._id)}
                onChange={() => handleSelectOne(article._id)}
              />
            ),
          },
        ]
      : []),
    {
      key: "image",
      label: "Image",
      render: (img) =>
        img ? (
          <img
            src={img}
            alt="produit"
            className="rounded shadow-sm"
            style={{ width: "40px", height: "40px", objectFit: "cover" }}
          />
        ) : (
          <div
            className="bg-light rounded d-flex align-items-center justify-content-center text-muted small"
            style={{ width: "40px", height: "40px" }}
          >
            <iconify-icon icon="solar:camera-linear"></iconify-icon>
          </div>
        ),
    },
    {
      key: "code",
      label: <>Code {getSortIcon("code")}</>,
      headerClassName: "cursor-pointer",
      onClick: () => handleSort("code"),
    },
    {
      key: "nom",
      label: <>Nom {getSortIcon("nom")}</>,
      headerClassName: "cursor-pointer",
      onClick: () => handleSort("nom"),
    },
    {
      key: "categorie",
      label: "Catégorie",
      render: (cat) => (
        <Badge bg="info" pill>
          {cat || "Divers"}
        </Badge>
      ),
    },
    {
      key: "boutique",
      label: "Boutique",
      render: (boutique) => {
        if (!boutique) {
          return <Badge bg="secondary">Non assignée</Badge>;
        }
        return (
          <span>
            {boutique.nom}{" "}
            {boutique.type === "Centrale" && (
              <Badge bg="primary" pill className="ms-2">
                Principal
              </Badge>
            )}
          </span>
        );
      },
    },
    // La colonne Fournisseur est visible uniquement pour l'Admin
    ...(userRole === "Admin"
      ? [
          {
            key: "fournisseur",
            label: <>Fournisseur {getSortIcon("fournisseur")}</>,
            headerClassName: "cursor-pointer",
            onClick: () => handleSort("fournisseur"),
            render: (fournisseur) => {
              if (!fournisseur) {
                return <Badge bg="secondary">Non spécifié</Badge>;
              }
              return <span>{fournisseur.nom}</span>;
            },
          },
        ]
      : []),
    ...(userRole !== "Serveur"
      ? [
          {
            key: "prixAchat",
            label: <>P. Achat {getSortIcon("prixAchat")}</>,
            headerClassName: "cursor-pointer text-end",
            cellClassName: "text-end",
            onClick: () => handleSort("prixAchat"),
            render: (price) => price.toLocaleString() + " GNF",
          },
        ]
      : []),
    {
      key: "prixVente",
      label: <>P. Vente {getSortIcon("prixVente")}</>,
      headerClassName: "cursor-pointer text-end",
      cellClassName: "text-end",
      onClick: () => handleSort("prixVente"),
      render: (price) => price.toLocaleString() + " GNF",
    },
    {
      key: "promo",
      label: "Promo/Remise",
      render: (_, article) => {
        if (article.promoActive && article.promo > 0)
          return <Badge bg="danger">Promo -{article.promo}%</Badge>;
        if (article.remise > 0)
          return (
            <Badge bg="warning" text="dark">
              Remise -{article.remise}%
            </Badge>
          );
        if (article.remiseEnAttente?.valeur > 0)
          return (
            <Badge bg="info">Demande: {article.remiseEnAttente.valeur}%</Badge>
          );
        return "-";
      },
    },
    {
      key: "dateFinPromo",
      label: "Fin Promo",
      render: (date, article) => {
        if (article.promoActive && article.promo > 0 && date) {
          return new Date(date).toLocaleDateString("fr-FR");
        }
        return "-";
      },
    },
    {
      key: "datePeremption",
      label: "Péremption",
      headerClassName: "cursor-pointer",
      onClick: () => handleSort("datePeremption"),
      // Le rendu reste le même
      render: (date) => {
        if (!date) return "-";
        const d = new Date(date);
        const now = new Date();
        const diffTime = d - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let badgeBg = "success";
        if (diffDays < 0)
          badgeBg = "danger"; // Périmé
        else if (diffDays <= 30) badgeBg = "warning"; // Bientôt périmé

        return <Badge bg={badgeBg}>{d.toLocaleDateString("fr-FR")}</Badge>;
      },
    },
    {
      key: "quantite",
      label: "Quantité",
      headerClassName: "cursor-pointer text-center",
      cellClassName: "text-center",
      onClick: () => handleSort("quantite"),
      render: (value, article) => {
        const seuil = article.seuilAlerte || 10;
        return (
          <Badge
            bg={value > seuil ? "success" : value > 0 ? "warning" : "danger"}
          >
            {value} unités
          </Badge>
        );
      },
    },
    {
      key: "actions",
      label: "Actions",
      render: (_, article) => (
        <div className="d-flex gap-2">
          {userRole === "Admin" && (
            <>
              <OverlayTrigger overlay={<Tooltip>Modifier</Tooltip>}>
                <Button
                  variant="link"
                  className="text-primary p-0"
                  onClick={() => handleShowModal(article)}
                >
                  <iconify-icon
                    icon="solar:pen-new-square-linear"
                    style={{ fontSize: "20px" }}
                  ></iconify-icon>
                </Button>
              </OverlayTrigger>
              <OverlayTrigger overlay={<Tooltip>Supprimer</Tooltip>}>
                <Button
                  variant="link"
                  className="text-danger p-0"
                  onClick={() => confirmDelete(article._id)}
                >
                  <iconify-icon
                    icon="solar:trash-bin-trash-linear"
                    style={{ fontSize: "20px" }}
                  ></iconify-icon>
                </Button>
              </OverlayTrigger>
            </>
          )}
        </div>
      ),
    },
  ];

  // Function to handle page change
  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
  };

  // Pagination Items
  // Pagination Items (Smart pagination)
  const renderPaginationItems = useMemo(() => {
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      if (
        i === 1 ||
        i === totalPages ||
        (i >= currentPage - 1 && i <= currentPage + 1)
      ) {
        pages.push(i);
      }
    }
    return pages.map((p, idx) => (
      <React.Fragment key={p}>
        {idx > 0 && pages[idx - 1] !== p - 1 && (
          <Pagination.Ellipsis disabled />
        )}
        <Pagination.Item
          active={p === currentPage}
          onClick={() => handlePageChange(p)}
        >
          {p}
        </Pagination.Item>
      </React.Fragment>
    ));
  }, [currentPage, totalPages]);

  const handleSupplySuccess = () => {
    setSuccessMessage("Approvisionnement enregistré avec succès !");
    setShowIntelligentSupplyModal(false);
    setSelectedArticles([]);
    fetchData();
    setTimeout(() => setSuccessMessage(""), 3000);
  };

  if (loading) return <Spinner animation="border" />;

  return (
    <div className="p-4">
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
        <h3 className="fw-bold mb-0 text-body">
          {title || "Gestion des Articles"}
        </h3>
        <div className="d-flex flex-wrap gap-2">
          {selectedArticles.length > 0 && userRole === "Admin" && (
            <>
              <Button
                variant="success"
                onClick={() => {
                  let supplierToPreselect = filterFournisseur;
                  if (!supplierToPreselect) {
                    const articlesForSupply = articles.filter((a) =>
                      selectedArticles.includes(a._id),
                    );
                    const uniqueSuppliers = [
                      ...new Set(
                        articlesForSupply
                          .map((a) => a.fournisseur?._id)
                          .filter(Boolean),
                      ),
                    ];
                    if (uniqueSuppliers.length === 1)
                      supplierToPreselect = uniqueSuppliers[0];
                  }
                  setPreSelectedSupplier(supplierToPreselect);
                  setShowIntelligentSupplyModal(true);
                }}
                className="rounded-pill px-4 shadow-sm"
              >
                <iconify-icon
                  icon="solar:box-up-bold"
                  className="me-2 align-middle"
                ></iconify-icon>
                Approvisionner ({selectedArticles.length})
              </Button>
            </>
          )}
          {userRole === "Admin" && (
            <Button
              variant="outline-warning"
              onClick={handleRenameCategory}
              className="rounded-pill px-4 shadow-sm"
            >
              <iconify-icon
                icon="solar:pen-new-square-bold"
                className="me-2 align-middle"
              ></iconify-icon>
              Renommer une Catégorie
            </Button>
          )}
          {userRole === "Admin" && (
            <Button
              variant="warning"
              onClick={() => setShowAutoPromoModal(true)}
              className="rounded-pill px-4 shadow-sm text-white"
            >
              <iconify-icon
                icon="solar:tag-price-bold-duotone"
                className="me-2 align-middle"
              ></iconify-icon>
              Promo Péremption
            </Button>
          )}
          <Button
            variant="outline-success"
            onClick={handleExportExcel}
            className="rounded-pill px-4 shadow-sm"
          >
            <iconify-icon
              icon="solar:file-spreadsheet-bold"
              className="me-2 align-middle"
            ></iconify-icon>
            Exporter Excel
          </Button>
          <Button
            variant="outline-secondary"
            onClick={handleExportPDF}
            className="rounded-pill px-4 shadow-sm"
          >
            <iconify-icon
              icon="solar:printer-bold"
              class="me-2 align-middle"
            ></iconify-icon>
            Exporter PDF
          </Button>
          {headerActions}
        </div>
      </div>

      {/* --- NAVIGATION : ONGLETS STYLE ODOO --- */}
      <Tabs
        activeKey={activeTab}
        onSelect={(k) => setActiveTab(k)}
        className="mb-4 custom-tabs-odoo"
      >
        <Tab
          eventKey="inventory"
          title={
            <div className="d-flex align-items-center">
              <iconify-icon icon="solar:box-bold" className="me-2" />
              Inventaire Actuel
            </div>
          }
        />
        <Tab
          eventKey="adjustments"
          title={
            <div className="d-flex align-items-center">
              <iconify-icon
                icon="solar:clipboard-remove-bold"
                className="me-2"
              />
              Corrections & Écarts
              {adjustments.filter((a) => a.statut === "EN_ATTENTE").length >
                0 && (
                <Badge bg="danger" pill className="ms-2 pulse-badge">
                  {adjustments.filter((a) => a.statut === "EN_ATTENTE").length}
                </Badge>
              )}
            </div>
          }
        />
        <Tab
          eventKey="receptions"
          title={
            <div className="d-flex align-items-center">
              <iconify-icon
                icon="solar:box-minimalistic-bold-duotone"
                className="me-2"
              />
              {userRole === "Admin" ? "Suivi Transferts" : "Réceptions"}
              {pendingMovements.length > 0 && (
                <Badge bg="warning" text="dark" pill className="ms-2">
                  {pendingMovements.length}
                </Badge>
              )}
            </div>
          }
        />
      </Tabs>

      {/* --- ALERTES DE NOTIFICATION --- */}
      <div className="notification-area">
        {successMessage && (
          <Alert variant="success" className="rounded-4 border-0 shadow-sm">
            {successMessage}
          </Alert>
        )}
        {error && (
          <Alert
            variant="danger"
            onClose={() => setError("")}
            dismissible
            className="rounded-4 border-0 shadow-sm"
          >
            {error}
          </Alert>
        )}
      </div>

      {/* --- CONTENU DES ONGLETS --- */}
      <main className="tab-content-wrapper">
        {/* 1. Onglet : Corrections (Ajustements) */}
        {activeTab === "adjustments" && (
          <AdjustmentsTab
            userRole={userRole}
            adjustments={adjustments}
            adjLoading={adjLoading}
            boutiques={boutiques}
            handleOpenAdjustmentModal={handleOpenAdjustmentModal}
            handleOpenValModal={handleOpenValModal}
            handleImageClick={handleImageClick}
          />
        )}

        {/* 2. Onglet : Réceptions & Logistique */}
        {activeTab === "receptions" && (
          <div className="animate__animated animate__fadeIn">
            <header className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
              <h5 className="fw-bold mb-0">
                {showReceptionHistory
                  ? "Historique des colis acceptés"
                  : userRole === "Admin"
                    ? "Transferts en transit (Attente Gérant)"
                    : "Colis en attente de réception"}
              </h5>

              <div className="d-flex gap-2 align-items-center">
                {userRole === "Admin" && (
                  <Form.Select
                    size="sm"
                    className="rounded-pill shadow-sm border-0 px-3"
                    value={filterReceptionBoutique}
                    onChange={(e) => setFilterReceptionBoutique(e.target.value)}
                    style={{ width: "220px" }}
                  >
                    <option value="">Toutes les destinations</option>
                    {boutiques
                      .filter((b) => b.type !== "Centrale")
                      .map((b) => (
                        <option key={b._id} value={b._id}>
                          {b.nom}
                        </option>
                      ))}
                  </Form.Select>
                )}
                <Button
                  variant={
                    showReceptionHistory ? "primary" : "outline-secondary"
                  }
                  size="sm"
                  className="rounded-pill shadow-sm px-3 d-flex align-items-center gap-2"
                  onClick={() => setShowReceptionHistory(!showReceptionHistory)}
                >
                  <iconify-icon
                    icon={
                      showReceptionHistory
                        ? "solar:box-minimalistic-bold"
                        : "solar:history-bold"
                    }
                  />
                  {showReceptionHistory
                    ? "Voir les colis à recevoir"
                    : "Voir l'historique"}
                </Button>
              </div>
            </header>

            <section className="movement-list">
              {(!showReceptionHistory && pendingMovements.length === 0) ||
              (showReceptionHistory && receivedMovements.length === 0) ? (
                <Alert
                  variant="info"
                  className="border-0 shadow-sm rounded-4 bg-white py-4 text-center"
                >
                  <iconify-icon
                    icon="solar:info-circle-bold"
                    className="fs-2 mb-2 d-block mx-auto text-info"
                  />
                  {showReceptionHistory
                    ? "Aucune réception passée trouvée."
                    : "Tout est à jour ! Aucun colis en attente."}
                </Alert>
              ) : (
                <Row className="g-3">
                  {(showReceptionHistory
                    ? receivedMovements
                    : pendingMovements
                  ).map((mvt) => (
                    <Col md={6} lg={4} key={mvt._id}>
                      <Card
                        className={`border-0 shadow-sm rounded-4 h-100 transition-hover ${showReceptionHistory ? "border-start border-4 border-success" : "border-start border-4 border-warning"}`}
                      >
                        <Card.Body className="p-3 d-flex flex-column">
                          {/* Header du Colis */}
                          <div className="d-flex justify-content-between align-items-start mb-3">
                            <div className="d-flex align-items-center gap-2">
                              <div
                                className={`p-2 rounded-3 ${showReceptionHistory ? "bg-success-subtle text-success" : "bg-warning-subtle text-warning"}`}
                              >
                                <iconify-icon
                                  icon={
                                    showReceptionHistory
                                      ? "solar:check-circle-bold"
                                      : "solar:delivery-bold-duotone"
                                  }
                                  className="fs-4"
                                />
                              </div>
                              <span
                                className="text-uppercase fw-bold text-muted"
                                style={{ fontSize: "0.75rem" }}
                              >
                                #{mvt._id.slice(-6)}
                              </span>
                            </div>
                            <Badge
                              bg={showReceptionHistory ? "success" : "dark"}
                              className="rounded-pill px-3"
                            >
                              {showReceptionHistory
                                ? "REÇU"
                                : userRole === "Admin"
                                  ? "EN TRANSIT"
                                  : "À VÉRIFIER"}
                            </Badge>
                          </div>

                          {/* Flux Logistique */}
                          <div className="logistic-flow p-2 bg-light rounded-3 d-flex align-items-center justify-content-between mb-3 border border-light">
                            <div className="text-center flex-grow-1">
                              <small
                                className="text-muted d-block text-uppercase fw-bold"
                                style={{ fontSize: "0.6rem" }}
                              >
                                De
                              </small>
                              <span className="fw-bold">
                                {mvt.boutiqueSource?.type === 'Centrale' ? "Dépôt Principal" : (mvt.boutiqueSource?.nom || "Dépôt")}
                              </span>
                            </div>
                            <iconify-icon
                              icon="solar:double-alt-arrow-right-bold"
                              className="text-primary fs-5"
                            />
                            <div className="text-center flex-grow-1">
                              <small
                                className="text-muted d-block text-uppercase fw-bold"
                                style={{ fontSize: "0.6rem" }}
                              >
                                Pour
                              </small>
                              <span className="fw-bold text-primary">
                                {mvt.boutiqueDestination?.nom || "Boutique"}
                              </span>
                            </div>
                          </div>

                          {/* Infos Contenu */}
                          <div className="content-info mb-3">
                            <div className="d-flex justify-content-between small mb-2">
                              <span className="text-muted">
                                {mvt.articles.length} articles inclus
                              </span>
                              <span className="fw-bold">
                                {mvt.articles
                                  .reduce(
                                    (acc, a) =>
                                      acc +
                                      a.quantite * (a.prixAchatUnitaire || 0),
                                    0,
                                  )
                                  .toLocaleString()}{" "}
                                GNF
                              </span>
                            </div>

                            {/* Liste des articles en badges */}
                            <div className="d-flex flex-wrap gap-1 mb-2">
                              {mvt.articles.slice(0, 3).map((a, i) => (
                                <Badge
                                  key={i}
                                  bg="white"
                                  text="dark"
                                  className="border fw-normal"
                                >
                                  {a.nomArticle} x{a.quantite}
                                </Badge>
                              ))}
                              {mvt.articles.length > 3 && (
                                <Badge
                                  bg="light"
                                  text="dark"
                                  className="border fw-normal"
                                >
                                  +{mvt.articles.length - 3} de plus
                                </Badge>
                              )}
                            </div>

                            {/* Transporteur & Temps */}
                            {mvt.nomTransporteur && (
                              <div className="small text-muted mb-1">
                                <iconify-icon
                                  icon="solar:delivery-bold"
                                  className="me-1"
                                />
                                Transporteur :{" "}
                                <span className="text-dark fw-medium">
                                  {mvt.nomTransporteur}
                                </span>
                              </div>
                            )}
                            {!showReceptionHistory && (
                              <div
                                className={`small fw-bold mt-2 ${new Date() - new Date(mvt.createdAt) > 172800000 ? "text-danger" : "text-muted"}`}
                              >
                                <iconify-icon
                                  icon="solar:clock-circle-bold"
                                  className="me-1"
                                />
                                Depuis {getTimeElapsed(mvt.createdAt)}
                                {new Date() - new Date(mvt.createdAt) >
                                  172800000 && " (Retard détecté !)"}
                              </div>
                            )}
                          </div>

                          {/* Action Button */}
                          <div className="mt-auto">
                            {showReceptionHistory ? (
                              <Button
                                variant="outline-success"
                                size="sm"
                                className="w-100 rounded-pill fw-bold py-2"
                                onClick={() => {
                                  const items = mvt.articles.map((a) => ({
                                    nomArticle: a.nomArticle,
                                    quantiteAttendue: a.quantite,
                                    quantiteRecue: a.quantite,
                                  }));
                                  handleGenerateReceptionPDF(
                                    mvt,
                                    items,
                                    mvt.details,
                                  );
                                }}
                              >
                                <iconify-icon
                                  icon="solar:printer-bold"
                                  className="me-2"
                                />
                                Réimprimer le reçu
                              </Button>
                            ) : (
                              userRole === 'Gérant' ? (
                                <Button
                                  variant="danger"
                                  size="sm"
                                  className="w-100 rounded-pill fw-bold py-2 shadow-sm"
                                  onClick={() => handleOpenReceptionModal(mvt)}
                                >
                                  <iconify-icon icon="solar:check-read-bold" className="me-2" />
                                  Vérifier & Réceptionner
                                </Button>
                              ) : (
                                <div className="d-flex gap-2">
                                  <Button variant="outline-danger" size="sm" className="rounded-pill flex-grow-1 fw-bold" onClick={() => handleCancelTransfer(mvt._id)}>Annuler</Button>
                                  <Button variant="outline-warning" size="sm" className="rounded-pill flex-grow-1 fw-bold text-dark" onClick={() => handleRemindManager(mvt._id)}>Relancer</Button>
                                </div>
                              )
                            )}
                          </div>
                        </Card.Body>
                      </Card>
                    </Col>
                  ))}
                </Row>
              )}
            </section>
          </div>
        )}

        {/* 3. Onglet : Inventaire Général */}
        {activeTab === "inventory" && (
          <InventoryTab
            {...{
              searchTerm,
              setSearchTerm,
              setCurrentPage,
              userRole,
              boutiqueId,
              boutiques,
              filterBoutique,
              setFilterBoutique,
              centralShopId,
              setFilterFournisseur,
              filterFournisseur,
              setSelectedArticles,
              fournisseurs,
              filterStatus,
              setFilterStatus,
              sortConfig,
              setSortConfig,
              showPromoOnly,
              setShowPromoOnly,
              columns,
              filteredArticles,
              totalPages,
              currentPage,
              handlePageChange,
              renderPaginationItems,
            }}
          />
        )}
      </main>

      {/* --- FENÊTRES MODALES (COMPOSANTS EXTERNES) --- */}
      <ArticleFormModal
        show={showModal}
        onHide={handleCloseModal}
        {...{
          editMode,
          handleSubmit,
          currentArticle,
          setCurrentArticle,
          handleImageChange,
          generateUniqueCode,
          handleChange,
          fieldErrors,
          availableCategories,
          handleAddCategory,
          boutiques,
          fournisseurs,
          userRole,
        }}
      />

      <AdjustmentModals
        {...{
          showAdjustmentModal,
          setShowAdjustmentModal,
          handleAdjustmentSubmit,
          adjustmentFormData,
          setAdjustmentFormData,
          articles,
          handleAdjustmentPhotoChange,
          adjSubmitLoading,
          showValidationModal,
          setShowValidationModal,
          valDecision,
          handleValSubmit,
          selectedAdj,
          valComment,
          setValComment,
          valLoading,
        }}
      />
      {/* Modale de Confirmation de Suppression */}
      <Modal
        show={showDeleteModal}
        onHide={() => setShowDeleteModal(false)}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title className="text-danger">
            ⚠️ Suppression d'Article
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="fw-bold">
            Êtes-vous sûr de vouloir supprimer cet article ?
          </p>
          <Alert variant="warning" className="mb-0 small">
            Cette action est irréversible et supprimera l'article de votre
            inventaire.
          </Alert>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
            Annuler
          </Button>
          <Button variant="danger" onClick={executeDelete}>
            Supprimer définitivement
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Centralisation des modales d'action (Suppression, Promo Auto, Réception) */}
      <ArticleActionModals
        {...{
          showDeleteModal,
          setShowDeleteModal,
          executeDelete,
          showAutoPromoModal,
          setShowAutoPromoModal,
          handleAutoPromoSubmit,
          autoPromoConfig,
          setAutoPromoConfig,
          autoPromoLoading,
          showReceptionModal,
          setShowReceptionModal,
          handleFinalReception,
          selectedMovement,
          receptionItems,
          setReceptionItems,
          globalReceptionComment,
          setGlobalReceptionComment,
          valLoading,
        }}
      />

      {/* Modale d'Approvisionnement Intelligent */}
      <IntelligentSupplyModal
        show={showIntelligentSupplyModal}
        onHide={() => setShowIntelligentSupplyModal(false)}
        onSuccess={handleSupplySuccess}
        articlesToSupply={articles.filter((a) =>
          selectedArticles.includes(a._id),
        )}
        preSelectedFournisseurId={preSelectedSupplier}
      />

      {/* Modale d'aperçu d'image */}
      <ImagePreviewModal
        show={showImageModal}
        onHide={() => setShowImageModal(false)}
        image={previewImage}
      />

      {/* Modale Promo Automatique Péremption */}
      <Modal
        show={showAutoPromoModal}
        onHide={() => setShowAutoPromoModal(false)}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Promotions Automatiques (Anti-Gaspillage)</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleAutoPromoSubmit}>
          <Modal.Body>
            <Alert variant="info" className="small">
              Cette action appliquera automatiquement une promotion sur tous les
              articles dont la date de péremption est proche.
            </Alert>
            <Form.Group className="mb-3">
              <Form.Label>
                Articles expirant dans les prochains (jours) :
              </Form.Label>
              <Form.Control
                type="number"
                min="1"
                value={autoPromoConfig.jours}
                onChange={(e) =>
                  setAutoPromoConfig({
                    ...autoPromoConfig,
                    jours: e.target.value,
                  })
                }
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Appliquer une réduction de (%) :</Form.Label>
              <Form.Control
                type="number"
                min="1"
                max="100"
                value={autoPromoConfig.pourcentage}
                onChange={(e) =>
                  setAutoPromoConfig({
                    ...autoPromoConfig,
                    pourcentage: e.target.value,
                  })
                }
                required
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={() => setShowAutoPromoModal(false)}
            >
              Annuler
            </Button>
            <Button variant="primary" type="submit" disabled={autoPromoLoading}>
              {autoPromoLoading ? (
                <Spinner size="sm" />
              ) : (
                "Appliquer les promotions"
              )}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
};

export default ArticlesView;
