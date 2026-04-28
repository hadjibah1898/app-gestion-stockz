// src/components/GerantDashboard.js
// Composant du tableau de bord gérant
// Affiche les statistiques et performances de la boutique gérée
// Permet de visualiser les ventes, le stock et les alertes
// Contient les fonctionnalités de gestion rapide
import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Alert, Table, Badge, Button, Placeholder, Spinner } from 'react-bootstrap';
import { Link, useOutletContext } from 'react-router-dom';
import { venteAPI, articleAPI, caisseAPI, mouvementAPI } from '../services/api';
import Chart from 'react-apexcharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const blinkAnimationStyle = `
.blink-animation {
    animation: blinker 1.5s linear infinite;
}
@keyframes blinker {
    50% { opacity: 0.3; }
}`;

const styleSheet = document.createElement("style");
styleSheet.type = "text/css";
styleSheet.innerText = blinkAnimationStyle;
document.head.appendChild(styleSheet);

const GerantDashboardSkeleton = () => (
    <div className="p-4">
        <Row className="align-items-center justify-content-between mb-4 g-3">
            <Col xs={12} md="auto">
                <Placeholder as="h3" animation="glow"><Placeholder xs={8} /></Placeholder>
                <Placeholder as="p" animation="glow"><Placeholder xs={10} /></Placeholder>
            </Col>
        </Row>
        <Row className="g-4 mb-4">
            {[...Array(4)].map((_, i) => (
                <Col lg={3} md={6} xs={12} key={i}>
                    <Card className="border-0 shadow-sm h-100">
                        <Card.Body className="p-4">
                            <Placeholder as="h6" animation="glow"><Placeholder xs={6} /></Placeholder>
                            <Placeholder as="h4" animation="glow"><Placeholder xs={8} /></Placeholder>
                        </Card.Body>
                    </Card>
                </Col>
            ))}
        </Row>
        <Row className="g-4">
            <Col lg={7}>
                <Card className="border-0 shadow-sm h-100 rounded-4">
                    <Card.Body className="p-4">
                        <Placeholder as="h5" animation="glow"><Placeholder xs={5} /></Placeholder>
                        <Placeholder as="div" animation="glow" style={{ height: '300px' }} />
                    </Card.Body>
                </Card>
            </Col>
            <Col lg={5}>
                <Card className="border-0 shadow-sm h-100 rounded-4"><Card.Body className="p-4"><Placeholder as="h5" animation="glow"><Placeholder xs={4} /></Placeholder><Placeholder as="div" animation="glow"><Placeholder xs={12} /><Placeholder xs={12} /><Placeholder xs={12} /></Placeholder></Card.Body></Card>
            </Col>
        </Row>
    </div>
);

const GerantDashboard = () => {
    const { theme } = useOutletContext(); // Récupération du thème
    const [stats, setStats] = useState({
        ventesAujourdhui: 0,
        revenuAujourdhui: 0,
        totalArticles: 0,
        articlesPeuStock: 0,
    });
    const [historique, setHistorique] = useState([]);
    const [recentArticles, setRecentArticles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [isCaisseOpen, setIsCaisseOpen] = useState(false);
    const [pendingTransfers, setPendingTransfers] = useState([]);
    const [actionLoading, setActionLoading] = useState(null);

    const [salesChartData, setSalesChartData] = useState({
        options: {
            chart: { type: 'area', toolbar: { show: false }, fontFamily: 'inherit' },
            colors: ['#198754'],
            dataLabels: { enabled: false },
            stroke: { curve: 'smooth', width: 2 },
            xaxis: { categories: [] },
            tooltip: { theme: 'light' },
        },
        series: [{ name: 'Revenu', data: [] }],
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const boutiqueId = localStorage.getItem('boutiqueId');
                // On récupère le statut de la caisse pour les chiffres "Temps réel" de la session
                // On utilise catch pour gérer le cas où aucune caisse n'est ouverte (403/404) sans bloquer le reste
                const [historiqueRes, articlesRes, caisseRes, mvtsRes] = await Promise.all([
                    venteAPI.getHistorique({ limit: 0 }), // On charge tout l'historique pour les stats
                    articleAPI.getAll({ boutique: boutiqueId }),
                    caisseAPI.getStatut().catch(() => ({ data: null })),
                    mouvementAPI.getAll({ type: 'Transfert' })
                ]);

                const allHistorique = historiqueRes.data.ventes || [];
                const allArticles = articlesRes.data.data || [];
                const caisseData = caisseRes?.data;
                
                // Filtrer les transferts en transit vers CETTE boutique
                const transfers = (mvtsRes.data.data || []).filter(m => 
                    m.statutTransfert === 'EXPEDIE' && 
                    (m.boutiqueDestination?._id || m.boutiqueDestination) === boutiqueId
                );
                setPendingTransfers(transfers);

                // Mettre à jour l'état de la caisse
                setIsCaisseOpen(!!caisseData);

                // Filtrer les ventes annulées
                const validSales = allHistorique.filter(v => !v.isCancelled);
                
                // Calcul des stats : Si une caisse est ouverte, on prend ses valeurs. Sinon 0.
                // Cela assure que dès que le rapport est envoyé (caisse fermée), les compteurs reviennent à 0.
                const ventesSession = caisseData ? (caisseData.session?.nombreVentes || 0) : 0;
                const revenuSession = caisseData ? (caisseData.session?.totalVentes || 0) : 0;
                
                const articlesEnDessousSeuil = allArticles.filter(a => a.quantite <= 10).length;

                setStats({
                    ventesAujourdhui: ventesSession,
                    revenuAujourdhui: revenuSession,
                    totalArticles: allArticles.length,
                    articlesPeuStock: articlesEnDessousSeuil,
                });

                setHistorique(allHistorique);

                // Trier les articles par date de création pour trouver les plus récents
                const sortedArticles = [...allArticles].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                setRecentArticles(sortedArticles.slice(0, 5)); // Garder les 5 plus récents

                const salesByDay = {};
                for (let i = 6; i >= 0; i--) {
                    const d = new Date();
                    d.setDate(d.getDate() - i);
                    salesByDay[d.toISOString().split('T')[0]] = 0;
                }

                validSales.forEach(vente => {
                    const venteDate = vente.createdAt.split('T')[0];
                    if (salesByDay[venteDate] !== undefined) {
                        salesByDay[venteDate] += vente.prixTotal;
                    }
                });
                
                setSalesChartData(prev => ({
                    ...prev,
                    options: { ...prev.options, xaxis: { categories: Object.keys(salesByDay).map(d => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }))}},
                    series: [{ name: 'Revenu', data: Object.values(salesByDay) }]
                }));

            } catch (err) {
                setError(err.response?.data?.message || "Erreur de chargement des données.");
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const handleConfirmReceipt = async (mvtId) => {
        setActionLoading(mvtId);
        try {
            // Appel API pour confirmer la réception (À ajouter dans api.js)
            await mouvementAPI.confirmerReception(mvtId);
            setPendingTransfers(prev => prev.filter(t => t._id !== mvtId));
            // Rafraîchir les articles pour voir le nouveau stock
            window.location.reload(); 
        } catch (err) {
            alert(err.response?.data?.message || "Erreur de réception");
        } finally {
            setActionLoading(null);
        }
    };

    if (loading) {
        return <GerantDashboardSkeleton />;
    }

    const handleExportPDF = () => {
        const doc = new jsPDF();
        
        // En-tête du rapport avec fond coloré
        doc.setFillColor(41, 128, 185);
        doc.rect(0, 0, 210, 25, 'F');
        
        doc.setFontSize(18);
        doc.setTextColor(255, 255, 255);
        doc.text("Rapport Quotidien Gérant", 14, 16);
        
        doc.setFontSize(10);
        doc.setTextColor(220, 220, 220);
        doc.text(`Généré le : ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, 14, 22);

        // Résumé des stats
        doc.setFillColor(245, 247, 250);
        doc.setDrawColor(200, 200, 200);
        doc.roundedRect(14, 30, 182, 25, 2, 2, 'FD');

        doc.setFontSize(10);
        doc.setTextColor(50);
        
        doc.text(`Revenu du Jour :`, 20, 40);
        doc.setFont("helvetica", "bold");
        doc.text(`${(stats.revenuAujourdhui.toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' ')}`, 60, 40);
        
        doc.setFont("helvetica", "normal");
        doc.text(`Ventes du Jour :`, 110, 40);
        doc.setFont("helvetica", "bold");
        doc.text(`${stats.ventesAujourdhui}`, 150, 40);

        // Ventes Récentes
        doc.setFontSize(14);
        doc.setTextColor(41, 128, 185);
        doc.text("Ventes Récentes", 14, 65);
        
        autoTable(doc, {
            startY: 70,
            head: [['Article', 'Quantité', 'Total']],
            body: historique.slice(0, 20).map(v => [v.article?.nom || 'Article supprimé', v.quantite, (v.prixTotal.toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' ')]),
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185] },
            alternateRowStyles: { fillColor: [248, 249, 250] }
        });

        // Pied de page
        const pageCount = doc.internal.getNumberOfPages();
        for(let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            const pageSize = doc.internal.pageSize;
            const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
            doc.text(`StockDash - Gérant`, 14, pageHeight - 10);
            doc.text(`Page ${i} sur ${pageCount}`, pageSize.width - 20, pageHeight - 10, { align: 'right' });
        }

        doc.save("dashboard_gerant.pdf");
    };

    // Couleurs dynamiques pour le graphique
    const textColor = theme === 'dark' ? '#cdd9e5' : '#373d3f';
    const gridColor = theme === 'dark' ? '#444c56' : '#f1f1f1';

    const chartOptions = {
        ...salesChartData.options,
        chart: {
            ...salesChartData.options.chart,
            foreColor: textColor
        },
        tooltip: { theme: theme },
        grid: { borderColor: gridColor }
    };

    return (
        <div className="p-4">
            {error && <Alert variant="danger">{error}</Alert>}

            {/* Alerte de Transferts en attente */}
            {pendingTransfers.length > 0 && (
                <Alert variant="info" className="shadow-sm rounded-4 border-0 mb-4 animate__animated animate__pulse animate__infinite">
                    <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                        <div>
                            <iconify-icon icon="solar:delivery-bold-duotone" className="me-2 align-middle fs-4"></iconify-icon>
                            <strong>Colis en route :</strong> Vous avez {pendingTransfers.length} transfert(s) du Dépôt Principal à réceptionner.
                        </div>
                        <div className="d-flex gap-2">
                            {pendingTransfers.map(t => (
                                <Button 
                                    key={t._id}
                                    variant="primary" 
                                    size="sm" 
                                    className="rounded-pill fw-bold"
                                    onClick={() => handleConfirmReceipt(t._id)}
                                    disabled={actionLoading === t._id}
                                >
                                    {actionLoading === t._id ? <Spinner size="sm" /> : `Valider Bon #${t._id.slice(-4).toUpperCase()}`}
                                </Button>
                            ))}
                        </div>
                    </div>
                </Alert>
            )}

            <Row className="align-items-center justify-content-between mb-4 g-3">
                <Col xs={12} md="auto">
                    <h3 className="fw-bold  mb-0">Tableau de Bord Gérant</h3>
                    <p className="text-muted">Aperçu de vos performances et de votre stock.</p>
                </Col>
                <Col xs={12} md="auto" className="d-flex flex-wrap gap-2 justify-content-start justify-content-md-end">
                    <Button variant="outline-secondary" onClick={handleExportPDF} className="rounded-pill px-4 shadow-sm">
                        <iconify-icon icon="solar:printer-bold" class="me-2 align-middle"></iconify-icon>
                        Rapport
                    </Button>
                    <Button as={Link} to="/gerant/equipe" variant="outline-primary" className="rounded-pill px-4 shadow-sm">
                        <iconify-icon icon="solar:users-group-rounded-bold" className="me-2 align-middle" style={{fontSize: '20px'}}></iconify-icon>
                        Mon Équipe
                    </Button>
                    {!isCaisseOpen ? (
                        <Button as={Link} to="/gerant/caisse" variant="success" className="rounded-pill px-4 shadow-sm">
                            <iconify-icon icon="solar:key-bold" className="me-2 align-middle" style={{fontSize: '20px'}}></iconify-icon>
                            Ouvrir Caisse
                        </Button>
                    ) : (
                        <Button as={Link} to="/gerant/caisse" state={{ openCloseModal: true }} variant="danger" className="rounded-pill px-4 shadow-sm text-white">
                            <iconify-icon icon="solar:logout-3-bold" className="me-2 align-middle" style={{fontSize: '20px'}}></iconify-icon>
                            Fermer Caisse
                        </Button>
                    )}
                    <Button as={Link} to="/gerant/ventes" variant="primary" className="rounded-pill px-4 shadow-sm">
                         <iconify-icon icon="solar:cart-plus-bold" className="me-2 align-middle" style={{fontSize: '20px'}}></iconify-icon>
                        Nouvelle Vente
                    </Button>
                </Col>
            </Row>

            <Row className="g-4 mb-4">
                {[
                    { title: 'Revenu Session', value: `${stats.revenuAujourdhui.toLocaleString()} GNF`, color: 'success', link: '/gerant/caisse', live: true },
                    { title: 'Ventes Session', value: stats.ventesAujourdhui, color: 'primary', link: '/gerant/ventes?tab=history', live: true },
                    { title: 'Articles en Stock', value: stats.totalArticles, color: 'info', link: '/gerant/articles' },
                    { title: 'Stock Faible (<10)', value: stats.articlesPeuStock, color: 'danger', link: '/gerant/articles' },
                ].map(stat => (
                    <Col lg={3} md={6} xs={12} key={stat.title}>
                        <Card as={Link} to={stat.link} className={`stat-card text-decoration-none border-0 shadow-sm h-100 bg-${stat.color}-subtle`}>
                            <Card.Body className="p-4">
                                <h6 className={`text-${stat.color} mb-1 d-flex align-items-center`}>
                                    {stat.title}
                                    {stat.live && isCaisseOpen && (
                                        <Badge bg="danger" pill className="ms-2 blink-animation">
                                            LIVE
                                        </Badge>
                                    )}
                                </h6>
                                <h4 className="fw-bold mb-0">{stat.value}</h4>
                            </Card.Body>
                        </Card>
                    </Col>
                ))}
            </Row>

            <Row className="g-4">
                <Col lg={7}>
                    <Card className="border-0 shadow-sm h-100 rounded-4">
                        <Card.Body className="p-4">
                            <h5 className="fw-bold mb-4">Revenus des 7 derniers jours</h5>
                            <Chart options={chartOptions} series={salesChartData.series} type="area" height={300} />
                        </Card.Body>
                    </Card>
                </Col>

                <Col lg={5}>
                    <Card className="border-0 shadow-sm h-100 rounded-4">
                        <Card.Body className="p-4">
                             <h5 className="fw-bold mb-4">Ventes Récentes</h5>
                             <div style={{maxHeight: '300px', overflowY: 'auto'}}>
                                <Table hover responsive size="sm" className="align-middle">
                                    <tbody>
                                        {historique.filter(v => !v.isCancelled).slice(0, 7).map(vente => (
                                            <tr key={vente._id}>
                                                <td>
                                                    {vente.article?.image && <img src={vente.article?.image} alt="" className="rounded me-2 float-start" style={{width: '35px', height: '35px', objectFit: 'cover'}} />}
                                                    <div className="fw-bold">{vente.article?.nom || 'Article supprimé'}</div>
                                                    <div className="text-muted small">Qté: {vente.quantite}</div>
                                                </td>
                                                <td className="text-end">
                                                    <Badge bg="success-subtle" text="success" pill>
                                                        + {vente.prixTotal.toLocaleString()} GNF
                                                    </Badge>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </Table>
                                {historique.length === 0 && <Alert variant="info" className="mt-3">Aucune vente récente.</Alert>}
                             </div>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            <Row className="g-4 mt-1">
                <Col lg={12}>
                    <Card className="border-0 shadow-sm h-100 rounded-4">
                        <Card.Body className="p-4">
                             <h5 className="fw-bold mb-4">Articles Récemment Ajoutés au Stock</h5>
                             <div style={{maxHeight: '300px', overflowY: 'auto'}}>
                                <Table hover responsive size="sm" className="align-middle">
                                    <tbody>
                                        {recentArticles.map(article => (
                                            <tr key={article._id}>
                                                <td>
                                                    {article.image && <img src={article.image} alt="" className="rounded me-2 float-start" style={{width: '35px', height: '35px', objectFit: 'cover'}} />}
                                                    <div className="fw-bold">{article.nom}</div>
                                                    <div className="text-muted small">Ajouté le: {new Date(article.createdAt).toLocaleDateString()}</div>
                                                </td>
                                                <td className="text-end">
                                                    <Badge bg="info-subtle" text="info" pill>
                                                        Stock: {article.quantite}
                                                    </Badge>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </Table>
                                {recentArticles.length === 0 && <Alert variant="info" className="mt-3">Aucun article n'a été ajouté récemment.</Alert>}
                             </div>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>
        </div>
    );
};


export default GerantDashboard;