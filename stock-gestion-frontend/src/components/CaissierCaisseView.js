/**
 * @file CaissierCaisseView.js
 * @description Interface de gestion de caisse pour les caissiers.
 * Permet d'ouvrir/fermer sa caisse et de soumettre des rapports au gérant.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Form, Spinner, Alert, Row, Col, InputGroup, Modal, Table, Badge, Tabs, Tab } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { caisseAPI } from '../services/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const CaissierCaisseView = () => {
    const [caisseStatut, setCaisseStatut] = useState(null);
    const [loading, setLoading] = useState(true);
    const [success, setSuccess] = useState('');

    // États pour les formulaires
    const [fondInitial, setFondInitial] = useState('');
    const [montantCloture, setMontantCloture] = useState('');
    const [commentaires, setCommentaires] = useState('');
    const [ecart, setEcart] = useState(null);
    const [afficherJustification, setAfficherJustification] = useState(false);

    // États pour les modales et animations
    const [showCloseModal, setShowCloseModal] = useState(false);
    const [openingCaisse, setOpeningCaisse] = useState(false);
    const [closingCaisse, setClosingCaisse] = useState(false);
    const [isCorrection, setIsCorrection] = useState(false);
    const [currentRapportForCorrection, setCurrentRapportForCorrection] = useState(null);
    const [ecartTimeout, setEcartTimeout] = useState(null);

    // États pour les détails Fintech
    const [showActiveFintechDetails, setShowActiveFintechDetails] = useState(false);
    const [activeFintechData, setActiveFintechData] = useState({ sales: [], recoveries: [] });
    const [loadingFintechDetails, setLoadingFintechDetails] = useState(false);

    // Statistiques de la session
    const [statistiquesSession, setStatistiquesSession] = useState(null);

    // États pour l'onglet Mes Rapports
    const [rapports, setRapports] = useState([]);
    const [loadingRapports, setLoadingRapports] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    // Statistiques de performance
    const [perfStats, setPerfStats] = useState({
        totalSessions: 0,
        totalVentes: 0,
        montantMoyen: 0,
        tauxReussite: 0
    });

    const fetchStatut = useCallback(async () => {
        try {
            setLoading(true);
            const res = await caisseAPI.getStatut();
            setCaisseStatut(res.data || res);
        } catch (err) {
            // Si la caisse n'est pas ouverte, c'est normal
            if (err.response && err.response.status === 403) {
                setCaisseStatut(null);
            } else {
                // Gestion du cas où un rapport a été rejeté
                if (err.response?.data?.statut === 'REJETE' || err.response?.data?.statut === 'REJETE_PAR_GERANT') {
                    setIsCorrection(true);
                    toast.error(
                        <div>
                            <strong>Rapport Rejeté :</strong> {err.response.data.message || 'Votre rapport a été rejeté par le gérant.'}
                            <Button variant="outline-danger" size="sm" className="mt-2" onClick={() => setShowCloseModal(true)}>
                                Corriger et Relancer
                            </Button>
                        </div>
                    );
                }
                setCaisseStatut(null);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatut();
    }, [fetchStatut]);

    // Charger les statistiques de la session
    useEffect(() => {
        if (showCloseModal && caisseStatut) {
            const loadStatistiquesSession = async () => {
                try {
                    const res = await caisseAPI.getStatistiquesSession();
                    setStatistiquesSession(res.data || res);
                } catch (err) {
                    console.error("Erreur lors du chargement des statistiques:", err);
                    setStatistiquesSession(caisseStatut);
                }
            };
            loadStatistiquesSession();
        }
    }, [showCloseModal, caisseStatut]);

    // Charger les rapports du caissier
    // Note: l'intercepteur Axios unwrap { success: true, data: { data: [...], pagination: {...} } }
    // donc res reçu = { data: [...], pagination: {...} } directement
    const loadRapports = async (pageNum = 1) => {
        setLoadingRapports(true);
        try {
            const res = await caisseAPI.getMesRapports({ page: pageNum, limit: 10 });
            // res est déjà l'objet { data, pagination } après unwrap par l'intercepteur
            const rapportsData = res.data || res;
            setRapports(Array.isArray(rapportsData) ? rapportsData : (rapportsData.data || []));
            setTotalPages(res.pagination?.totalPages || 1);
            setPage(pageNum);
        } catch (err) {
            console.error("Erreur chargement rapports:", err);
        } finally {
            setLoadingRapports(false);
        }
    };

    // Charger les statistiques de performance
    const loadPerfStats = async () => {
        try {
            const res = await caisseAPI.getMesRapports({ limit: 100 });
            // res est déjà l'objet { data, pagination } après unwrap
            const rapportsData = res.data || res;
            const rapportsList = Array.isArray(rapportsData) ? rapportsData : (rapportsData.data || []);
            
            if (rapportsList.length > 0) {
                const totalVentes = rapportsList.reduce((sum, r) => sum + (r.totalVentes || 0), 0);
                const montantMoyen = totalVentes / rapportsList.length;
                const tauxReussite = (rapportsList.filter(r => r.statut === 'VALIDE' || r.statut === 'VALIDE_PAR_GERANT').length / rapportsList.length) * 100;

                setPerfStats({
                    totalSessions: rapportsList.length,
                    totalVentes: totalVentes,
                    montantMoyen: montantMoyen,
                    tauxReussite: tauxReussite
                });
            }
        } catch (err) {
            console.error("Erreur chargement stats:", err);
        }
    };

    // Charger les rapports et stats quand on est sur l'onglet rapports
    useEffect(() => {
        const timer = setTimeout(() => {
            loadRapports(1);
            loadPerfStats();
        }, 500);
        return () => clearTimeout(timer);
    }, []);

    // Réinitialiser les détails Fintech
    useEffect(() => {
        if (!showCloseModal) {
            setShowActiveFintechDetails(false);
            setActiveFintechData({ sales: [], recoveries: [] });
        }
    }, [showCloseModal]);

    const toggleActiveFintechDetails = async () => {
        const source = currentRapportForCorrection || caisseStatut;
        if (!showActiveFintechDetails && source) {
            setLoadingFintechDetails(true);
            try {
                const sessionId = source.ouvertureCaisse?._id || source.ouvertureCaisse || source._id;
                const [ventesRes, dettesRes] = await Promise.all([
                    caisseAPI.getVentesHistorique({ limit: 0 }),
                    caisseAPI.getDettesHistorique()
                ]);

                const mobileModes = ['Orange Money', 'MobiCash', 'PayCard', 'Virement'];
                const allSales = (ventesRes.data && ventesRes.data.ventes) ? ventesRes.data.ventes : (ventesRes.ventes || ventesRes.data || []);
                const fintechSales = (allSales || [])
                    .filter(v => (v.ouvertureCaisse?._id || v.ouvertureCaisse) === sessionId && mobileModes.includes(v.modePaiement) && !v.isCancelled);
                const fintechRecoveries = (dettesRes.data || dettesRes || [])
                    .filter(p => (p.ouvertureCaisse?._id || p.ouvertureCaisse) === sessionId && mobileModes.includes(p.modePaiement) && p.statut === 'VALIDEE');

                setActiveFintechData({ sales: fintechSales, recoveries: fintechRecoveries });
            } catch (err) {
                console.error("Erreur chargement détails Fintech:", err);
            } finally {
                setLoadingFintechDetails(false);
            }
        }
        setShowActiveFintechDetails(!showActiveFintechDetails);
    };

    const handleStartCorrection = (rapport) => {
        setMontantCloture(rapport.montantCloture);
        setCommentaires(rapport.commentairesGérant || '');
        setCurrentRapportForCorrection(rapport);
        setIsCorrection(true);
        setShowCloseModal(true);
    };

    const handleOpenCaisse = async (e) => {
        e.preventDefault();
        setSuccess('');
        setOpeningCaisse(true);
        try {
            const res = await caisseAPI.ouvrir({ fondInitial: parseFloat(fondInitial) });
            const msg = res.data?.message || "Votre caisse a été ouverte avec succès! Le gérant a été notifié.";
            toast.success(msg);
            setFondInitial('');
            fetchStatut();
        } catch (err) {
            console.error("Erreur ouverture caisse:", err);
            toast.error(err.response?.data?.message || err.message || "Erreur lors de l'ouverture de la caisse");
        } finally {
            setOpeningCaisse(false);
        }
    };

    const handleMontantClotureChange = (e) => {
        const value = e.target.value;
        setMontantCloture(value);

        if (ecartTimeout) {
            clearTimeout(ecartTimeout);
        }

        if (caisseStatut && value && value.trim() !== '') {
            const timeoutId = setTimeout(() => {
                const montantClotureNum = parseFloat(value);
                let soldeTheorique = 0;

                if (isCorrection && currentRapportForCorrection) {
                    soldeTheorique = currentRapportForCorrection.soldeTheorique;
                } else if (caisseStatut) {
                    const stats = getDisplayValues();
                    soldeTheorique = stats.soldeTheorique;
                }

                const ecartCalcule = Math.round(montantClotureNum - soldeTheorique);
                setEcart(ecartCalcule);
                setAfficherJustification(ecartCalcule !== 0);
            }, 500);

            setEcartTimeout(timeoutId);
        }
    };

    const handleCloseCaisse = async (e) => {
        e.preventDefault();
        setSuccess('');
        setClosingCaisse(true);

        const montantClotureNum = parseFloat(montantCloture);
        if (isNaN(montantClotureNum)) {
            toast.error("Veuillez saisir un montant valide.");
            setClosingCaisse(false);
            return;
        }

        // Recalculer l'écart
        let soldeTheorique = 0;
        if (isCorrection && currentRapportForCorrection) {
            soldeTheorique = currentRapportForCorrection.soldeTheorique;
        } else if (caisseStatut) {
            const source = statistiquesSession || caisseStatut;
            const stats = {
                f: source.fondInitial || 0,
                v: source.totalVentes ?? source.session?.totalVentes ?? 0,
                m_sales: source.totalMobileMoneySales ?? source.session?.totalMobileMoneySales ?? ((source.totalMobileMoney ?? source.session?.totalMobileMoney ?? 0) - (source.totalMobileMoneyRecoveries ?? source.session?.totalMobileMoneyRecoveries ?? 0)),
                m_rec: source.totalMobileMoneyRecoveries ?? source.session?.totalMobileMoneyRecoveries ?? 0,
                d: source.totalDettesAccordees ?? source.session?.totalDettesAccordees ?? source.totalDettes ?? 0,
                r: source.totalRecouvrement ?? source.session?.totalRecouvrement ?? 0,
                dep: source.totalDepenses ?? source.session?.totalDepenses ?? 0
            };
            soldeTheorique = Math.round(stats.f + (stats.v - stats.d - stats.m_sales) + (stats.r - stats.m_rec) - stats.dep);
        }

        const ecartCalcule = montantClotureNum - soldeTheorique;

        // Vérifier si un écart existe et si la justification est obligatoire
        if (ecartCalcule !== 0 && !commentaires.trim()) {
            setEcart(ecartCalcule);
            setAfficherJustification(true);
            toast.error("Veuillez justifier l'écart détecté avant de valider la clôture.");
            setClosingCaisse(false);
            return;
        }

        try {
            if (isCorrection) {
                await caisseAPI.corrigerRapport({
                    montantCloture: Math.round(montantClotureNum),
                    commentairesGérant: commentaires
                });
                toast.success("Rapport corrigé et renvoyé au gérant pour validation.");
            } else {
                await caisseAPI.fermer({
                    montantCloture: Math.round(montantClotureNum),
                    commentairesGérant: commentaires.trim()
                });
                toast.success("Votre rapport a été soumis au gérant pour validation.");
            }
            setMontantCloture('');
            setCommentaires('');
            setEcart(null);
            setAfficherJustification(false);
            setShowCloseModal(false);
            setCurrentRapportForCorrection(null);
            setCaisseStatut(null);
            fetchStatut();
        } catch (err) {
            // Erreur gérée par l'intercepteur
        } finally {
            setClosingCaisse(false);
        }
    };

    const getDisplayValues = () => {
        if (isCorrection && currentRapportForCorrection) {
            const r = currentRapportForCorrection;
            const m_total = r.totalMobileMoney || 0;
            const m_rec = r.totalMobileMoneyRecoveries || 0;
            const m_sales = m_total - m_rec;

            return {
                fondInitial: r.fondInitial || 0,
                totalVentes: r.totalVentes || 0,
                totalVentesCash: Math.round((r.totalVentes || 0) - (r.totalDettes || 0) - m_sales),
                totalVentesFintech: m_sales,
                totalMobileMoneyRecoveries: m_rec,
                totalDettes: r.totalDettes || 0,
                totalDepenses: r.totalDepensesApprouvees || 0,
                totalMobileMoney: m_total,
                totalRecouvrementCash: Math.round((r.totalRecouvrement || 0) - m_rec),
                soldeTheorique: r.soldeTheorique || 0,
                totalRecouvrement: r.totalRecouvrement || 0
            };
        } else {
            const source = statistiquesSession || caisseStatut;
            const v = source?.totalVentes ?? source?.session?.totalVentes ?? 0;
            const d = source?.totalDettesAccordees ?? source?.session?.totalDettesAccordees ?? source?.totalDettes ?? 0;
            const m_total = source?.totalMobileMoney ?? source?.session?.totalMobileMoney ?? 0;
            const m_rec = source?.totalMobileMoneyRecoveries ?? source?.session?.totalMobileMoneyRecoveries ?? 0;
            const m_sales = m_total - m_rec;
            const r = source?.totalRecouvrement ?? source?.session?.totalRecouvrement ?? 0;
            const dep = source?.totalDepenses ?? source?.session?.totalDepenses ?? 0;
            const f = source?.fondInitial ?? 0;

            return {
                fondInitial: f,
                totalVentes: v,
                totalVentesCash: Math.round(v - d - m_sales),
                totalDettes: d,
                totalVentesFintech: m_sales,
                totalMobileMoneyRecoveries: m_rec,
                totalMobileMoney: m_total,
                totalRecouvrementCash: Math.round(r - m_rec),
                totalDepenses: dep,
                totalRecouvrement: r,
                soldeTheorique: Math.round(f + (v - d - m_sales) + (r - m_rec) - dep)
            };
        }
    };

    const displayValues = getDisplayValues();

    const renderOpenCaisseForm = () => (
        <Card className="border-0 shadow-sm rounded-4">
            <Card.Body className="p-4">
                <div className="text-center mb-4">
                    <iconify-icon icon="solar:lock-keyhole-minimalistic-bold-duotone" style={{ fontSize: '64px' }} className="text-danger"></iconify-icon>
                    <h4 className="fw-bold mt-3">Caisse Fermée</h4>
                    <p className="text-muted">Veuillez ouvrir votre caisse pour commencer à enregistrer des ventes.</p>
                </div>
                <Form onSubmit={handleOpenCaisse}>
                    <Form.Group className="mb-3">
                        <Form.Label>Fond de caisse initial</Form.Label>
                        <InputGroup>
                            <Form.Control
                                type="number"
                                min="0"
                                value={fondInitial}
                                onChange={(e) => setFondInitial(e.target.value)}
                                required
                                autoFocus
                                placeholder="Montant en GNF"
                            />
                            <InputGroup.Text>GNF</InputGroup.Text>
                        </InputGroup>
                    </Form.Group>
                    <div className="d-grid">
                        <Button variant="success" type="submit" size="lg" disabled={openingCaisse}>
                            {openingCaisse ? (
                                <>
                                    <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" />
                                    <span className="ms-2">Ouverture...</span>
                                </>
                            ) : (
                                <><iconify-icon icon="solar:key-bold" className="me-2"></iconify-icon> Ouvrir ma Caisse</>
                            )}
                        </Button>
                    </div>
                </Form>
            </Card.Body>
        </Card>
    );

    // Helper pour formater la monnaie sans espaces insécables (compatibilité jsPDF)
    const formatCurrencyPDF = (value) => {
        const num = typeof value === 'number' ? value : parseFloat(value);
        const safe = isNaN(num) ? 0 : num;
        // toLocaleString('fr-FR') insère des espaces insécables (\u202f) que jsPDF ne rend pas
        // => on remplace par des espaces normaux ET on retire manuellement les caractères Unicode
        return safe.toLocaleString('fr-FR').replace(/\u202f/g, ' ').replace(/\u00a0/g, ' ') + ' GNF';
    };

    const exportPDF = (rapport) => {
        const doc = new jsPDF();
        let y = 12;

        // En-tête avec fond coloré
        doc.setFillColor(41, 128, 185);
        doc.rect(0, 0, 210, 22, 'F');
        doc.setFontSize(16);
        doc.setTextColor(255, 255, 255);
        doc.text('Rapport de Caisse Caissier', 14, 14);

        doc.setFontSize(9);
        doc.setTextColor(220, 220, 220);
        doc.text('Date: ' + new Date(rapport.createdAt).toLocaleDateString('fr-FR') + ' - ' + new Date(rapport.createdAt).toLocaleTimeString('fr-FR'), 14, 20);

        y = 28;

        // Résumé du rapport avec autoTable
        const statutLabel = rapport.statut === 'VALIDE_PAR_GERANT' ? 'Validé par Gérant' :
                           rapport.statut === 'REJETE_PAR_GERANT' ? 'Rejeté par Gérant' :
                           rapport.statut === 'VALIDE' ? 'Validé' :
                           rapport.statut === 'REJETE' ? 'Rejeté' :
                           rapport.statut === 'EN_ATTENTE' ? 'En attente' : rapport.statut;

        autoTable(doc, {
            startY: y,
            margin: { left: 14, right: 14 },
            head: [['Description', 'Montant']],
            body: [
                ['Fond Initial', formatCurrencyPDF(rapport.fondInitial)],
                ['Total Ventes', formatCurrencyPDF(rapport.totalVentes)],
                ['Total Mobile Money (Fintech)', formatCurrencyPDF(rapport.totalMobileMoney)],
                ['Total Dettes Accordées', formatCurrencyPDF(rapport.totalDettes)],
                ['Total Recouvrements', formatCurrencyPDF(rapport.totalRecouvrement)],
                ['Total Dépenses', formatCurrencyPDF(rapport.totalDepensesApprouvees)],
                ['Solde Théorique', formatCurrencyPDF(rapport.soldeTheorique)],
                ['Montant Clôturé', formatCurrencyPDF(rapport.montantCloture)],
                ['Écart', formatCurrencyPDF(rapport.ecart)],
                ['Statut', statutLabel],
                ['Commentaires', rapport.commentairesGérant || 'Aucun'],
            ],
            theme: 'grid',
            styles: { fontSize: 10, cellPadding: 3, overflow: 'linebreak' },
            headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
            columnStyles: {
                0: { cellWidth: 80, fontStyle: 'bold' },
                1: { cellWidth: 100, halign: 'right' }
            },
            alternateRowStyles: { fillColor: [245, 247, 250] }
        });

        // Pied de page
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`StockDash Gestion`, 14, doc.internal.pageSize.height - 10);
            doc.text(`Page ${i} / ${pageCount}`, doc.internal.pageSize.width - 20, doc.internal.pageSize.height - 10, { align: 'right' });
        }

        // Sauvegarder
        doc.save(`rapport-caisse-${new Date(rapport.createdAt).toISOString().split('T')[0]}.pdf`);
        toast.success('PDF exporté avec succès!');
    };

    const renderRapportsTab = () => (
        <Card className="border-0 shadow-sm rounded-4 mt-4">
            <Card.Header className="bg-white py-3">
                <h5 className="fw-bold mb-0">Mes Rapports</h5>
            </Card.Header>
            <Card.Body>
                {loadingRapports ? (
                    <div className="text-center p-5"><Spinner animation="border" /></div>
                ) : rapports.length === 0 ? (
                    <Alert variant="info" className="text-center">
                        <iconify-icon icon="solar:info-circle-bold" style={{ fontSize: '40px' }} className="mb-2"></iconify-icon>
                        <p className="mb-0">Aucun rapport disponible pour le moment.</p>
                    </Alert>
                ) : (
                    <>
                        <Table striped hover responsive className="align-middle">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Fond Initial</th>
                                    <th>Ventes</th>
                                    <th>Clôture</th>
                                    <th>Écart</th>
                                    <th>Statut</th>
                                    <th className="text-end">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rapports.map((rapport) => (
                                    <tr key={rapport._id}>
                                        <td>{new Date(rapport.createdAt).toLocaleDateString('fr-FR')}</td>
                                        <td>{(rapport.fondInitial || 0).toLocaleString()} GNF</td>
                                        <td className="text-primary">{(rapport.totalVentes || 0).toLocaleString()} GNF</td>
                                        <td className="text-success">{(rapport.montantCloture || 0).toLocaleString()} GNF</td>
                                        <td className={rapport.ecart === 0 ? 'text-success' : 'text-danger'}>
                                            {(rapport.ecart || 0).toLocaleString()} GNF
                                        </td>
                                        <td>
                                            <Badge bg={
                                                rapport.statut === 'VALIDE' || rapport.statut === 'VALIDE_PAR_GERANT' ? 'success' :
                                                rapport.statut === 'REJETE' || rapport.statut === 'REJETE_PAR_GERANT' ? 'danger' :
                                                'warning'
                                            }>
                                                {rapport.statut === 'VALIDE_PAR_GERANT' ? 'Validé par Gérant' :
                                                 rapport.statut === 'REJETE_PAR_GERANT' ? 'Rejeté par Gérant' :
                                                 rapport.statut}
                                            </Badge>
                                        </td>
                                        <td className="text-end">
                                            <Button
                                                variant="outline-primary"
                                                size="sm"
                                                onClick={() => exportPDF(rapport)}
                                                title="Exporter PDF"
                                            >
                                                <iconify-icon icon="solar:download-bold"></iconify-icon>
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                        
                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="d-flex justify-content-center mt-3">
                                <Button
                                    variant="outline-secondary"
                                    size="sm"
                                    disabled={page === 1}
                                    onClick={() => loadRapports(page - 1)}
                                    className="me-2"
                                >
                                    Précédent
                                </Button>
                                <span className="align-self-center mx-3">
                                    Page {page} / {totalPages}
                                </span>
                                <Button
                                    variant="outline-secondary"
                                    size="sm"
                                    disabled={page === totalPages}
                                    onClick={() => loadRapports(page + 1)}
                                >
                                    Suivant
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </Card.Body>
        </Card>
    );

    const renderStatsTab = () => (
        <Card className="border-0 shadow-sm rounded-4 mt-4">
            <Card.Header className="bg-white py-3">
                <h5 className="fw-bold mb-0">Statistiques de Performance</h5>
            </Card.Header>
            <Card.Body>
                <Row className="g-3">
                    <Col md={3}>
                        <Card className="bg-primary-subtle border-0">
                            <Card.Body className="text-center">
                                <iconify-icon icon="solar:clipboard-list-bold" style={{ fontSize: '40px', color: '#0d6efd' }}></iconify-icon>
                                <h3 className="fw-bold mt-2">{perfStats.totalSessions}</h3>
                                <p className="text-muted mb-0">Sessions Totales</p>
                            </Card.Body>
                        </Card>
                    </Col>
                    <Col md={3}>
                        <Card className="bg-success-subtle border-0">
                            <Card.Body className="text-center">
                                <iconify-icon icon="solar:banknote-bold" style={{ fontSize: '40px', color: '#198754' }}></iconify-icon>
                                <h3 className="fw-bold mt-2">{(perfStats.totalVentes || 0).toLocaleString()}</h3>
                                <p className="text-muted mb-0">Total Ventes (GNF)</p>
                            </Card.Body>
                        </Card>
                    </Col>
                    <Col md={3}>
                        <Card className="bg-info-subtle border-0">
                            <Card.Body className="text-center">
                                <iconify-icon icon="solar:chart-bold" style={{ fontSize: '40px', color: '#0dcaf0' }}></iconify-icon>
                                <h3 className="fw-bold mt-2">{(perfStats.montantMoyen || 0).toLocaleString()}</h3>
                                <p className="text-muted mb-0">Moyenne par Session (GNF)</p>
                            </Card.Body>
                        </Card>
                    </Col>
                    <Col md={3}>
                        <Card className="bg-warning-subtle border-0">
                            <Card.Body className="text-center">
                                <iconify-icon icon="solar:check-circle-bold" style={{ fontSize: '40px', color: '#ffc107' }}></iconify-icon>
                                <h3 className="fw-bold mt-2">{(perfStats.tauxReussite || 0).toFixed(1)}%</h3>
                                <p className="text-muted mb-0">Taux de Réussite</p>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
            </Card.Body>
        </Card>
    );

    const renderCaisseOuverte = () => (
        <Card className="border-0 shadow-sm rounded-4">
            <Card.Header className="bg-success-subtle text-success-emphasis py-3 d-flex justify-content-between align-items-center">
                <h5 className="fw-bold mb-0">
                    <iconify-icon icon="solar:play-circle-bold" className="me-2"></iconify-icon>
                    Ma Caisse Ouverte
                </h5>
                <Badge bg="success" pill>Session en cours</Badge>
            </Card.Header>
            <Card.Body className="p-4">
                <Row className="g-3 text-center">
                    <Col md={3}>
                        <Card className="bg-light border-0">
                            <Card.Body>
                                <h6 className="text-muted">Fond Initial</h6>
                                <h4 className="fw-bold">{(caisseStatut.fondInitial || 0).toLocaleString()} GNF</h4>
                            </Card.Body>
                        </Card>
                    </Col>
                    <Col md={3}>
                        <Card className="bg-light border-0">
                            <Card.Body>
                                <h6 className="text-muted">Ventes de la session</h6>
                                <h4 className="fw-bold text-primary">{(caisseStatut.session?.totalVentes || 0).toLocaleString()} GNF</h4>
                                <small className="text-muted">{caisseStatut.session?.nombreVentes || 0} transaction(s)</small>
                            </Card.Body>
                        </Card>
                    </Col>
                    <Col md={3}>
                        <Card className="bg-light border-0">
                            <Card.Body>
                                <h6 className="text-muted">Recouvrements</h6>
                                <h4 className="fw-bold text-info">{(caisseStatut.totalRecouvrement ?? caisseStatut.session?.totalRecouvrement ?? 0).toLocaleString()} GNF</h4>
                                <small className="text-muted">Dettes payées</small>
                            </Card.Body>
                        </Card>
                    </Col>
                    <Col md={3}>
                        <Card className="bg-light border-0">
                            <Card.Body>
                                <h6 className="text-muted">Dépenses</h6>
                                <h4 className="fw-bold text-danger">{(caisseStatut.session?.totalDepenses || 0).toLocaleString()} GNF</h4>
                                <small className="text-muted">{caisseStatut.session?.nombreDepenses || 0} dépense(s)</small>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
                <div className="d-grid mt-4">
                    <Button variant="danger" size="lg" onClick={() => setShowCloseModal(true)}>
                        <iconify-icon icon="solar:logout-3-bold" className="me-2"></iconify-icon>
                        Clôturer ma Caisse et Envoyer le Rapport
                    </Button>
                </div>
            </Card.Body>
        </Card>
    );

    const renderCloseModal = () => (
        <Modal show={showCloseModal} onHide={() => setShowCloseModal(false)} centered size="lg">
            <Modal.Header closeButton>
                <Modal.Title className="d-flex align-items-center">
                    Clôturer ma caisse
                    {isCorrection && <Badge bg="warning" text="dark" className="ms-2 fs-6">Mode Correction</Badge>}
                </Modal.Title>
            </Modal.Header>
            <Form onSubmit={handleCloseCaisse}>
                <Modal.Body>
                    <p>Veuillez compter le montant total présent physiquement dans votre caisse et le saisir ci-dessous.</p>
                    <Row className="mb-3">
                        <Col md={6}>
                            <Card className="bg-light border-0">
                                <Card.Body>
                                    <h6 className="text-muted">Fond Initial</h6>
                                    <h5 className="fw-bold">{(caisseStatut?.fondInitial || 0).toLocaleString()} GNF</h5>
                                </Card.Body>
                            </Card>
                        </Col>
                        <Col md={6}>
                            <Card className="bg-light border-0">
                                <Card.Body>
                                    <h6 className="text-muted">Ventes de la session</h6>
                                    <h5 className="fw-bold text-primary">{(caisseStatut?.session?.totalVentes || 0).toLocaleString()} GNF</h5>
                                </Card.Body>
                            </Card>
                        </Col>
                    </Row>

                    <Form.Group className="mb-3">
                        <Form.Label>Montant de clôture</Form.Label>
                        <InputGroup>
                            <Form.Control
                                type="number"
                                min="0"
                                value={montantCloture}
                                onChange={handleMontantClotureChange}
                                required
                                autoFocus
                            />
                            <InputGroup.Text>GNF</InputGroup.Text>
                        </InputGroup>
                    </Form.Group>

                    {/* Résumé financier */}
                    <Card className="mb-3 bg-light border-2">
                        <Card.Body className="p-3">
                            <div className="d-flex justify-content-between mb-2">
                                <span className="text-muted d-flex align-items-center">
                                    <iconify-icon icon="solar:phone-calling-bold" className="me-2" style={{ color: '#FF6600' }}></iconify-icon>
                                    Ventes (Fintech)
                                </span>
                                <span className="fw-bold" style={{ color: '#FF6600' }}>+ {(displayValues.totalVentesFintech || 0).toLocaleString()} GNF</span>
                            </div>
                            <div className="d-flex justify-content-between mb-2">
                                <span className="text-muted d-flex align-items-center">
                                    <iconify-icon icon="solar:phone-calling-bold" className="me-2" style={{ color: '#FF6600' }}></iconify-icon>
                                    Recouvrement (Fintech)
                                </span>
                                <span className="fw-bold" style={{ color: '#FF6600' }}>+ {(displayValues.totalMobileMoneyRecoveries || 0).toLocaleString()} GNF</span>
                            </div>
                            <div className="d-flex justify-content-between mb-2 pt-2 border-top border-warning border-opacity-50 align-items-center">
                                <span className="fw-bold d-flex align-items-center" style={{ color: '#FF6600' }}>
                                    <iconify-icon icon="solar:phone-calling-bold" className="me-2"></iconify-icon>
                                    Total Flux Fintech
                                </span>
                                <div className="text-end">
                                    <span className="fw-bold d-block" style={{ color: '#FF6600' }}>{(displayValues.totalMobileMoney || 0).toLocaleString()} GNF</span>
                                    {((displayValues.totalMobileMoney || 0) > 0) && (
                                        <Button
                                            variant="link"
                                            size="sm"
                                            className="p-0 text-decoration-none x-small fw-bold"
                                            style={{ color: '#FF6600', fontSize: '0.7rem' }}
                                            onClick={toggleActiveFintechDetails}
                                        >
                                            {showActiveFintechDetails ? 'Masquer détails' : 'Voir transactions'}
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {showActiveFintechDetails && (
                                <div className="mb-3 animate__animated animate__fadeIn">
                                    {loadingFintechDetails ? (
                                        <div className="text-center py-2"><Spinner size="sm" style={{ color: '#FF6600' }} /></div>
                                    ) : (
                                        <div className="border rounded bg-white overflow-auto" style={{ maxHeight: '150px' }}>
                                            <Table size="sm" hover className="mb-0 x-small" style={{ fontSize: '0.75rem' }}>
                                                <thead className="bg-light sticky-top">
                                                    <tr>
                                                        <th className="ps-2">Heure</th>
                                                        <th>Type</th>
                                                        <th className="text-end pe-2">Montant</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {activeFintechData.sales.map(v => (
                                                        <tr key={v._id}>
                                                            <td className="ps-2 text-muted">{new Date(v.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                                                            <td>Vente ({v.modePaiement === 'Orange Money' ? 'OM' : v.modePaiement === 'MobiCash' ? 'Mobi' : 'Card'})</td>
                                                            <td className="text-end pe-2 fw-bold" style={{ color: '#FF6600' }}>{(v.prixTotal || 0).toLocaleString()}</td>
                                                        </tr>
                                                    ))}
                                                    {activeFintechData.recoveries.map(p => (
                                                        <tr key={p._id}>
                                                            <td className="ps-2 text-muted">{new Date(p.datePaiement || p.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                                                            <td className="text-info">Recouv. ({p.modePaiement === 'Orange Money' ? 'OM' : 'Mobi'})</td>
                                                            <td className="text-end pe-2 fw-bold text-info">{(p.montant || 0).toLocaleString()}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </Table>
                                        </div>
                                    )}
                                </div>
                            )}

                            <hr className="my-3 opacity-25" />

                            <div className="d-flex justify-content-between mb-2">
                                <span className="text-muted d-flex align-items-center">
                                    <iconify-icon icon="solar:vault-bold" className="me-2"></iconify-icon>
                                    Fond initial
                                </span>
                                <span className="fw-bold">{(displayValues.fondInitial || 0).toLocaleString()} GNF</span>
                            </div>
                            <div className="d-flex justify-content-between mb-2">
                                <span className="text-muted d-flex align-items-center">
                                    <iconify-icon icon="solar:banknote-bold" className="me-2 text-success"></iconify-icon>
                                    Ventes au comptant (Cash)
                                </span>
                                <span className="fw-bold text-success">+ {(displayValues.totalVentesCash || 0).toLocaleString()} GNF</span>
                            </div>
                            <div className="d-flex justify-content-between mb-2">
                                <span className="text-muted d-flex align-items-center">
                                    <iconify-icon icon="solar:hand-money-bold" className="me-2 text-info"></iconify-icon>
                                    Recouvrements (Cash)
                                </span>
                                <span className="fw-bold text-info">+ {(displayValues.totalRecouvrementCash || 0).toLocaleString()} GNF</span>
                            </div>
                            <div className="d-flex justify-content-between mb-2">
                                <span className="text-muted d-flex align-items-center">
                                    <iconify-icon icon="solar:notebook-bold" className="me-2 text-warning"></iconify-icon>
                                    Dettes accordées (Crédit)
                                </span>
                                <span className="fw-bold text-warning">- {(displayValues.totalDettes || 0).toLocaleString()} GNF</span>
                            </div>
                            <div className="d-flex justify-content-between">
                                <span className="text-muted d-flex align-items-center">
                                    <iconify-icon icon="solar:wallet-minus-bold" className="me-2 text-danger"></iconify-icon>
                                    Total Dépenses
                                </span>
                                <span className="fw-bold text-danger">- {(displayValues.totalDepenses || 0).toLocaleString()} GNF</span>
                            </div>
                            <hr />
                            <div className="d-flex justify-content-between align-items-center">
                                <span className="fw-bold text-danger d-flex align-items-center">
                                    <iconify-icon icon="solar:safe-square-bold" className="me-2" style={{ fontSize: '20px' }}></iconify-icon>
                                    Total Espèces Attendu
                                </span>
                                <span className="fw-bold fs-5 text-danger">{(displayValues.soldeTheorique || 0).toLocaleString()} GNF</span>
                            </div>
                        </Card.Body>
                    </Card>

                    {afficherJustification && (
                        <Alert variant="danger" className="blink-animation">
                            <strong>Écart détecté :</strong> {(ecart || 0).toLocaleString()} GNF. Veuillez justifier cet écart dans les commentaires ci-dessous.
                        </Alert>
                    )}
                    {afficherJustification && (
                        <Form.Group>
                            <Form.Label className="blink-animation text-danger fw-bold">
                                Commentaires (Obligatoire)
                            </Form.Label>
                            <Form.Control
                                as="textarea"
                                rows={3}
                                value={commentaires}
                                onChange={(e) => setCommentaires(e.target.value)}
                                placeholder="Justifiez l'écart détecté..."
                                className="border-danger"
                                style={{
                                    borderColor: '#dc3545',
                                    animation: 'blinker 1.5s linear infinite'
                                }}
                            />
                        </Form.Group>
                    )}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowCloseModal(false)} disabled={closingCaisse}>Annuler</Button>
                    <Button variant="danger" type="submit" disabled={closingCaisse}>
                        {closingCaisse ? (
                            <>
                                <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" />
                                <span className="ms-2">Soumission en cours...</span>
                            </>
                        ) : isCorrection ? 'Corriger et Renvoyer' : 'Soumettre le Rapport'}
                    </Button>
                </Modal.Footer>
            </Form>
        </Modal>
    );

    if (loading) return <div className="text-center p-5"><Spinner animation="border" /></div>;

    return (
        <div className="p-4">
            <h3 className="fw-bold mb-4">Ma Caisse</h3>
            {success && <Alert variant="success">{success}</Alert>}

            <Tabs defaultActiveKey="caisse" id="caissier-tabs" className="mb-3">
                <Tab eventKey="caisse" title="Caisse">
                    {caisseStatut ? renderCaisseOuverte() : renderOpenCaisseForm()}
                </Tab>
                <Tab eventKey="rapports" title="Mes Rapports">
                    {renderRapportsTab()}
                </Tab>
                <Tab eventKey="statistiques" title="Statistiques">
                    {renderStatsTab()}
                </Tab>
            </Tabs>

            {caisseStatut && renderCloseModal()}
        </div>
    );
};

export default CaissierCaisseView;