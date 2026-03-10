// src/components/GerantDashboard.js
// Composant du tableau de bord gérant
// Affiche les statistiques et performances de la boutique gérée
// Permet de visualiser les ventes, le stock et les alertes
// Contient les fonctionnalités de gestion rapide
// src/components/GerantDashboard.js

import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Spinner, Alert, Table, Badge, Button } from 'react-bootstrap';
import { Link, useOutletContext } from 'react-router-dom';
import { venteAPI, articleAPI, caisseAPI } from '../services/api';
import Chart from 'react-apexcharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
                // On récupère le statut de la caisse pour les chiffres "Temps réel" de la session
                // On utilise catch pour gérer le cas où aucune caisse n'est ouverte (403/404) sans bloquer le reste
                const [historiqueRes, articlesRes, caisseRes] = await Promise.all([
                    venteAPI.getHistorique({ limit: 0 }), // On charge tout l'historique pour les stats
                    articleAPI.getAll(),
                    caisseAPI.getStatut().catch(() => ({ data: null }))
                ]);

                const allHistorique = historiqueRes.data.ventes || [];
                const allArticles = articlesRes.data || [];
                const caisseData = caisseRes?.data;

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

    if (loading) {
        return <div className="d-flex justify-content-center align-items-center vh-100"><Spinner animation="border" /></div>;
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
                    <Button as={Link} to="/gerant/ventes" variant="primary" className="rounded-pill px-4 shadow-sm">
                         <iconify-icon icon="solar:cart-plus-bold" className="me-2 align-middle" style={{fontSize: '20px'}}></iconify-icon>
                        Nouvelle Vente
                    </Button>
                </Col>
            </Row>

            <Row className="g-4 mb-4">
                {[
                    { title: 'Revenu Session', value: `${stats.revenuAujourdhui.toLocaleString()} GNF`, color: 'success' },
                    { title: 'Ventes Session', value: stats.ventesAujourdhui, color: 'primary' },
                    { title: 'Articles en Stock', value: stats.totalArticles, color: 'info' },
                    { title: 'Stock Faible (<10)', value: stats.articlesPeuStock, color: 'danger' },
                ].map(stat => (
                    <Col lg={3} md={6} xs={12} key={stat.title}>
                        <Card className={`stat-card border-0 shadow-sm h-100 bg-${stat.color}-subtle`}>
                            <Card.Body className="p-4">
                                <h6 className={`text-${stat.color} mb-1`}>{stat.title}</h6>
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