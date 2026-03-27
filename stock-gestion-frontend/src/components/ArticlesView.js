// src/components/ArticlesView.js
// Composant de gestion des articles
// Permet de visualiser, créer, modifier et supprimer les articles
// Affiche les informations sur le stock, les promotions et les remises
// Contient les fonctionnalités d'export PDF et de filtres avancés

import React, { useState, useEffect, useCallback } from 'react';
import { Button, Form, Modal, Alert, Spinner, Badge, Card, OverlayTrigger, Tooltip, Row, Col, Pagination } from 'react-bootstrap';
import TableComponent from './common/Table';
import { articleAPI, boutiqueAPI, fournisseurAPI } from '../services/api';
import IntelligentSupplyModal from './common/IntelligentSupplyModal'; // Importer la nouvelle modale
import { useLocation, useSearchParams } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logo from '../assets/logo.png';

const ArticlesView = ({ userRole, boutiqueId, title, headerActions }) => {
  const [articles, setArticles] = useState([]);
  const [boutiques, setBoutiques] = useState([]);
  const [fournisseurs, setFournisseurs] = useState([]);
  const [centralShopId, setCentralShopId] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation(); // Pour récupérer les données de redirection
  const [filterBoutique, setFilterBoutique] = useState(boutiqueId || '');
  const [searchTerm, setSearchTerm] = useState(''); // État pour la barre de recherche
  const [filterFournisseur, setFilterFournisseur] = useState(''); // Nouvel état pour le filtre fournisseur
  const [showPromoOnly, setShowPromoOnly] = useState(false); // État pour le filtre promo
  const [sortBy, setSortBy] = useState(''); // État pour le tri
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
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
    image: '',
    promo: 0,
    promoActive: false,
    dateDebutPromo: '',
    dateFinPromo: '',
    remise: 0,
    datePeremption: ''
  });

  // États pour la confirmation de suppression
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [articleToDelete, setArticleToDelete] = useState(null);

  // États pour la sélection multiple et l'approvisionnement
  const [selectedArticles, setSelectedArticles] = useState([]);
  const [showIntelligentSupplyModal, setShowIntelligentSupplyModal] = useState(false);
  const [preSelectedSupplier, setPreSelectedSupplier] = useState('');

  // États pour la promo automatique péremption
  const [showAutoPromoModal, setShowAutoPromoModal] = useState(false);
  const [autoPromoConfig, setAutoPromoConfig] = useState({ jours: 7, pourcentage: 20 });
  const [autoPromoLoading, setAutoPromoLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');

    let sortParam = '';
    let orderParam = 'asc';
    if (sortBy === 'datePeremptionAsc') { sortParam = 'datePeremption'; orderParam = 'asc'; }
    else if (sortBy === 'datePeremptionDesc') { sortParam = 'datePeremption'; orderParam = 'desc'; }
    else if (sortBy === 'nomAsc') { sortParam = 'nom'; orderParam = 'asc'; }

    const params = {
      page: currentPage,
      limit: 15,
      search: searchTerm,
      boutique: filterBoutique,
      fournisseur: filterFournisseur,
      sort: sortParam,
      order: orderParam
    };

    try {
        const [articlesRes, boutiquesRes, fournisseursRes] = await Promise.all([
          articleAPI.getAll(params), // API call now accepts params
          userRole === 'Admin' ? boutiqueAPI.getAll() : Promise.resolve({ data: [] }),
          userRole === 'Admin' ? fournisseurAPI.getAll() : Promise.resolve({ data: [] })
        ]);
        
        // Handle paginated response or simple array
        if (articlesRes.data && articlesRes.data.data) {
            setArticles(articlesRes.data.data);
            setTotalPages(articlesRes.data.totalPages);
        } else {
            setArticles(articlesRes.data || []);
            setTotalPages(1);
        }

        setBoutiques(boutiquesRes.data);
        // Identifier la boutique centrale pour la logique de filtrage
        const centrale = boutiquesRes.data.find(b => b.type === 'Centrale');
        if (centrale) {
            setCentralShopId(centrale._id);
        }
        setFournisseurs(fournisseursRes.data);
      } catch (err) {
        setError(err.response?.data?.message || 'Erreur de chargement');
      } finally {
        setLoading(false);
      }
  }, [userRole, currentPage, searchTerm, filterBoutique, filterFournisseur, sortBy]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Effet pour gérer l'ouverture automatique de la modale d'approvisionnement depuis le Dashboard
  useEffect(() => {
    if (location.state?.openSupplyModal && !loading && articles.length > 0) {
        const { articleId, supplierId } = location.state;
        
        if (articleId) {
             const targetArticle = articles.find(a => a._id === articleId);
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
        const openEditId = searchParams.get('openEdit');
        const openSupplyId = searchParams.get('openSupply');

        if (openEditId) {
            const article = articles.find(a => a._id === openEditId);
            if (article) {
                handleShowModal(article);
                // Nettoyer l'URL
                setSearchParams(params => {
                    params.delete('openEdit');
                    return params;
                });
            }
        }
        
        if (openSupplyId) {
             const article = articles.find(a => a._id === openSupplyId);
             if (article) {
                 setSelectedArticles([article._id]);
                 if (article.fournisseur) {
                     setFilterFournisseur(article.fournisseur._id || article.fournisseur);
                 }
                 setShowIntelligentSupplyModal(true);
                 setSearchParams(params => {
                    params.delete('openSupply');
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
        nom: '',
        code: '',
        prixAchat: '',
        prixVente: '',
        quantite: '',
        boutique: '',
        image: '',
        promo: 0,
        promoActive: false,
        dateDebutPromo: '',
        dateFinPromo: '',
        remise: 0,
        datePeremption: ''
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
      [e.target.name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value
    });
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
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
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
          setCurrentArticle({ ...currentArticle, image: compressedBase64 });
        };
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
        boutique: currentArticle.boutique?._id || currentArticle.boutique,
        fournisseur: currentArticle.fournisseur?._id || currentArticle.fournisseur
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
    let finalY = 0;

    // --- 1. EN-TÊTE ---
    doc.addImage(logo, 'PNG', 14, 8, 40, 15);

    doc.setFontSize(18);
    doc.setTextColor(41, 128, 185);
    doc.setFont("helvetica", "bold");
    doc.text(title || "Rapport de Stock", 60, 16);

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Généré le : ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, 60, 22);
    finalY = 35;

    // Calcul des statistiques globales pour le PDF
    const totalArticles = filteredArticles.reduce((acc, curr) => acc + curr.quantite, 0);
    const totalValeurAchat = filteredArticles.reduce((acc, curr) => acc + (curr.prixAchat * curr.quantite), 0);
    const totalValeurVente = filteredArticles.reduce((acc, curr) => acc + (curr.prixVente * curr.quantite), 0);

    // Affichage des résumés dans un cadre
    doc.setFillColor(245, 247, 250);
    doc.setDrawColor(200, 200, 200);
    doc.roundedRect(14, finalY, 182, 25, 2, 2, 'FD');
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
    doc.text(`${(totalValeurAchat.toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' ')}`, 65, finalY + 13);
    
    doc.setFont("helvetica", "normal");
    doc.text(`Valeur Potentielle (Vente) :`, 110, finalY + 13);
    doc.setFont("helvetica", "bold");
    doc.text(`${(totalValeurVente.toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' ')}`, 160, finalY + 13);
    doc.setFont("helvetica", "normal");
    finalY += 30;
    
    const tableColumn = ["Nom", "Code", "Boutique", "P. Achat", "P. Vente", "Qté", "Valeur Stock"];
    const tableRows = [];

    filteredArticles.forEach(article => {
      const valeurStock = article.prixAchat * article.quantite;
      const articleData = [
        article.nom,
        article.code || '-',
        article.boutique?.nom || 'Non assignée',
        (article.prixAchat.toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' '),
        (article.prixVente.toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' '),
        article.quantite,
        (valeurStock.toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' ')
      ];
      tableRows.push(articleData);
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: finalY,
      theme: 'grid',
      styles: { 
        fontSize: 9, 
        cellPadding: 3,
        valign: 'middle',
        lineColor: [220, 220, 220],
        lineWidth: 0.1
      },
      headStyles: { 
        fillColor: [41, 128, 185], 
        textColor: 255, 
        fontStyle: 'bold',
        halign: 'center'
      },
      columnStyles: {
        0: { cellWidth: 'auto' }, // Nom
        1: { cellWidth: 25 }, // Code
        2: { cellWidth: 30 }, // Boutique
        3: { halign: 'right', cellWidth: 28 }, // P. Achat
        4: { halign: 'right', cellWidth: 28 }, // P. Vente
        5: { halign: 'center', cellWidth: 15 }, // Qté
        6: { halign: 'right', fontStyle: 'bold', cellWidth: 30 } // Valeur Stock
      },
      alternateRowStyles: { fillColor: [248, 249, 250] }
    });
    
    // Pied de page avec numérotation
    const pageCount = doc.internal.getNumberOfPages();
    for(let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        const pageSize = doc.internal.pageSize;
        const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
        doc.text(`StockDash - Gestion de Stock`, 14, pageHeight - 10);
        doc.text(`Page ${i} sur ${pageCount}`, pageSize.width - 20, pageHeight - 10, { align: 'right' });
    }

    const fileName = title ? `${title.replace(/\s+/g, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.pdf` : "articles.pdf";
    doc.save(fileName);
  };

  const handleAutoPromoSubmit = async (e) => {
    e.preventDefault();
    setAutoPromoLoading(true);
    setError('');
    try {
        const res = await articleAPI.applyAutoPromo(autoPromoConfig);
        setSuccessMessage(res.data.message);
        setShowAutoPromoModal(false);
        fetchData();
        setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
        setError(err.response?.data?.message || "Erreur lors de l'application des promotions.");
    } finally {
        setAutoPromoLoading(false);
    }
  };

  // Client-side filtering removed/simplified as we now do server-side filtering
  // We still keep the promo filter client-side or we could move it to backend too
  let filteredArticles = articles.filter(article => {
    const matchPromo = !showPromoOnly || (article.promoActive && article.promo > 0);
    return matchPromo;
  });

  const handleSelectAll = (e) => {
    if (e.target.checked) {
        setSelectedArticles(filteredArticles.map(a => a._id));
    } else {
        setSelectedArticles([]);
    }
  };

  const handleSelectOne = (id) => {
    if (selectedArticles.includes(id)) {
        setSelectedArticles(selectedArticles.filter(item => item !== id));
    } else {
        setSelectedArticles([...selectedArticles, id]);
    }
  };

  const columns = [
    ...(filterFournisseur ? [{
      key: 'select',
      label: (
        <Form.Check 
            type="checkbox" 
            onChange={handleSelectAll} 
            checked={filteredArticles.length > 0 && selectedArticles.length === filteredArticles.length}
        />
      ),
      render: (_, article) => <Form.Check type="checkbox" checked={selectedArticles.includes(article._id)} onChange={() => handleSelectOne(article._id)} />
    }] : []),
    {
      key: 'image',
      label: 'Image',
      render: (img) => img ? <img src={img} alt="produit" className="rounded shadow-sm" style={{width: '40px', height: '40px', objectFit: 'cover'}} /> : <div className="bg-light rounded d-flex align-items-center justify-content-center text-muted small" style={{width: '40px', height: '40px'}}><iconify-icon icon="solar:camera-linear"></iconify-icon></div>
    },
    { key: 'code', label: 'Code' },
    { key: 'nom', label: 'Nom' },
    {
      key: 'type',
      label: 'Type',
      render: (type) => type || 'Divers'
    },
    {
      key: 'boutique',
      label: 'Boutique',
      render: (boutique) => {
        if (!boutique) {
          return <Badge bg="secondary">Non assignée</Badge>;
        }
        return (
          <span>
            {boutique.nom} {boutique.type === 'Centrale' && <Badge bg="primary" pill className="ms-2">Principal</Badge>}
          </span>
        );
      }
    },
    // La colonne Fournisseur est visible uniquement pour l'Admin
    ...(userRole === 'Admin' ? [{
        key: 'fournisseur',
        label: 'Fournisseur',
        render: (fournisseur) => {
            if (!fournisseur) {
                return <Badge bg="secondary">Non spécifié</Badge>;
            }
            return (
                <span>
                    {fournisseur.nom}
                </span>
            );
        }
    }] : []),
    {
      key: 'promo',
      label: 'Promo/Remise',
      render: (_, article) => {
        if (article.promoActive && article.promo > 0) return <Badge bg="danger">Promo -{article.promo}%</Badge>;
        if (article.remise > 0) return <Badge bg="warning" text="dark">Remise -{article.remise}%</Badge>;
        if (article.remiseEnAttente?.valeur > 0) return <Badge bg="info">Demande: {article.remiseEnAttente.valeur}%</Badge>;
        return '-';
      }
    },
    {
      key: 'dateFinPromo',
      label: 'Fin Promo',
      render: (date, article) => {
        if (article.promoActive && article.promo > 0 && date) {
          return new Date(date).toLocaleDateString('fr-FR');
        }
        return '-';
      }
    },
    { 
      key: 'datePeremption',
      label: 'Péremption',
      render: (date) => {
        if (!date) return '-';
        const d = new Date(date);
        const now = new Date();
        const diffTime = d - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        let badgeBg = 'success';
        if (diffDays < 0) badgeBg = 'danger'; // Périmé
        else if (diffDays <= 30) badgeBg = 'warning'; // Bientôt périmé

        return <Badge bg={badgeBg}>{d.toLocaleDateString('fr-FR')}</Badge>;
      }
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
      render: (_, article) => (
        <div className="d-flex gap-2">
          {userRole === 'Admin' && (
            <>
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
            </>
          )}
        </div>
      )
    }
  ];

  // Function to handle page change
  const handlePageChange = (pageNumber) => {
      setCurrentPage(pageNumber);
  };

  // Pagination Items
  let paginationItems = [];
  for (let number = 1; number <= totalPages; number++) {
    paginationItems.push(
      <Pagination.Item key={number} active={number === currentPage} onClick={() => handlePageChange(number)}>
        {number}
      </Pagination.Item>,
    );
  }

  const handleSupplySuccess = () => {
    setSuccessMessage("Approvisionnement enregistré avec succès !");
    setShowIntelligentSupplyModal(false);
    setSelectedArticles([]);
    fetchData();
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  if (loading) return <Spinner animation="border" />;

  return (
    <div className="p-4">
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
        <h3 className="fw-bold mb-0 text-body">{title || 'Gestion des Articles'}</h3>
        <div className="d-flex flex-wrap gap-2">
            {selectedArticles.length > 0 && userRole === 'Admin' && (
              <>
                  <Button variant="success" onClick={() => {
                      let supplierToPreselect = filterFournisseur;
                      if (!supplierToPreselect) {
                          const articlesForSupply = articles.filter(a => selectedArticles.includes(a._id));
                          const uniqueSuppliers = [...new Set(articlesForSupply.map(a => a.fournisseur?._id).filter(Boolean))];
                          if (uniqueSuppliers.length === 1) supplierToPreselect = uniqueSuppliers[0];
                      }
                      setPreSelectedSupplier(supplierToPreselect);
                      setShowIntelligentSupplyModal(true);
                  }} className="rounded-pill px-4 shadow-sm">
                      <iconify-icon icon="solar:box-up-bold" className="me-2 align-middle"></iconify-icon>
                      Approvisionner ({selectedArticles.length})
                  </Button>
              </>
            )}
            {userRole === 'Admin' && (
                <Button variant="warning" onClick={() => setShowAutoPromoModal(true)} className="rounded-pill px-4 shadow-sm text-white">
                    <iconify-icon icon="solar:tag-price-bold-duotone" className="me-2 align-middle"></iconify-icon>
                    Promo Péremption
                </Button>
            )}
            <Button variant="outline-secondary" onClick={handleExportPDF} className="rounded-pill px-4 shadow-sm">
                <iconify-icon icon="solar:printer-bold" class="me-2 align-middle"></iconify-icon>
                Exporter PDF
            </Button>
            {headerActions}
        </div>
      </div>

      {/* Filtres */}
      <Row className="mb-4 align-items-center g-3">
        <Col md={3}>
          <Form.Control
            type="text"
            placeholder="Rechercher par nom ou code..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          />
        </Col>
        {userRole === 'Admin' && !boutiqueId && (
          <Col md={filterBoutique === centralShopId ? 2 : 3}>
            <Form.Select 
              value={filterBoutique} 
              onChange={(e) => {
                setFilterBoutique(e.target.value);
                // Si on sélectionne une boutique autre que la centrale, on réinitialise le filtre fournisseur.
                if (e.target.value !== centralShopId) {
                    setFilterFournisseur('');
                }
                setCurrentPage(1);
              }}
            >
              <option value="">Toutes les boutiques</option>
              {boutiques.map(boutique => (
                <option key={boutique._id} value={boutique._id}>{boutique.nom}</option>
              ))}
            </Form.Select>
          </Col>
        )}
        {/* Le filtre par fournisseur est visible si on est admin ET soit sur la page centrale, soit on a sélectionné la centrale */}
        {userRole === 'Admin' && (boutiqueId === centralShopId || filterBoutique === centralShopId) && (
          <Col md={3}>
            <Form.Select 
              value={filterFournisseur} 
              onChange={(e) => {
                setFilterFournisseur(e.target.value);
                setSelectedArticles([]);
                setCurrentPage(1);
              }}
            >
              <option value="">Tous les fournisseurs</option>
              {fournisseurs.map(fournisseur => (
                <option key={fournisseur._id} value={fournisseur._id}>{fournisseur.nom}</option>
              ))}
            </Form.Select>
          </Col>
        )}
        <Col md={filterBoutique === centralShopId ? 2 : 3}>
            <Form.Select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="">Tri par défaut</option>
              <option value="datePeremptionAsc">Péremption (Plus proche)</option>
              <option value="datePeremptionDesc">Péremption (Plus lointaine)</option>
              <option value="boutiqueAsc">Boutique (A-Z)</option>
              <option value="boutiqueDesc">Boutique (Z-A)</option>
            </Form.Select>
        </Col>
        <Col md="auto">
          <Form.Check 
            type="switch"
            id="promo-filter-switch"
            label="Promotions uniquement"
            checked={showPromoOnly}
            onChange={(e) => setShowPromoOnly(e.target.checked)}
            className="fw-medium"
          />
        </Col>
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
          {totalPages > 1 && (
            <div className="d-flex justify-content-center py-3">
                <Pagination>
                    <Pagination.First onClick={() => handlePageChange(1)} disabled={currentPage === 1} />
                    <Pagination.Prev onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} />
                    {paginationItems.slice(Math.max(0, currentPage - 3), Math.min(totalPages, currentPage + 2))} 
                    <Pagination.Next onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} />
                    <Pagination.Last onClick={() => handlePageChange(totalPages)} disabled={currentPage === totalPages} />
                </Pagination>
            </div>
          )}
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
              <Form.Control type="file" accept="image/*" capture="environment" onChange={handleImageChange} />
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
              <Form.Label>Type de produit</Form.Label>
              <Form.Control
                type="text"
                name="type"
                value={currentArticle.type}
                onChange={handleChange}
                placeholder="Ex: Boisson, Ciment..."
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
              <Form.Label>Fournisseur</Form.Label>
              <Form.Select
                name="fournisseur"
                value={currentArticle.fournisseur?._id || currentArticle.fournisseur || ''}
                onChange={handleChange}
                disabled={userRole !== 'Admin'}
              >
                <option value="">Sélectionner un fournisseur</option>
                {fournisseurs.map(fournisseur => (
                  <option key={fournisseur._id} value={fournisseur._id}>
                    {fournisseur.nom}
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
                disabled={editMode}
                min="0"
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Date de péremption (Optionnel)</Form.Label>
              <Form.Control
                type="date"
                name="datePeremption"
                value={currentArticle.datePeremption ? currentArticle.datePeremption.split('T')[0] : ''}
                onChange={handleChange}
              />
            </Form.Group>

            {/* Section Promotion & Remise (Admin Uniquement) */}
            {userRole === 'Admin' && (
              <div className="border-top pt-3 mt-3">
                <h6 className="text-primary mb-3">Gestion Promotions & Remises</h6>
                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Promotion (%)</Form.Label>
                      <Form.Control
                        type="number"
                        name="promo"
                        value={currentArticle.promo}
                        onChange={handleChange}
                        min="0"
                        max="100"
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6} className="d-flex align-items-center">
                    <Form.Check 
                      type="switch"
                      id="promo-switch"
                      label="Activer la promotion"
                      name="promoActive"
                      checked={currentArticle.promoActive}
                      onChange={handleChange}
                      className="mt-3"
                    />
                  </Col>
                </Row>
                {currentArticle.promoActive && (
                  <Row className="mb-3">
                    <Col md={6}>
                      <Form.Label>Date début</Form.Label>
                      <Form.Control type="date" name="dateDebutPromo" value={currentArticle.dateDebutPromo ? currentArticle.dateDebutPromo.split('T')[0] : ''} onChange={handleChange} />
                    </Col>
                    <Col md={6}>
                      <Form.Label>Date fin</Form.Label>
                      <Form.Control type="date" name="dateFinPromo" value={currentArticle.dateFinPromo ? currentArticle.dateFinPromo.split('T')[0] : ''} onChange={handleChange} />
                    </Col>
                  </Row>
                )}
                <Form.Group className="mb-3">
                  <Form.Label>
                    Remise exceptionnelle (%) 
                    {currentArticle.remiseEnAttente?.valeur > 0 && (
                        <span className="ms-2">
                            <Badge bg="success" className="me-1"
                                onClick={() => setCurrentArticle({
                                    ...currentArticle, 
                                    remise: currentArticle.remiseEnAttente.valeur,
                                    remiseEnAttente: null // On applique la remise et on vide la demande
                                })}
                                style={{cursor: 'pointer'}}
                                title="Accepter la demande"
                            >
                                <iconify-icon icon="solar:check-circle-bold" className="me-1 align-middle"></iconify-icon>
                                Accepter {currentArticle.remiseEnAttente.valeur}%
                            </Badge>
                            <Badge bg="danger" 
                                onClick={() => setCurrentArticle({
                                    ...currentArticle, 
                                    remiseEnAttente: null // On vide la demande SANS changer la remise actuelle -> Refus
                                })}
                                style={{cursor: 'pointer'}}
                                title="Refuser la demande"
                            >
                                <iconify-icon icon="solar:close-circle-bold" className="me-1 align-middle"></iconify-icon>
                                Refuser
                            </Badge>
                            {currentArticle.remiseEnAttente.clientNom && <small className="text-muted ms-1">({currentArticle.remiseEnAttente.clientNom})</small>}
                        </span>
                    )}
                  </Form.Label>
                  <Form.Control
                    type="number"
                    name="remise"
                    value={currentArticle.remise}
                    onChange={handleChange}
                    min="0"
                    max="100"
                    placeholder="Saisir pour valider une remise"
                  />
                  <Form.Text className="text-muted">Une remise s'applique si aucune promotion n'est active.</Form.Text>
                </Form.Group>
              </div>
            )}
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

      {/* Modale d'Approvisionnement Intelligent */}
      <IntelligentSupplyModal 
        show={showIntelligentSupplyModal}
        onHide={() => setShowIntelligentSupplyModal(false)}
        onSuccess={handleSupplySuccess}
        articlesToSupply={articles.filter(a => selectedArticles.includes(a._id))}
        preSelectedFournisseurId={preSelectedSupplier}
      />

      {/* Modale Promo Automatique Péremption */}
      <Modal show={showAutoPromoModal} onHide={() => setShowAutoPromoModal(false)} centered>
        <Modal.Header closeButton>
            <Modal.Title>Promotions Automatiques (Anti-Gaspillage)</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleAutoPromoSubmit}>
            <Modal.Body>
                <Alert variant="info" className="small">
                    Cette action appliquera automatiquement une promotion sur tous les articles dont la date de péremption est proche.
                </Alert>
                <Form.Group className="mb-3">
                    <Form.Label>Articles expirant dans les prochains (jours) :</Form.Label>
                    <Form.Control 
                        type="number" 
                        min="1" 
                        value={autoPromoConfig.jours} 
                        onChange={e => setAutoPromoConfig({...autoPromoConfig, jours: e.target.value})} 
                        required 
                    />
                </Form.Group>
                <Form.Group className="mb-3">
                    <Form.Label>Appliquer une réduction de (%) :</Form.Label>
                    <Form.Control 
                        type="number" 
                        min="1" max="100" 
                        value={autoPromoConfig.pourcentage} 
                        onChange={e => setAutoPromoConfig({...autoPromoConfig, pourcentage: e.target.value})} 
                        required 
                    />
                </Form.Group>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={() => setShowAutoPromoModal(false)}>Annuler</Button>
                <Button variant="primary" type="submit" disabled={autoPromoLoading}>
                    {autoPromoLoading ? <Spinner size="sm" /> : 'Appliquer les promotions'}
                </Button>
            </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
};

export default ArticlesView;
