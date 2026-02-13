// src/components/GerantDashboard.js
import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Spinner, Alert, Table, Badge, Button } from 'react-bootstrap';
import { Link, useOutletContext } from 'react-router-dom';
import { venteAPI, articleAPI } from '../services/api';
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
                const [historiqueRes, articlesRes] = await Promise.all([
                    venteAPI.getHistorique(),
                    articleAPI.getAll(),
                ]);

                const today = new Date().toISOString().split('T')[0];
                const ventesDuJour = historiqueRes.data.filter(v => v.createdAt.startsWith(today));
                const revenuDuJour = ventesDuJour.reduce((sum, v) => sum + v.prixTotal, 0);
                const articlesEnDessousSeuil = articlesRes.data.filter(a => a.quantite <= 10).length;

                setStats({
                    ventesAujourdhui: ventesDuJour.length,
                    revenuAujourdhui: revenuDuJour,
                    totalArticles: articlesRes.data.length,
                    articlesPeuStock: articlesEnDessousSeuil,
                });

                setHistorique(historiqueRes.data);

                const salesByDay = {};
                for (let i = 6; i >= 0; i--) {
                    const d = new Date();
                    d.setDate(d.getDate() - i);
                    salesByDay[d.toISOString().split('T')[0]] = 0;
                }

                historiqueRes.data.forEach(vente => {
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
        doc.text("Rapport Tableau de Bord Gérant", 14, 15);
        
        doc.setFontSize(12);
        doc.text(`Revenu du Jour: ${(stats.revenuAujourdhui.toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' ')}`, 14, 25);
        doc.text(`Ventes du Jour: ${stats.ventesAujourdhui}`, 14, 32);
        
        // Ventes Récentes
        doc.text("Ventes Récentes", 14, 45);
        autoTable(doc, {
            startY: 50,
            head: [['Article', 'Quantité', 'Total']],
            body: historique.slice(0, 20).map(v => [v.article.nom, v.quantite, (v.prixTotal.toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' ')])
        });

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

            <Row className="align-items-center mb-4">
                <Col>
                    <h3 className="fw-bold  mb-0">Tableau de Bord Gérant</h3>
                    <p className="text-muted">Aperçu de vos performances et de votre stock.</p>
                </Col>
                <Col xs="auto" className="d-flex gap-2">
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
                    { title: 'Revenu du Jour', value: `${stats.revenuAujourdhui.toLocaleString()} GNF`, color: 'success' },
                    { title: 'Ventes du Jour', value: stats.ventesAujourdhui, color: 'primary' },
                    { title: 'Articles en Stock', value: stats.totalArticles, color: 'info' },
                    { title: 'Stock Faible (<10)', value: stats.articlesPeuStock, color: 'danger' },
                ].map(stat => (
                    <Col md={3} key={stat.title}>
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
                                        {historique.slice(0, 7).map(vente => (
                                            <tr key={vente._id}>
                                                <td>
                                                    <div className="fw-bold">{vente.article.nom}</div>
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
        </div>
    );
};

export default GerantDashboard;