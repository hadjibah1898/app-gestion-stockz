// src/components/Dashboard.js
// Tableau de bord principal pour les administrateurs
// Affiche les statistiques clés, les graphiques et les raccourcis vers les fonctionnalités principales
// Permet de visualiser rapidement l'état du stock et les performances

import React, { useState, useEffect, useCallback } from 'react';
import { Row, Col, Card, Alert, Table, Badge, Button, Pagination, Placeholder, Toast, ToastContainer, Modal, Form, Spinner } from 'react-bootstrap';
import Chart from 'react-apexcharts';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { dashboardAPI, articleAPI, venteAPI } from '../services/api'; // Import the new API
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './Dashboard.css';
import { boutiqueAPI } from '../services/api'; // Import boutiqueAPI

// Helper to format currency
const formatCurrency = (value) => {
  if (typeof value !== 'number') return '...';
  // Remplace les espaces insécables par des espaces normaux pour le support PDF
  return (value.toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' ');
};

// --- Composants Modernes UI ---

// 1. Carte avec effet de survol (Micro-interaction)
const HoverCard = ({ children, className = "", style = {}, ...props }) => {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <Card 
      className={`border-0 shadow-sm ${className}`}
      style={{ 
        ...style,
        transform: isHovered ? 'translateY(-5px)' : 'translateY(0)',
        transition: 'transform 0.3s ease, box-shadow 0.3s ease',
        boxShadow: isHovered ? '0 1rem 3rem rgba(0,0,0,.175) !important' : '0 .125rem .25rem rgba(0,0,0,.075)'
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...props}
    >
      {children}
    </Card>
  );
};

// 2. Squelette de chargement (Perceived Performance)
const DashboardSkeleton = () => (
  <div className="dashboard-content p-4">
    {/* Banner Skeleton */}
    <Card className="border-0 mb-4 shadow-sm" style={{ height: '200px', backgroundColor: '#e9ecef' }}>
      <Card.Body className="p-4 d-flex flex-column justify-content-center">
        <Placeholder as="h2" animation="glow"><Placeholder xs={6} /></Placeholder>
        <Placeholder as="p" animation="glow"><Placeholder xs={4} /> <Placeholder xs={3} /></Placeholder>
      </Card.Body>
    </Card>
    {/* Stats Skeleton */}
    <Row className="mb-4 g-4">
      {[1, 2, 3].map(i => (
        <Col md={4} key={i}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body className="p-4">
              <Placeholder as="div" animation="glow" className="d-flex align-items-center">
                 <Placeholder xs={3} style={{ height: '50px', width: '50px' }} className="rounded-circle me-3" />
                 <div className="w-100">
                    <Placeholder xs={5} />
                    <Placeholder xs={8} size="lg" />
                 </div>
              </Placeholder>
            </Card.Body>
          </Card>
        </Col>
      ))}
    </Row>
    {/* Charts Skeleton */}
    <Row className="g-4">
        <Col lg={8}><Card className="border-0 shadow-sm" style={{height: '400px'}}><Card.Body><Placeholder animation="glow" className="w-100 h-100" /></Card.Body></Card></Col>
        <Col lg={4}><Card className="border-0 shadow-sm" style={{height: '400px'}}><Card.Body><Placeholder animation="glow" className="w-100 h-100" /></Card.Body></Card></Col>
    </Row>
  </div>
);

const Dashboard = () => {
  const { theme } = useOutletContext(); // Récupération du thème (light/dark)
  const [searchParams, setSearchParams] = useSearchParams();
  const [stats, setStats] = useState(null);
  const [lowStockArticles, setLowStockArticles] = useState([]);
  const [allArticles, setAllArticles] = useState([]); // Nouvel état pour stocker tous les articles
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ show: false, message: '', variant: 'light' });
  const [timeRange, setTimeRange] = useState('monthly'); // 1. Ajouter l'état pour le filtre
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5; // Nombre d'articles par page
  
  // États pour le transfert rapide
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferData, setTransferData] = useState({ sourceId: '', targetId: '', articleId: '', articleName: '', maxQuantity: 0, availableStock: 0 });
  const [transferQuantity, setTransferQuantity] = useState(1);
  const [transferLoading, setTransferLoading] = useState(false);
  const [centralShopId, setCentralShopId] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Pour rafraîchir les données après action

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        // On récupère aussi l'historique des ventes pour corriger les calculs côté client (exclusion des annulés)
        const [statsRes, articlesRes, ventesRes, boutiquesRes] = await Promise.all([
          dashboardAPI.getStats({ range: timeRange }),
          articleAPI.getAll(),
          venteAPI.getHistorique(),
          boutiqueAPI.getAll()
        ]);
        
        let statsData = statsRes.data || {};
        const fetchedArticles = articlesRes.data || [];
        const allVentes = ventesRes.data || [];
        const allBoutiques = boutiquesRes.data || [];
        
        // Identifier la boutique centrale
        const centrale = allBoutiques.find(b => b.type === 'Centrale');
        if (centrale) setCentralShopId(centrale._id);

        // --- CORRECTIF : Recalcul des stats en excluant les ventes annulées ---
        if (allVentes.length > 0) {
            const validSales = allVentes.filter(v => !v.isCancelled);
            const today = new Date().toISOString().split('T')[0];
            const todaySales = validSales.filter(v => v.createdAt.startsWith(today));

            statsData.dailySales = todaySales.reduce((acc, v) => acc + v.prixTotal, 0);
            statsData.dailyOrders = todaySales.length;
            statsData.totalCA = validSales.reduce((acc, v) => acc + v.prixTotal, 0);
            statsData.totalVentes = validSales.length;
            statsData.totalBenefice = validSales.reduce((acc, v) => {
                const prixAchat = v.article?.prixAchat || 0;
                return acc + (v.prixTotal - (prixAchat * v.quantite));
            }, 0);
        }
        
        setStats(statsData);
        setAllArticles(fetchedArticles); // Sauvegarder tous les articles pour la recherche ultérieure
        
        // Calcul du stock faible (seuil arbitraire à 10 unités)
        const lowStockItems = fetchedArticles.filter(a => a.quantite <= 10);
        setLowStockArticles(lowStockItems);
        
      } catch (err) {
        setToast({ show: true, message: err.response?.data?.message || "Erreur lors du chargement des statistiques du tableau de bord.", variant: 'danger' });
        // Use some fallback data so the page doesn't crash
        setStats({
          dailySales: 0, dailyOrders: 0, totalCA: 0, totalRefunds: 0, totalBenefice: 0,
          salesProfit: { categories: [], series: [] },
          productSales: { labels: [], series: [] },
          performanceBoutiques: [],
          performanceGerants: [],
          stockBoutiques: []
        });
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [timeRange, refreshTrigger]); // Redéclencher si le filtre change OU si une action est effectuée

  // Couleurs dynamiques selon le thème
  const textColor = theme === 'dark' ? '#cdd9e5' : '#373d3f';
  const gridColor = theme === 'dark' ? '#444c56' : '#f1f1f1';
  const cardBg = theme === 'dark' ? '#22272e' : '#ffffff';

  // Chart configurations now depend on state
  const salesChartOptions = {
    chart: { type: 'area', toolbar: { show: false }, fontFamily: 'inherit', foreColor: textColor },
    colors: ['#0d6efd', '#a7e05f'],
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 2 },
    fill: { 
      type: 'gradient', 
      gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] } 
    },
    xaxis: { categories: stats?.salesProfit?.categories || [] },
    tooltip: { theme: theme },
    grid: { borderColor: gridColor }
  };
  
  const productChartOptions = {
    chart: { type: 'donut', fontFamily: 'inherit', foreColor: textColor },
    labels: stats?.productSales?.labels || [],
    colors: ['#0d6efd', '#198754', '#ffc107'],
    plotOptions: {
      pie: {
        donut: {
          size: '75%',
          labels: { 
            show: true, 
            total: { show: true, label: 'Total', color: textColor, fontSize: '16px', fontWeight: 600 },
            value: { color: textColor }
          }
        }
      }
    },
    dataLabels: { enabled: false },
    legend: { position: 'bottom' },
    stroke: { show: true, colors: [cardBg], width: 2 } // Bordure pour séparer les segments
  };

  // Logique de pagination
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentLowStockArticles = lowStockArticles.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(lowStockArticles.length / itemsPerPage);

  const handleExportPDF = () => {
    const doc = new jsPDF();
    
    // En-tête
    doc.setFillColor(41, 128, 185);
    doc.rect(0, 0, 210, 25, 'F');
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text("Rapport Tableau de Bord Admin", 14, 16);
    doc.setFontSize(10);
    doc.setTextColor(220, 220, 220);
    doc.text(`Généré le : ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, 14, 22);

    // Stats Globales Box
    doc.setFillColor(245, 247, 250);
    doc.setDrawColor(200, 200, 200);
    doc.roundedRect(14, 30, 182, 30, 2, 2, 'FD');

    doc.setFontSize(10);
    doc.setTextColor(50);
    
    doc.text(`Chiffre d'affaires :`, 20, 40);
    doc.setFont("helvetica", "bold");
    doc.text(`${formatCurrency(stats?.totalCA)}`, 60, 40);
    
    doc.setFont("helvetica", "normal");
    doc.text(`Bénéfice Net :`, 110, 40);
    doc.setFont("helvetica", "bold");
    doc.text(`${formatCurrency(stats?.totalBenefice)}`, 150, 40);

    doc.setFont("helvetica", "normal");
    doc.text(`Total Ventes :`, 20, 50);
    doc.setFont("helvetica", "bold");
    doc.text(`${stats?.totalVentes}`, 60, 50);

    let finalY = 70;

    // Performance Boutiques
    if (stats?.performanceBoutiques?.length > 0) {
        doc.setFontSize(14);
        doc.setTextColor(41, 128, 185);
        doc.text("Performance par Boutique", 14, finalY);
        autoTable(doc, {
            startY: finalY + 5,
            head: [['Boutique', 'CA']],
            body: stats.performanceBoutiques.map(b => [b.nom, formatCurrency(b.chiffreAffaires)]),
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185] },
            alternateRowStyles: { fillColor: [248, 249, 250] }
        });
        finalY = doc.lastAutoTable.finalY + 15;
    }

    // Stock Faible
    if (lowStockArticles.length > 0) {
        doc.setFontSize(14);
        doc.setTextColor(220, 53, 69); // Rouge pour l'alerte
        doc.text("Alerte Stock Faible", 14, finalY);
        autoTable(doc, {
            startY: finalY + 5,
            head: [['Article', 'Boutique', 'Quantité']],
            body: lowStockArticles.map(a => [a.nom, a.boutique?.nom || 'N/A', a.quantite]),
            theme: 'grid',
            headStyles: { fillColor: [220, 53, 69] },
            alternateRowStyles: { fillColor: [255, 245, 245] }
        });
    }

    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for(let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        const pageSize = doc.internal.pageSize;
        const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
        doc.text(`StockDash - Admin`, 14, pageHeight - 10);
        doc.text(`Page ${i} sur ${pageCount}`, pageSize.width - 20, pageHeight - 10, { align: 'right' });
    }

    doc.save("dashboard_admin.pdf");
  };

  const handleLowStockAction = useCallback((article) => {
    // Si c'est une boutique secondaire, on propose un transfert depuis la centrale
    if (article.boutique && article.boutique.type !== 'Centrale' && centralShopId) {
        // Trouver l'article correspondant dans la centrale pour connaître son stock
        const centralArticle = allArticles.find(a => 
            (a.boutique?._id === centralShopId) && 
            a.nom === article.nom
        );
        const availableStock = centralArticle ? centralArticle.quantite : 0;

        setTransferData({
            sourceId: centralShopId,
            targetId: article.boutique._id,
            articleId: article._id, // Note: L'ID de l'article dans la boutique secondaire
            articleName: article.nom,
            // On ne connaît pas la quantité dispo en centrale ici sans refaire une requête, 
            // mais le backend validera. On met une valeur indicative ou on laisse l'utilisateur saisir.
            availableStock: availableStock
        });
        setTransferQuantity(10); // Valeur par défaut pour le réapprovisionnement
        setShowTransferModal(true);
    } else {
        // Sinon (Centrale ou indéfini), on redirige vers l'approvisionnement fournisseur
        // Redirection gérée par le Link dans le JSX
    }
  }, [allArticles, centralShopId]);

  // Effet pour gérer l'ouverture automatique de la modale de transfert via notification
  useEffect(() => {
    const openTransferId = searchParams.get('openTransfer');
    if (openTransferId && !loading && allArticles.length > 0) {
        const article = allArticles.find(a => a._id === openTransferId);
        if (article) {
            handleLowStockAction(article);
            // Nettoyer l'URL pour éviter la réouverture au rafraîchissement
            setSearchParams(params => {
                params.delete('openTransfer');
                return params;
            });
        }
    }
  }, [loading, allArticles, searchParams, setSearchParams, handleLowStockAction]);

  const confirmTransfer = async (e) => {
    e.preventDefault();
    const qty = parseInt(transferQuantity);
    if (isNaN(qty) || qty <= 0) {
        setToast({ show: true, message: "Veuillez saisir une quantité valide (supérieure à 0).", variant: 'warning' });
        return;
    }

    setTransferLoading(true);
    try {
        // On utilise la route de réapprovisionnement (restock) qui gère le transfert Centrale -> Secondaire
        const res = await articleAPI.restock({
            targetId: transferData.targetId,
            articles: [{ articleId: transferData.articleId, quantite: qty }]
        });
        setToast({ show: true, message: res.data.message, variant: 'success' });
        setShowTransferModal(false);
        setRefreshTrigger(prev => prev + 1); // Rafraîchir le dashboard
    } catch (err) {
        setToast({ show: true, message: err.response?.data?.message || "Erreur lors du transfert.", variant: 'danger' });
    } finally {
        setTransferLoading(false);
    }
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="dashboard-content p-4 position-relative">
      <ToastContainer position="top-end" className="p-3" style={{ zIndex: 9999, position: 'fixed' }}>
        <Toast onClose={() => setToast({ ...toast, show: false })} show={toast.show} delay={5000} autohide bg={toast.variant}>
          <Toast.Header>
            <strong className="me-auto">Notification</strong>
          </Toast.Header>
          <Toast.Body className={toast.variant === 'danger' ? 'text-white' : ''}>{toast.message}</Toast.Body>
        </Toast>
      </ToastContainer>

      {/* A. La Bannière de Bienvenue */}
      <Card className="welcome-banner border-0 mb-4 text-white overflow-hidden">
        <Card.Body className="p-4 d-flex align-items-center justify-content-between position-relative">
          <div className="z-1 position-relative w-100">
            <div className="d-flex flex-wrap align-items-center gap-3 mb-2">
                <h2 className="fw-bold mb-0">Bienvenue sur votre Dashboard ! 👋</h2>
                <Button variant="light" size="sm" onClick={handleExportPDF} className="text-primary fw-bold shadow-sm">
                    <iconify-icon icon="solar:printer-bold" className="me-2 align-middle"></iconify-icon>
                    Exporter Rapport
                </Button>
            </div>
            <p className="mb-4 opacity-75" style={{ maxWidth: '600px' }}>
              Voici un aperçu de vos performances aujourd'hui. Consultez les statistiques ci-dessous pour plus de détails.
            </p>
            <div className="d-flex flex-wrap gap-4">
              <div className="glass-stat p-2 px-3 rounded-3">
                <h4 className="mb-0 fw-bold">{formatCurrency(stats?.dailySales)}</h4>
                <small className="opacity-75">Ventes du jour</small>
              </div>
              <div className="glass-stat p-2 px-3 rounded-3">
                <h4 className="mb-0 fw-bold">{stats?.dailyOrders || 0}</h4>
                <small className="opacity-75">Commandes</small>
              </div>
            </div>
          </div>
          <div className="illustration-placeholder d-none d-md-block">
             {/* Icône décorative style 3D */}
             <iconify-icon icon="solar:rocket-2-bold-duotone" style={{ fontSize: '180px', opacity: '0.9', transform: 'rotate(-15deg)' }}></iconify-icon>
          </div>
        </Card.Body>
      </Card>

      {/* B. Les Cartes de Statistiques */}
      <Row className="mb-4 g-4">
        {[
          { title: "Chiffre d'affaires", value: formatCurrency(stats?.totalCA), icon: 'solar:bag-smile-bold-duotone', color: 'primary', trend: 'Global', trendColor: 'primary' },
          { title: 'Bénéfice', value: formatCurrency(stats?.totalBenefice), icon: 'solar:wallet-money-bold-duotone', color: 'success', trend: 'Net', trendColor: 'success' },
          { title: 'Alerte Stock Faible', value: `${lowStockArticles.length} articles`, icon: 'solar:box-minimalistic-bold-duotone', color: 'danger', trend: '< 10 unités', trendColor: 'danger' },
        ].map((stat, idx) => (
          <Col md={4} key={idx}>
            <HoverCard className="h-100">
              <Card.Body className="d-flex align-items-center p-4">
                <div className={`icon-box bg-${stat.color}-subtle text-${stat.color} rounded-circle d-flex align-items-center justify-content-center me-3`}>
                  <iconify-icon icon={stat.icon} style={{ fontSize: '28px' }}></iconify-icon>
                </div>
                <div>
                  <h6 className="text-muted mb-1 fs-14">{stat.title}</h6>
                  <h4 className="fw-bold mb-0 d-flex align-items-center">
                    {stat.value}
                    {/* La tendance est statique pour le moment, elle peut être rendue dynamique si l'API la fournit */}
                    <span className={`badge bg-${stat.trendColor}-subtle text-${stat.trendColor} fs-12 ms-2 rounded-pill fw-medium`}>
                      {stat.trend}
                    </span>
                  </h4>
                </div>
              </Card.Body>
            </HoverCard>
          </Col>
        ))}
      </Row>

      {/* C. & D. Graphiques */}
      <Row className="g-4">
        <Col lg={8}>
          <Card className="border-0 shadow-sm h-100 rounded-4">
            <Card.Body className="p-4">
              <div className="d-flex justify-content-between align-items-center mb-4">
                <h5 className="fw-bold mb-0">Analyse des Ventes</h5>
                {/* 2. Lier l'état au select */}
                <select 
                  className="form-select form-select-sm w-auto border-0 bg-body-tertiary fw-medium"
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value)}
                >
                  <option value="monthly">Ce mois</option>
                  <option value="yearly">Cette année</option>
                </select>
              </div>
              <Chart options={salesChartOptions} series={stats?.salesProfit?.series || []} type="area" height={350} />
            </Card.Body>
          </Card>
        </Col>
        <Col lg={4}>
          <Card className="border-0 shadow-sm h-100 rounded-4">
            <Card.Body className="p-4">
              <h5 className="fw-bold mb-4">Articles les plus vendus</h5>
              <Chart options={productChartOptions} series={stats?.productSales?.series || []} type="donut" height={320} />
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* G. État du Stock par Boutique (Nouveau) */}
      <Row className="mt-4 g-4">
        <Col lg={12}>
          {/* E. Liste des articles en stock faible */}
          <Card className="border-0 shadow-sm h-100 rounded-4">
            <Card.Header className="bg-body py-3 d-flex justify-content-between align-items-center">
              <h5 className="fw-bold mb-0">Articles en Stock Faible (≤ 10 unités)</h5>
              {lowStockArticles.length > 0 && <Badge bg="danger-subtle" text="danger" pill>{lowStockArticles.length} articles concernés</Badge>}
            </Card.Header>
            <Card.Body className="p-0">
              {lowStockArticles.length > 0 ? (
                <>
                <Table responsive hover className="align-middle mb-0">
                  <thead>
                    <tr>
                      <th className="ps-4 border-0">Article</th>
                      <th className="border-0">Boutique</th>
                      <th className="text-center border-0">Quantité Restante</th>
                      <th className="text-end pe-4 border-0">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentLowStockArticles.map(article => (
                      <tr key={article._id}>
                        <td className="ps-4"><span className="fw-bold">{article.nom}</span></td>
                        <td>{article.boutique?.nom || <Badge bg="secondary">Non assignée</Badge>}</td>
                        <td className="text-center"><Badge bg="danger" pill>{article.quantite}</Badge></td>
                        <td className="text-end pe-4">
                          {article.boutique && article.boutique.type !== 'Centrale' && centralShopId ? (
                              <Button 
                                variant="outline-success" 
                                size="sm"
                                onClick={() => handleLowStockAction(article)}
                              >
                                Transférer
                              </Button>
                          ) : (
                              <Button 
                                as={Link} 
                                to="/admin/articles" 
                                state={{ 
                                    openSupplyModal: true, 
                                    articleId: article._id, 
                                    supplierId: article.fournisseur?._id 
                                }}
                                variant="outline-primary" 
                                size="sm"
                              >
                                Approvisionner
                              </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                {totalPages > 1 && (
                  <div className="d-flex justify-content-center p-3 border-top">
                    <Pagination size="sm" className="mb-0">
                      <Pagination.Prev onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} />
                      {[...Array(totalPages)].map((_, idx) => (
                        <Pagination.Item key={idx + 1} active={idx + 1 === currentPage} onClick={() => setCurrentPage(idx + 1)}>
                          {idx + 1}
                        </Pagination.Item>
                      ))}
                      <Pagination.Next onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} />
                    </Pagination>
                  </div>
                )}
                </>
              ) : (
                <Alert variant="success" className="m-4 text-center">Aucun article en stock faible pour le moment. Excellent travail !</Alert>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* F. Performances par Boutique et Gérant */}
      <Row className="mt-4">
        <Col lg={12}>
          <Card className="border-0 shadow-sm h-100 rounded-4">
            <Card.Header className="bg-body py-3">
              <h5 className="fw-bold mb-0">Performance par Gérant et Boutique</h5>
            </Card.Header>
            <Card.Body className="p-0">
              <Table responsive hover className="align-middle mb-0">
                <thead className="bg-body-tertiary">
                  <tr>
                    <th className="ps-4 border-0 text-muted small text-uppercase">Gérant</th>
                    <th className="border-0 text-muted small text-uppercase">Boutique</th>
                    <th className="text-end pe-4 border-0 text-muted small text-uppercase">CA</th>
                  </tr>
                </thead>
                <tbody>
                  {stats?.performanceGerants?.map((gerant, idx) => (
                    <tr key={idx}>
                      <td className="ps-4 fw-bold">{gerant.nom}</td>
                      <td>{gerant.boutiqueNom || 'Non assignée'}</td>
                      <td className="text-end pe-4 text-success fw-bold">{formatCurrency(gerant.chiffreAffaires)}</td>
                    </tr>
                  ))}
                  {(!stats?.performanceGerants || stats.performanceGerants.length === 0) && (
                    <tr><td colSpan="2" className="text-center py-3 text-muted">Aucune vente enregistrée</td></tr>
                  )}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Modale de Transfert Rapide (Réapprovisionnement d'urgence) */}
      <Modal show={showTransferModal} onHide={() => setShowTransferModal(false)} centered>
        <Modal.Header closeButton>
            <Modal.Title>Réapprovisionner {transferData.articleName}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={confirmTransfer}>
            <Modal.Body>
                <Alert variant="info" className="small">
                    Transfert depuis le <strong>Dépôt Principal</strong> vers la boutique concernée.
                    <div className="mt-2 fw-bold">
                        Stock disponible en centrale : <Badge bg={transferData.availableStock > 0 ? "success" : "danger"}>{transferData.availableStock}</Badge>
                    </div>
                </Alert>
                <Form.Group>
                    <Form.Label>Quantité à transférer</Form.Label>
                    <Form.Control 
                        type="number" 
                        min="1" 
                        value={transferQuantity} 
                        max={transferData.availableStock}
                        onChange={(e) => setTransferQuantity(e.target.value)} 
                        required 
                        isInvalid={parseInt(transferQuantity) > transferData.availableStock}
                    />
                    <Form.Control.Feedback type="invalid">
                        La quantité ne peut pas dépasser le stock disponible ({transferData.availableStock}).
                    </Form.Control.Feedback>
                </Form.Group>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={() => setShowTransferModal(false)}>Annuler</Button>
                <Button variant="success" type="submit" disabled={transferLoading || parseInt(transferQuantity) > transferData.availableStock || transferData.availableStock <= 0}>
                    {transferLoading ? <Spinner size="sm" /> : 'Valider le transfert'}
                </Button>
            </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
};

export default Dashboard;
