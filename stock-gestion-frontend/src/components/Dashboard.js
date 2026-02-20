import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Spinner, Alert, Table, Badge, Button, Pagination, Placeholder, Toast, ToastContainer } from 'react-bootstrap';
import Chart from 'react-apexcharts';
import { Link, useOutletContext } from 'react-router-dom';
import { dashboardAPI, articleAPI, venteAPI } from '../services/api'; // Import the new API
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './Dashboard.css';

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
  const [stats, setStats] = useState(null);
  const [lowStockArticles, setLowStockArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ show: false, message: '', variant: 'light' });
  const [timeRange, setTimeRange] = useState('monthly'); // 1. Ajouter l'état pour le filtre
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5; // Nombre d'articles par page

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        // On récupère aussi l'historique des ventes pour corriger les calculs côté client (exclusion des annulés)
        const [statsRes, articlesRes, ventesRes] = await Promise.all([
          dashboardAPI.getStats({ range: timeRange }),
          articleAPI.getAll(),
          venteAPI.getHistorique()
        ]);
        
        let statsData = statsRes.data;

        // --- CORRECTIF : Recalcul des stats en excluant les ventes annulées ---
        if (ventesRes.data) {
            const validSales = ventesRes.data.filter(v => !v.isCancelled);
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
        
        // Calcul du stock faible (seuil arbitraire à 10 unités)
        const lowStockItems = articlesRes.data.filter(a => a.quantite <= 10);
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
  }, [timeRange]); // 3. Redéclencher à chaque changement de filtre

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
    doc.text("Rapport Tableau de Bord Admin", 14, 15);
    
    // Stats Globales
    doc.setFontSize(12);
    doc.text(`Chiffre d'affaires: ${formatCurrency(stats?.totalCA)}`, 14, 25);
    doc.text(`Bénéfice: ${formatCurrency(stats?.totalBenefice)}`, 14, 32);
    doc.text(`Total Ventes: ${stats?.totalVentes}`, 14, 39);
    
    let finalY = 45;

    // Performance Boutiques
    if (stats?.performanceBoutiques?.length > 0) {
        doc.text("Performance par Boutique", 14, finalY + 10);
        autoTable(doc, {
            startY: finalY + 15,
            head: [['Boutique', 'CA']],
            body: stats.performanceBoutiques.map(b => [b.nom, formatCurrency(b.chiffreAffaires)])
        });
        finalY = doc.lastAutoTable.finalY;
    }

    // Stock Faible
    if (lowStockArticles.length > 0) {
        doc.text("Alerte Stock Faible", 14, finalY + 10);
        autoTable(doc, {
            startY: finalY + 15,
            head: [['Article', 'Boutique', 'Quantité']],
            body: lowStockArticles.map(a => [a.nom, a.boutique?.nom || 'N/A', a.quantite])
        });
    }

    doc.save("dashboard_admin.pdf");
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
          <div className="z-1 position-relative">
            <div className="d-flex align-items-center gap-3 mb-2">
                <h2 className="fw-bold mb-0">Bienvenue sur votre Dashboard ! 👋</h2>
                <Button variant="light" size="sm" onClick={handleExportPDF} className="text-primary fw-bold shadow-sm">
                    <iconify-icon icon="solar:printer-bold" className="me-2 align-middle"></iconify-icon>
                    Exporter Rapport
                </Button>
            </div>
            <p className="mb-4 opacity-75" style={{ maxWidth: '500px' }}>
              Voici un aperçu de vos performances aujourd'hui. Consultez les statistiques ci-dessous pour plus de détails.
            </p>
            <div className="d-flex gap-4">
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

      {/* F. Performances par Boutique et Gérant */}
      <Row className="mt-4 g-4">
        <Col md={6}>
          <Card className="border-0 shadow-sm h-100 rounded-4">
            <Card.Header className="bg-body py-3">
              <h5 className="fw-bold mb-0">Performance par Boutique</h5>
            </Card.Header>
            <Card.Body className="p-0">
              <Table responsive hover className="align-middle mb-0">
                <thead className="bg-body-tertiary">
                  <tr>
                    <th className="ps-4 border-0 text-muted small text-uppercase">Boutique</th>
                    <th className="text-end pe-4 border-0 text-muted small text-uppercase">CA</th>
                  </tr>
                </thead>
                <tbody>
                  {stats?.performanceBoutiques?.map((boutique, idx) => (
                    <tr key={idx}>
                      <td className="ps-4 fw-bold">{boutique.nom}</td>
                      <td className="text-end pe-4 text-success fw-bold">{formatCurrency(boutique.chiffreAffaires)}</td>
                    </tr>
                  ))}
                  {(!stats?.performanceBoutiques || stats.performanceBoutiques.length === 0) && (
                    <tr><td colSpan="2" className="text-center py-3 text-muted">Aucune vente enregistrée</td></tr>
                  )}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </Col>

        <Col md={6}>
          <Card className="border-0 shadow-sm h-100 rounded-4">
            <Card.Header className="bg-body py-3">
              <h5 className="fw-bold mb-0">Performance par Gérant</h5>
            </Card.Header>
            <Card.Body className="p-0">
              <Table responsive hover className="align-middle mb-0">
                <thead className="bg-body-tertiary">
                  <tr>
                    <th className="ps-4 border-0 text-muted small text-uppercase">Gérant</th>
                    <th className="text-end pe-4 border-0 text-muted small text-uppercase">CA</th>
                  </tr>
                </thead>
                <tbody>
                  {stats?.performanceGerants?.map((gerant, idx) => (
                    <tr key={idx}>
                      <td className="ps-4 fw-bold">{gerant.nom}</td>
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

      {/* G. État du Stock par Boutique (Nouveau) */}
      <Row className="mt-4">
        <Col>
          <Card className="border-0 shadow-sm h-100 rounded-4">
            <Card.Header className="bg-body py-3">
              <h5 className="fw-bold mb-0">État du Stock par Boutique</h5>
            </Card.Header>
            <Card.Body className="p-0">
              <Table responsive hover className="align-middle mb-0">
                <thead className="bg-body-tertiary">
                  <tr>
                    <th className="ps-4 border-0 text-muted small text-uppercase">Boutique</th>
                    <th className="text-center border-0 text-muted small text-uppercase">Quantité Totale</th>
                    <th className="text-end pe-4 border-0 text-muted small text-uppercase">Valeur du Stock (Achat)</th>
                  </tr>
                </thead>
                <tbody>
                  {stats?.stockBoutiques?.map((boutique, idx) => (
                    <tr key={idx}>
                      <td className="ps-4 fw-bold">{boutique.nom}</td>
                      <td className="text-center"><Badge bg="info" pill>{boutique.totalStock} articles</Badge></td>
                      <td className="text-end pe-4 fw-bold">{formatCurrency(boutique.valeurStock)}</td>
                    </tr>
                  ))}
                  {(!stats?.stockBoutiques || stats.stockBoutiques.length === 0) && (
                    <tr><td colSpan="3" className="text-center py-3 text-muted">Aucun stock trouvé</td></tr>
                  )}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* E. Liste des articles en stock faible */}
      <Row className="mt-4">
        <Col>
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
                          <Button as={Link} to="/admin/articles" variant="outline-primary" size="sm">Gérer le stock</Button>
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
    </div>
  );
};

export default Dashboard;
