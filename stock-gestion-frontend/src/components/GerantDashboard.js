// src/components/GerantDashboard.js
// Composant du tableau de bord gérant
// Affiche les statistiques et performances de la boutique gérée
// Permet de visualiser les ventes, le stock et les alertes
// Contient les fonctionnalités de gestion rapide
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Row, Col, Card, Alert, Table, Badge, Button, Placeholder, Spinner, Form, Modal } from 'react-bootstrap';
import { Link, useOutletContext, useNavigate } from 'react-router-dom';
import { articleAPI, caisseAPI, mouvementAPI, dashboardAPI, boutiqueAPI } from '../services/api';
import Chart from 'react-apexcharts';
import NotificationPopover from './NotificationPopover';
import { toast } from 'react-toastify';
import jsPDF from 'jspdf';

// Helper to safely convert value to number (handles Decimal128 from MongoDB)
const safeNum = (value) => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return parseFloat(value) || 0;
    if (typeof value === 'object' && value.$numberDecimal) {
        return parseFloat(value.$numberDecimal) || 0;
    }
    return 0;
};

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
    const navigate = useNavigate();
    const [stats, setStats] = useState({
        ventesAujourdhui: 0,
        revenuAujourdhui: 0,
        totalArticles: 0,
        articlesPeuStock: 0,
        performanceEquipe: [],
        performanceCaissiers: [],
        productSales: { labels: [], series: [] },
        salesProfit: { categories: [], series: [] },
        secteur: 'Général'
    });
    const [recentArticles, setRecentArticles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isCaisseOpen, setIsCaisseOpen] = useState(false);
    const [pendingTransfers, setPendingTransfers] = useState([]);
    const [actionLoading, setActionLoading] = useState(null);
    const [boutiqueConfig, setBoutiqueConfig] = useState(null); // Initialize boutiqueConfig state

    // États pour la déclaration de casse/perte
    const [showLossModal, setShowLossModal] = useState(false);
    const [allArticles, setAllArticles] = useState([]);
    const [lossLoading, setLossLoading] = useState(false);
    const [lossFormData, setLossFormData] = useState({
        articleId: '',
        quantite: 1,
        raison: 'Casse',
        details: ''
    });

    const fetchData = useCallback(async (isSilent = false, boutiqueIdParam = null) => {
        try {
            if (!isSilent) setLoading(true);
            const boutiqueId = boutiqueIdParam || localStorage.getItem('boutiqueId');

            const [dashboardRes, articlesRes, caisseRes, mvtsRes, boutiqueRes] = await Promise.all([
                dashboardAPI.getStats({ range: 'monthly' }),
                // On récupère TOUS les articles de la boutique pour éviter le double-fetch plus tard
                articleAPI.getAll({ boutique: boutiqueId, limit: 0, sort: 'createdAt', order: 'desc' }),
                caisseAPI.getStatut().catch(() => ({ data: null })), // Handle potential error for caisse status
                mouvementAPI.getAll({ type: 'Transfert', statutTransfert: 'EXPEDIE' }),
                boutiqueAPI.getDetailsForServeur(boutiqueId)
            ]);

            // Attention : l'intercepteur n'unwrap PAS cet endpoint (pas de { success: true })
            const dStats = dashboardRes.data || {};
            const caisseData = caisseRes;
            const fetchedBoutiqueConfig = boutiqueRes;
            // eslint-disable-next-line no-unused-vars

            // Extraction robuste des transferts (déjà unwrap par l'intercepteur)
            const rawMvts = mvtsRes;
            const mvtsList = Array.isArray(rawMvts) ? rawMvts : (rawMvts?.data || []);
            setPendingTransfers(mvtsList.filter(m => m.statutTransfert === 'EXPEDIE' && (m.boutiqueDestination?._id || m.boutiqueDestination) === boutiqueId));

            setBoutiqueConfig(fetchedBoutiqueConfig); // Set the boutiqueConfig
            setIsCaisseOpen(!!caisseData);
            setStats({
                ventesAujourdhui: caisseData ? (caisseData.session?.nombreVentes || 0) : 0,
                revenuAujourdhui: caisseData ? (caisseData.session?.totalVentes || 0) : 0,
                totalArticles: dStats.totalArticles || 0,
                articlesPeuStock: dStats.articlesPeuStock || 0,
                performanceEquipe: dStats.performanceEquipe || [],
                performanceCaissiers: dStats.performanceCaissiers || [],
                productSales: dStats.productSales || { labels: [], series: [] },
                salesProfit: dStats.salesProfit || { categories: [], series: [] }
            });

            // On alimente allArticles et recentArticles à partir du même appel regroupé
            const rawArticles = Array.isArray(articlesRes.data) ? articlesRes.data : [];
            setAllArticles(rawArticles);
            setRecentArticles(rawArticles.slice(0, 5));

        } catch (err) { /* Erreur gérée par l'intercepteur Axios */ } finally { setLoading(false); } // L'intercepteur gère l'erreur
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleLossSubmit = async (e) => {
        e.preventDefault();
        if (!lossFormData.articleId) return alert("Veuillez sélectionner un article.");

        const selectedArt = allArticles.find(a => a._id === lossFormData.articleId);
        if (selectedArt && parseInt(lossFormData.quantite) > selectedArt.quantite) {
            toast.error(`Action impossible : La perte saisie (${lossFormData.quantite}) est supérieure au stock disponible (${selectedArt.quantite}).`);
            return;
        }

        setLossLoading(true);
        try {
            await mouvementAPI.declarerPerte(lossFormData);
            setShowLossModal(false);
            setLossFormData({ articleId: '', quantite: 1, raison: 'Casse', details: '' });
            fetchData(true); // Rafraîchir les statistiques et le stock récent
            toast.success("Perte enregistrée avec succès.");
        } catch (err) { /* Erreur gérée par l'intercepteur Axios */
        } finally {
            setLossLoading(false);
        }
    };

    // eslint-disable-next-line no-unused-vars
    const handleConfirmReceipt = async (mvtId) => {
        setActionLoading(mvtId);
        try {
            // Appel API pour confirmer la réception (À ajouter dans api.js)
            await mouvementAPI.confirmerReception(mvtId);
            setPendingTransfers(prev => prev.filter(t => t._id !== mvtId));
            // Rafraîchir les données sans recharger toute la page
            fetchData(true);
            toast.success("Réception confirmée ! Le stock a été mis à jour.");
        } catch (err) { /* Erreur gérée par l'intercepteur Axios */
        } finally {
            setActionLoading(null);
        }
    };

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
        doc.text(`${(safeNum(stats.revenuAujourdhui).toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' ')}`, 60, 40);

        doc.setFont("helvetica", "normal");
        doc.text(`Ventes du Jour :`, 110, 40);
        doc.setFont("helvetica", "bold");
        doc.text(`${safeNum(stats.ventesAujourdhui)}`, 150, 40);

        // Ventes Récentes
        doc.setFontSize(14);
        doc.setTextColor(41, 128, 185);

        // Pied de page
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
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
    const cardBg = theme === 'dark' ? '#22272e' : '#ffffff';

    // Configuration du graphique d'évolution des revenus
    const revenueChartOptions = useMemo(() => ({
        chart: { type: 'area', toolbar: { show: false }, fontFamily: 'inherit', foreColor: textColor },
        colors: ['#198754'],
        dataLabels: { enabled: false },
        stroke: { curve: 'smooth', width: 2 },
        fill: {
            type: 'gradient',
            gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.1, stops: [0, 100] }
        },
        xaxis: { categories: stats.salesProfit?.categories || [] },
        tooltip: { theme: theme },
        grid: { borderColor: gridColor }
    }), [stats.salesProfit, theme, textColor, gridColor]);

    const revenueSeries = useMemo(() => {
        return [{
            name: 'Revenu',
            data: stats.salesProfit?.series?.[0]?.data?.map(safeNum) || []
        }];
    }, [stats.salesProfit]);

    // Configuration du graphique des articles les plus vendus
    const productChartOptions = useMemo(() => ({
        chart: { type: 'donut', fontFamily: 'inherit', foreColor: textColor },
        labels: stats.productSales?.labels || [],
        colors: ['#0d6efd', '#198754', '#ffc107', '#fd7e14', '#6f42c1'],
        plotOptions: {
            pie: {
                donut: {
                    size: '75%',
                    labels: {
                        show: true,
                        total: { show: true, label: 'Total', color: textColor, fontSize: '16px', fontWeight: 600 }
                    }
                }
            }
        },
        dataLabels: { enabled: false },
        legend: { position: 'bottom', labels: { colors: textColor } },
        stroke: { show: true, colors: [cardBg], width: 2 }
    }), [stats.productSales, textColor, cardBg]);

    // Helper pour la validation en temps réel dans la modale
    const selectedArtForLoss = Array.isArray(allArticles) ? allArticles.find(a => a._id === lossFormData.articleId) : null;

    // Correction : Le retour anticipé doit impérativement se situer APRES tous les hooks (useMemo, etc.)
    if (loading) {
        return <GerantDashboardSkeleton />;
    }

    return (
        <div className={`p-4 ${boutiqueConfig?.type === 'Bar' ? 'bar-theme' : ''}`} data-secteur={stats.secteur}>
            {pendingTransfers.length > 0 && (
                <Alert variant="info" className="shadow-sm rounded-4 border-0 mb-4 animate__animated animate__pulse animate__infinite">
                    <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
                        <div className="d-flex align-items-center">
                            <iconify-icon icon="solar:delivery-bold-duotone" className="me-2 align-middle fs-4"></iconify-icon>
                            <span><strong>Colis en route :</strong> Vous avez {pendingTransfers.length} transfert(s) à réceptionner.</span>
                        </div>
                        <div className="d-flex gap-2 flex-wrap justify-content-end">
                            {pendingTransfers.map(t => (
                                <Button
                                    key={t._id}
                                    variant="primary"
                                    size="sm"
                                    className="rounded-pill fw-bold"
                                    onClick={() => navigate('/gerant/articles?tab=receptions')}
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
                <Col xs md="auto" className="flex-grow-1">
                    <h3 className="fw-bold  mb-0">Tableau de Bord Gérant</h3>
                    <p className="text-muted">Aperçu de vos performances et de votre stock.</p>
                </Col>
                <Col xs="auto" md="auto"><NotificationPopover /></Col>
                <Col xs={12} md="auto" className="d-flex flex-wrap gap-2 justify-content-start justify-content-md-end">
                    <Button variant="outline-secondary" onClick={handleExportPDF} className="rounded-pill px-4 shadow-sm">
                        <iconify-icon icon="solar:printer-bold" class="me-2 align-middle"></iconify-icon>
                        Rapport
                    </Button>

                    <Button as={Link} to="/gerant/equipe" variant="outline-primary" className="rounded-pill px-4 shadow-sm">
                        <iconify-icon icon="solar:users-group-rounded-bold" className="me-2 align-middle" style={{ fontSize: '20px' }}></iconify-icon>
                        Mon Équipe
                    </Button>
                    {!isCaisseOpen ? (
                        <Button as={Link} to="/gerant/caisse" variant="success" className="rounded-pill px-4 shadow-sm">
                            <iconify-icon icon="solar:key-bold" className="me-2 align-middle" style={{ fontSize: '20px' }}></iconify-icon>
                            Ouvrir Caisse
                        </Button>
                    ) : (
                        <Button as={Link} to="/gerant/caisse" state={{ openCloseModal: true }} variant="danger" className="rounded-pill px-4 shadow-sm text-white">
                            <iconify-icon icon="solar:logout-3-bold" className="me-2 align-middle" style={{ fontSize: '20px' }}></iconify-icon>
                            Fermer Caisse
                        </Button>
                    )}
                    <Button as={Link} to="/gerant/ventes" variant="primary" className="rounded-pill px-4 shadow-sm">
                        <iconify-icon icon="solar:cart-plus-bold" className="me-2 align-middle" style={{ fontSize: '20px' }}></iconify-icon>
                        Nouvelle Vente
                    </Button>
                </Col>
            </Row>

            <Row className="g-4 mb-4">
                {[
                    { title: 'Revenu Session', value: `${safeNum(stats.revenuAujourdhui).toLocaleString()} GNF`, color: 'success', link: '/gerant/caisse', live: true },
                    { title: 'Ventes Session', value: safeNum(stats.ventesAujourdhui).toLocaleString(), color: 'primary', link: '/gerant/ventes?tab=history', live: true },
                    { title: 'Articles en Stock', value: safeNum(stats.totalArticles).toLocaleString(), color: 'info', link: '/gerant/articles' },
                    { title: 'Stock Faible (<10)', value: safeNum(stats.articlesPeuStock).toLocaleString(), color: 'danger', link: '/gerant/articles' },
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
                            <h5 className="fw-bold mb-4">Évolution des Revenus</h5>
                            <Chart options={revenueChartOptions} series={revenueSeries} type="area" height={300} />
                        </Card.Body>
                    </Card>
                </Col>

                <Col lg={5}>
                    <Card className="border-0 shadow-sm h-100 rounded-4">
                        <Card.Body className="p-4">
                            <h5 className="fw-bold mb-4">Top Articles vendus</h5>
                            {stats.productSales?.series?.length > 0 ? (
                                <Chart options={productChartOptions} series={Array.isArray(stats.productSales?.series) ? stats.productSales.series.map(safeNum) : []} type="donut" height={320} />
                            ) : (
                                <div className="text-center py-5 text-muted italic">Aucune donnée de vente disponible.</div>
                            )}
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            <Row className="g-4 mt-1">
                <Col lg={12}>
                    <Card className="border-0 shadow-sm h-100 rounded-4">
                        <Card.Body className="p-4">
                            <h5 className="fw-bold mb-4">Articles Récemment Ajoutés au Stock</h5>
                            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                <Table hover responsive size="sm" className="align-middle">
                                    <tbody>
                                        {recentArticles.map(article => (
                                            <tr key={article._id}>
                                                <td>
                                                    {article.image && <img src={article.image} alt="" className="rounded me-2 float-start" style={{ width: '35px', height: '35px', objectFit: 'cover' }} />}
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

            {/* NOUVEAU: Performance des Caissiers */}
            {stats.performanceCaissiers && stats.performanceCaissiers.length > 0 && (
                <Row className="g-4 mt-1">
                    <Col lg={12}>
                        <Card className="border-0 shadow-sm h-100 rounded-4">
                            <Card.Body className="p-4">
                                <div className="d-flex justify-content-between align-items-center mb-4">
                                    <h5 className="fw-bold mb-0">
                                        <iconify-icon icon="solar:calculator-bold" className="me-2"></iconify-icon>
                                        Performance des Caissiers
                                    </h5>
                                    <Badge bg="primary" pill>
                                        {stats.performanceCaissiers.length} caissier(s)
                                    </Badge>
                                </div>
                                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                    <Table hover responsive size="sm" className="align-middle">
                                        <thead className="table-light">
                                            <tr>
                                                <th>#</th>
                                                <th>Caissier</th>
                                                <th className="text-end">Chiffre d'Affaires</th>
                                                <th className="text-end">Nb Ventes</th>
                                                <th className="text-end">Panier Moyen</th>
                                                <th className="text-end">Dettes</th>
                                                <th className="text-end">Recouvrements</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {stats.performanceCaissiers.map((caissier, index) => (
                                                <tr key={caissier.id}>
                                                    <td>
                                                        <Badge bg={index === 0 ? 'warning' : 'secondary'} pill>
                                                            #{index + 1}
                                                        </Badge>
                                                    </td>
                                                    <td>
                                                        <div className="fw-bold">{caissier.nom}</div>
                                                    </td>
                                                    <td className="text-end">
                                                        <strong className="text-success">
                                                            {safeNum(caissier.chiffreAffaires).toLocaleString()} GNF
                                                        </strong>
                                                    </td>
                                                    <td className="text-end">{caissier.nbVentes}</td>
                                                    <td className="text-end">{safeNum(caissier.panierMoyen).toLocaleString()} GNF</td>
                                                    <td className="text-end">
                                                        {caissier.nbDettes > 0 ? (
                                                            <Badge bg="warning" pill>{caissier.nbDettes}</Badge>
                                                        ) : (
                                                            <Badge bg="success" pill>0</Badge>
                                                        )}
                                                    </td>
                                                    <td className="text-end">
                                                        <strong className="text-primary">
                                                            {safeNum(caissier.totalRecouvrements).toLocaleString()} GNF
                                                        </strong>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="table-active">
                                            <tr>
                                                <td colSpan="2" className="fw-bold">TOTAL</td>
                                                <td className="text-end fw-bold">
                                                    {safeNum(stats.performanceCaissiers.reduce((sum, c) => sum + c.chiffreAffaires, 0)).toLocaleString()} GNF
                                                </td>
                                                <td className="text-end fw-bold">
                                                    {stats.performanceCaissiers.reduce((sum, c) => sum + c.nbVentes, 0)}
                                                </td>
                                                <td colSpan="2"></td>
                                                <td className="text-end fw-bold">
                                                    {safeNum(stats.performanceCaissiers.reduce((sum, c) => sum + (c.totalRecouvrements || 0), 0)).toLocaleString()} GNF
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </Table>
                                </div>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
            )}

            {/* Modale de déclaration de Casse / Perte */}
            <Modal show={showLossModal} onHide={() => setShowLossModal(false)} centered>
                <Modal.Header closeButton className="border-0 pb-0">
                    <Modal.Title className="fw-bold h5">Déclarer une Perte ou Casse</Modal.Title>
                </Modal.Header>
                <Form onSubmit={handleLossSubmit}>
                    <Modal.Body className="py-3">
                        <Form.Group className="mb-3">
                            <Form.Label className="small fw-bold text-muted text-uppercase">Article concerné</Form.Label>
                            <Form.Select
                                required
                                value={lossFormData.articleId}
                                onChange={e => setLossFormData({ ...lossFormData, articleId: e.target.value })}
                                className="rounded-3"
                            >
                                <option value="">Sélectionner un article...</option>
                                {Array.isArray(allArticles) && allArticles.map(a => (
                                    <option key={a._id} value={a._id}>{a.nom} (Dispo: {a.quantite})</option>
                                ))}
                            </Form.Select>
                        </Form.Group>
                        <Row>
                            <Col xs={6}>
                                <Form.Group className="mb-3">
                                    <Form.Label className="small fw-bold text-muted text-uppercase">Quantité</Form.Label>
                                    <Form.Control
                                        type="number"
                                        min="1"
                                        max={selectedArtForLoss?.quantite}
                                        required
                                        value={lossFormData.quantite}
                                        onChange={e => setLossFormData({ ...lossFormData, quantite: e.target.value })}
                                        className="rounded-3"
                                        isInvalid={selectedArtForLoss && parseInt(lossFormData.quantite) > selectedArtForLoss.quantite}
                                    />
                                    <Form.Control.Feedback type="invalid">
                                        Le stock max est de {selectedArtForLoss?.quantite || 0}
                                    </Form.Control.Feedback>
                                </Form.Group>
                            </Col>
                            <Col xs={6}>
                                <Form.Group className="mb-3">
                                    <Form.Label className="small fw-bold text-muted text-uppercase">Raison</Form.Label>
                                    <Form.Select
                                        value={lossFormData.raison}
                                        onChange={e => setLossFormData({ ...lossFormData, raison: e.target.value })}
                                        className="rounded-3"
                                    >
                                        <option value="Casse">Casse / Bouteille</option>
                                        <option value="Péremption">Péremption</option>
                                        <option value="Vol">Vol suspecté</option>
                                        <option value="Autre">Autre</option>
                                    </Form.Select>
                                </Form.Group>
                            </Col>
                        </Row>
                        <Form.Group>
                            <Form.Label className="small fw-bold text-muted text-uppercase">Détails (Optionnel)</Form.Label>
                            <Form.Control as="textarea" rows={2} placeholder="Ex: Accident lors du déchargement..." value={lossFormData.details} onChange={e => setLossFormData({ ...lossFormData, details: e.target.value })} className="rounded-3" />
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer className="border-0 pt-0">
                        <Button variant="light" onClick={() => setShowLossModal(false)} className="rounded-pill px-4">Annuler</Button>
                        <Button
                            variant="danger"
                            type="submit"
                            disabled={lossLoading || (selectedArtForLoss && parseInt(lossFormData.quantite) > selectedArtForLoss.quantite)}
                            className="rounded-pill px-4 fw-bold"
                        >
                            {lossLoading ? <Spinner size="sm" /> : "Confirmer la perte"}
                        </Button>
                    </Modal.Footer>
                </Form>
            </Modal>
        </div>
    );
};


export default GerantDashboard;