// src/components/AdminCaisseView.js
import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Table, Badge, Tabs, Tab, Spinner, Alert, Modal, Form, Row, Col, OverlayTrigger, Tooltip, Pagination } from 'react-bootstrap';
import { useSearchParams } from 'react-router-dom';
import { caisseAPI, authAPI } from '../services/api';
import jsPDF from 'jspdf';
import logo from '../assets/logo.png';
import autoTable from 'jspdf-autotable';

const AdminCaisseView = () => {
    const [searchParams] = useSearchParams();
    const [key, setKey] = useState(searchParams.get('tab') || 'rapports');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Données
    const [managers, setManagers] = useState([]);
    const [rapports, setRapports] = useState([]);
    const [caisseAdmin, setCaisseAdmin] = useState(null);
    
    // Filtres
    const [dateFilter, setDateFilter] = useState({ startDate: '', endDate: '' });
    const [filterGerant, setFilterGerant] = useState('');

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const [showValidateReportModal, setShowValidateReportModal] = useState(false);
    const [showRejectReportModal, setShowRejectReportModal] = useState(false);
    const [selectedReport, setSelectedReport] = useState(null);
    // Nouveaux états pour la modale de détails
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [reportDetails, setReportDetails] = useState(null);
    const [detailsLoading, setDetailsLoading] = useState(false);

    const [adminComment, setAdminComment] = useState('');

    // Chargement des données en fonction de l'onglet actif
    const fetchData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            // On charge toutes les données nécessaires pour la vue, indépendamment de l'onglet
            const [usersRes, rapportsRes, caisseAdminRes] = await Promise.all([
                authAPI.getUsers(),
                caisseAPI.listerRapports({ ...dateFilter, gerant: filterGerant }),
                caisseAPI.getCaisseAdmin()
            ]);

            setManagers(usersRes.data.filter(u => u.role === 'Gérant'));
            setRapports(rapportsRes.data);
            setCaisseAdmin(caisseAdminRes.data);
            setCurrentPage(1); // Réinitialiser la page lors d'un changement de filtre

        } catch (err) {
            console.error(err);
            setError("Impossible de charger les données. Vérifiez votre connexion.");
        } finally {
            setLoading(false);
        }
    }, [dateFilter, filterGerant]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // --- Gestion des Rapports ---

    const handleValidateReportClick = (rapport) => {
        setSelectedReport(rapport);
        setAdminComment('');
        setShowValidateReportModal(true);
    };

    const confirmValidateReport = async (e) => {
        e.preventDefault();
        try {
            await caisseAPI.validerRapport(selectedReport._id, { commentairesAdmin: adminComment });
            setSuccess("Rapport validé. Le montant a été transféré vers la caisse centrale.");
            setShowValidateReportModal(false);
            fetchData();
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.response?.data?.message || "Erreur lors de la validation.");
        }
    };

    const handleRejectReportClick = (rapport) => {
        setSelectedReport(rapport);
        setAdminComment('');
        setShowRejectReportModal(true);
    };

    const confirmRejectReport = async (e) => {
        e.preventDefault();
        if (!adminComment.trim()) {
            setError("Un motif de rejet est obligatoire.");
            return;
        }
        try {
            await caisseAPI.rejeterRapport(selectedReport._id, { commentairesAdmin: adminComment });
            setSuccess("Rapport rejeté avec succès.");
            setShowRejectReportModal(false);
            fetchData();
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.response?.data?.message || "Erreur lors du rejet.");
        }
    };

    const handleShowDetails = async (rapport) => {
        // Ne rien faire si le rapport est en attente, car les actions sont sur les boutons
        if (rapport.statut === 'EN_ATTENTE') return;

        setShowDetailsModal(true);
        setDetailsLoading(true);
        setError('');
        try {
            const res = await caisseAPI.getReportDetails(rapport._id);
            setReportDetails(res.data);
        } catch (err) {
            setError("Impossible de charger les détails du rapport.");
            setShowDetailsModal(false); // Fermer la modale en cas d'erreur
        } finally {
            setDetailsLoading(false);
        }
    };

    const handleExportPDF = () => {
        const doc = new jsPDF({ orientation: 'landscape' });

        // Helper pour le formatage de la devise dans le PDF
        const formatCurrencyPdf = (amount) => {
            const value = (amount || 0).toLocaleString('fr-FR') + ' GNF';
            return value.replace(/[\u00a0\u202f]/g, ' ');
        };
        
        // En-tête du document
        doc.addImage(logo, 'PNG', 14, 8, 40, 15);
        doc.setFontSize(18);
        doc.setTextColor(41, 128, 185);
        doc.setFont("helvetica", "bold");
        doc.text("HISTORIQUE DES ENCAISSEMENTS", 60, 16);
        doc.setFontSize(11);
        doc.setTextColor(100);
        let startY = 30;
        doc.text(`Période du ${dateFilter.startDate || 'début'} au ${dateFilter.endDate || 'fin'}`, 14, startY);
        startY += 8;
        
        // Informations sur les filtres appliqués
        if (filterGerant) {
            const selectedManager = managers.find(m => m._id === filterGerant);
            doc.text(`Gérant: ${selectedManager?.nom || 'N/A'}`, 14, startY);
            startY += 8;
        }

        // Tableau pour l'historique des encaissements (Caisse Centrale)
        if (key === 'caisse-centrale' && caisseAdmin) {
            const tableColumn = ["Date", "Source", "Gérant", "Montant"];
            const tableRows = [];

            // Filtrer l'historique selon les mêmes critères
            const filteredHistory = caisseAdmin.historique?.filter(entry => {
                const entryDate = new Date(entry.dateValidation);
                const start = dateFilter.startDate ? new Date(dateFilter.startDate) : null;
                const end = dateFilter.endDate ? new Date(dateFilter.endDate) : null;
                if (end) end.setHours(23, 59, 59, 999);

                const dateMatch = (!start || entryDate >= start) && (!end || entryDate <= end);
                
                let gerantMatch = true;
                if (filterGerant) {
                    const selectedManager = managers.find(m => m._id === filterGerant);
                    if (selectedManager) {
                        gerantMatch = entry.gerant === selectedManager.nom;
                    }
                }
                return dateMatch && gerantMatch;
            }) || [];

            // Trier par date décroissante (le plus récent en premier)
            const sortedHistory = [...filteredHistory].reverse();

            sortedHistory.forEach(entry => {
                const entryData = [
                    new Date(entry.dateValidation).toLocaleDateString('fr-FR'),
                    entry.boutique || 'N/A',
                    entry.gerant || 'N/A',
                    formatCurrencyPdf(entry.montant)
                ];
                tableRows.push(entryData);
            });

            // Ajouter un total en bas du tableau
            const totalEncaissements = sortedHistory.reduce((acc, entry) => acc + (entry.montant || 0), 0);
            tableRows.push(['', '', 'TOTAL GÉNÉRAL', formatCurrencyPdf(totalEncaissements)]);


            autoTable(doc, {
                head: [tableColumn],
                body: tableRows,
                startY: startY,
                theme: 'grid',
                styles: {
                    halign: 'center',
                    valign: 'middle',
                    fontSize: 10
                },
                headStyles: {
                    fillColor: [41, 128, 185],
                    textColor: [255, 255, 255],
                    fontSize: 11,
                    fontStyle: 'bold'
                },
                columnStyles: {
                    0: { cellWidth: 40 }, // Date
                    1: { cellWidth: 70 }, // Source
                    2: { cellWidth: 70 }, // Gérant
                    3: { cellWidth: 60, halign: 'right' }  // Montant
                },
                alternateRowStyles: {
                    fillColor: [245, 245, 245]
                }
            });

            // Ajouter le solde actuel de la caisse centrale
            doc.setFontSize(12);
            doc.setTextColor(0);
            const finalY = doc.autoTable.previous ? doc.autoTable.previous.finalY : 100;
            doc.text(`Solde Actuel Caisse Centrale: ${formatCurrency(caisseAdmin.soldeActuel)}`, 14, finalY + 10);
        } 
        // Tableau pour les rapports de caisse
        else {
            const tableColumn = ["Date", "Gérant", "Boutique", "Solde Théorique", "Montant Reçu", "Écart"];
            const tableRows = [];

            // Filtrer les rapports selon les filtres actuels (date et gérant)
            const filteredRapports = rapports.filter(report => {
                const reportDate = new Date(report.createdAt);
                const start = dateFilter.startDate ? new Date(dateFilter.startDate) : null;
                const end = dateFilter.endDate ? new Date(dateFilter.endDate) : null;
                if (end) end.setHours(23, 59, 59, 999);

                const dateMatch = (!start || reportDate >= start) && (!end || reportDate <= end);
                
                let gerantMatch = true;
                if (filterGerant) {
                    gerantMatch = report.gerant?._id === filterGerant;
                }
                return dateMatch && gerantMatch;
            });

            filteredRapports.forEach(report => {
                const reportData = [
                    new Date(report.createdAt).toLocaleDateString('fr-FR'),
                    report.gerant?.nom || 'N/A',
                    report.boutique?.nom || 'N/A',
                    formatCurrencyPdf(report.soldeTheorique),
                    formatCurrencyPdf(report.montantCloture),
                    formatCurrencyPdf(report.ecart)
                ];
                tableRows.push(reportData);
            });

            autoTable(doc, {
                head: [tableColumn],
                body: tableRows,
                startY: startY,
                theme: 'grid',
                headStyles: {
                    fillColor: [41, 128, 185],
                    fontSize: 11,
                    fontStyle: 'bold',
                    halign: 'center'
                },
                bodyStyles: {
                    fontSize: 10,
                    valign: 'middle'
                },
                columnStyles: {
                    0: { cellWidth: 30 }, // Date
                    1: { cellWidth: 45 }, // Gérant
                    2: { cellWidth: 45 }, // Boutique
                    3: { halign: 'right', cellWidth: 50 }, // Solde Théorique
                    4: { halign: 'right', cellWidth: 50 }, // Montant Reçu
                    5: { halign: 'right', cellWidth: 40 }  // Écart
                }
            });
        }

        doc.save(`historique_encaissements_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    // --- Utilitaires d'affichage ---

    const formatCurrency = (amount) => {
        // Remplace les espaces insécables par des espaces normaux pour la cohérence
        return ((amount || 0).toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' ');
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'APPROUVEE':
            case 'VALIDE':
                return <Badge bg="success">Validé</Badge>;
            case 'REFUSEE':
            case 'REJETE':
                return <Badge bg="danger">Refusé</Badge>;
            case 'EN_ATTENTE':
                return <Badge bg="warning" text="dark">En attente</Badge>;
            default:
                return <Badge bg="secondary">{status}</Badge>;
        }
    };

    // Logique de pagination
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentRapports = rapports.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(rapports.length / itemsPerPage);

    // Filtrage de l'historique des encaissements (Caisse Centrale) pour les totaux et l'affichage
    const filteredHistory = caisseAdmin?.historique?.filter(entry => {
        const entryDate = new Date(entry.dateValidation);
        const start = dateFilter.startDate ? new Date(dateFilter.startDate) : null;
        const end = dateFilter.endDate ? new Date(dateFilter.endDate) : null;
        if (end) end.setHours(23, 59, 59, 999);

        const dateMatch = (!start || entryDate >= start) && (!end || entryDate <= end);
        
        let gerantMatch = true;
        if (filterGerant) {
            const selectedManager = managers.find(m => m._id === filterGerant);
            if (selectedManager) {
                gerantMatch = entry.gerant === selectedManager.nom;
            }
        }
        return dateMatch && gerantMatch;
    }) || [];

    // Calcul des totaux pour l'affichage
    const totalEncaissementsPeriode = filteredHistory.reduce((acc, entry) => acc + entry.montant, 0);
    const totalTheorique = rapports.reduce((acc, r) => acc + r.soldeTheorique, 0);

    return (
        <div className="p-4">
            <style>{`
                .clickable-row {
                    cursor: pointer;
                }
            `}</style>

            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
                <h3 className="fw-bold mb-0">Finances & Caisse</h3>
                <div className="d-flex gap-2 align-items-center flex-wrap">
                    <Form.Select size="sm" value={filterGerant} onChange={e => setFilterGerant(e.target.value)} className="rounded-pill shadow-sm" style={{ minWidth: '150px' }}>
                        <option value="">Tous les gérants</option>
                        {managers.map(m => <option key={m._id} value={m._id}>{m.nom}</option>)}
                    </Form.Select>
                    <div className="d-flex gap-2 align-items-center">
                        <Form.Control 
                            type="date" 
                            size="sm"
                            value={dateFilter.startDate} 
                            onChange={e => setDateFilter({...dateFilter, startDate: e.target.value})}
                            className="rounded-pill shadow-sm"
                            title="Date début"
                        />
                        <span className="text-muted">-</span>
                        <Form.Control 
                            type="date" 
                            size="sm"
                            value={dateFilter.endDate} 
                            onChange={e => setDateFilter({...dateFilter, endDate: e.target.value})}
                            className="rounded-pill shadow-sm"
                            title="Date fin"
                        />
                    </div>
                    <Button variant="outline-secondary" onClick={handleExportPDF} className="rounded-pill shadow-sm">
                        <iconify-icon icon="solar:printer-bold" className="me-2 align-middle"></iconify-icon>
                        Exporter
                    </Button>
                    <Button variant="outline-primary" onClick={fetchData} className="rounded-pill shadow-sm ms-2">
                        <iconify-icon icon="solar:refresh-bold" className="me-2 align-middle"></iconify-icon>
                        Actualiser
                    </Button>
                </div>
            </div>

            {/* Cartes de résumé rapide */}
            <Row className="mb-4 g-3">
                <Col md={6}>
                    <Card className="border-0 shadow-sm bg-primary-subtle text-primary h-100">
                        <Card.Body className="d-flex align-items-center justify-content-between">
                            <div>
                                <h6 className="mb-1">Total des Encaissements (Période)</h6>
                                <h4 className="fw-bold mb-0">{formatCurrency(totalEncaissementsPeriode)}</h4>
                            </div>
                            <iconify-icon icon="solar:wallet-money-bold-duotone" style={{ fontSize: '40px', opacity: 0.5 }}></iconify-icon>
                        </Card.Body>
                    </Card>
                </Col>
                <Col md={6}>
                    <Card className="border-0 shadow-sm bg-success-subtle text-success h-100">
                        <Card.Body className="d-flex align-items-center justify-content-between">
                            <div>
                                <h6 className="mb-1">Solde Théorique (Période)</h6>
                                <h4 className="fw-bold mb-0">{formatCurrency(totalTheorique)}</h4>
                            </div>
                            <iconify-icon icon="solar:chart-square-bold-duotone" style={{ fontSize: '40px', opacity: 0.5 }}></iconify-icon>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            {success && <Alert variant="success" onClose={() => setSuccess('')} dismissible>{success}</Alert>}
            {error && <Alert variant="danger" onClose={() => setError('')} dismissible>{error}</Alert>}

            <Tabs
                id="admin-caisse-tabs"
                activeKey={key}
                onSelect={(k) => setKey(k)}
                className="mb-4 nav-tabs-custom"
            >
                {/* ONGLET 2 : RAPPORTS DE CAISSE */}
                <Tab eventKey="rapports" title={<span><iconify-icon icon="solar:document-text-bold" className="me-2"></iconify-icon>Rapports de Caisse</span>}>
                    <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
                        <Card.Body className="p-0">
                            <Table hover responsive className="align-middle mb-0">
                                <thead className="bg-light">
                                    <tr>
                                        <th className="ps-4 py-3">Date Clôture</th>
                                        <th className="py-3">Gérant / Boutique</th>
                                        <th className="py-3 text-end">Total Ventes</th>
                                        <th className="py-3 text-end">Dépenses</th>
                                        <th className="py-3 text-end">Solde Théorique</th>
                                        <th className="py-3 text-end">Montant Reçu</th>
                                        <th className="py-3 text-center">Écart</th>
                                        <th className="py-3 text-center">Statut</th>
                                        <th className="pe-4 py-3 text-end">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan="9" className="text-center py-5"><Spinner animation="border" /></td></tr>
                                    ) : currentRapports.length > 0 ? (
                                        currentRapports.map(r => (
                                            <tr 
                                                key={r._id} 
                                                onClick={() => handleShowDetails(r)} 
                                                className={`${r.statut === 'EN_ATTENTE' ? 'bg-warning-subtle' : 'clickable-row'}`}
                                            >
                                                <td className="ps-4 text-nowrap">
                                                    {new Date(r.createdAt).toLocaleDateString()}
                                                    <div className="small text-muted">{new Date(r.createdAt).toLocaleTimeString()}</div>
                                                </td>
                                                <td>
                                                    <div className="fw-bold">{r.gerant?.nom || 'Inconnu'}</div>
                                                    <div className="small text-muted">{r.boutique?.nom || 'N/A'}</div>
                                                </td>
                                                <td className="text-end text-success">{formatCurrency(r.totalVentes)}</td>
                                                <td className="text-end text-danger">{formatCurrency(r.totalDepensesApprouvees)}</td>
                                                <td className="text-end fw-bold">{formatCurrency(r.soldeTheorique)}</td>
                                                <td className="text-end fw-bold text-primary">{formatCurrency(r.montantCloture)}</td>
                                                <td className="text-center">
                                                    {r.ecart !== 0 ? (
                                                        <Badge bg="danger">{formatCurrency(r.ecart)}</Badge>
                                                    ) : <Badge bg="success">OK</Badge>}
                                                </td>
                                                <td className="text-center">
                                                    {r.statut === 'REJETE' && r.commentairesAdmin ? (
                                                        <OverlayTrigger overlay={<Tooltip>Motif: {r.commentairesAdmin}</Tooltip>}>
                                                            {getStatusBadge(r.statut)}
                                                        </OverlayTrigger>
                                                    ) : (
                                                        getStatusBadge(r.statut)
                                                    )}
                                                </td>
                                                <td className="pe-4 text-end">
                                                    {r.statut === 'EN_ATTENTE' && (
                                                        <div className="d-flex justify-content-end gap-2">
                                                            <Button variant="success" size="sm" onClick={() => handleValidateReportClick(r)}>Valider</Button>
                                                            <Button variant="danger" size="sm" onClick={() => handleRejectReportClick(r)}>Rejeter</Button>
                                                        </div>
                                                    )}
                                                    {r.statut === 'VALIDE' && (
                                                        <span className="text-success small"><iconify-icon icon="solar:check-read-bold"></iconify-icon> Encaissé</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr><td colSpan="9" className="text-center py-5 text-muted">Aucun rapport trouvé.</td></tr>
                                    )}
                                </tbody>
                            </Table>
                            {totalPages > 1 && (
                                <div className="d-flex justify-content-center p-3 border-top">
                                    <Pagination>
                                        <Pagination.Prev onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1} />
                                        {[...Array(totalPages)].map((_, idx) => (
                                            <Pagination.Item key={idx + 1} active={idx + 1 === currentPage} onClick={() => setCurrentPage(idx + 1)}>{idx + 1}</Pagination.Item>
                                        ))}
                                        <Pagination.Next onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} />
                                    </Pagination>
                                </div>
                            )}
                        </Card.Body>
                    </Card>
                </Tab>

                {/* ONGLET 3 : CAISSE CENTRALE */}
                <Tab eventKey="caisse-centrale" title={<span><iconify-icon icon="solar:safe-square-bold" className="me-2"></iconify-icon>Caisse Centrale</span>}>
                    <Row className="g-4">
                        <Col md={4}>
                            <Card className="border-0 shadow-sm rounded-4 bg-primary text-white h-100">
                                <Card.Body className="p-4 d-flex flex-column justify-content-center align-items-center text-center">
                                    <div className="bg-white text-primary rounded-circle d-flex align-items-center justify-content-center mb-3" style={{ width: '60px', height: '60px' }}>
                                        <iconify-icon icon="solar:wallet-money-bold" style={{ fontSize: '32px' }}></iconify-icon>
                                    </div>
                                    <h5 className="opacity-75 mb-1">Solde Actuel Caisse Centrale</h5>
                                    <h2 className="fw-bold display-5 mb-0">
                                        {caisseAdmin ? formatCurrency(caisseAdmin.soldeActuel) : <Spinner size="sm" />}
                                    </h2>
                                </Card.Body>
                            </Card>
                        </Col>
                        <Col md={8}>
                            <Card className="border-0 shadow-sm rounded-4 h-100">
                                <Card.Header className="bg-white py-3">
                                    <h5 className="fw-bold mb-0">Historique des encaissements</h5>
                                </Card.Header>
                                <Card.Body className="p-0 overflow-auto" style={{ maxHeight: '400px' }}>
                                    <Table hover className="align-middle mb-0">
                                        <thead className="bg-light sticky-top">
                                            <tr>
                                                <th className="ps-4">Date</th>
                                                <th>Source</th>
                                                <th className="text-end pe-4">Montant</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredHistory.length > 0 ? (
                                                [...filteredHistory].reverse().map((entry, idx) => (
                                                    <tr key={idx}>
                                                        <td className="ps-4">
                                                            {new Date(entry.dateValidation).toLocaleDateString()}
                                                            <div className="small text-muted">Validé par {entry.admin}</div>
                                                        </td>
                                                        <td>
                                                            {entry.description ? (
                                                                <div className="fw-bold">{entry.description}</div>
                                                            ) : (
                                                                <div className="fw-bold">Rapport de: {entry.boutique}</div>
                                                            )}
                                                            <div className="small text-muted">Gérant: {entry.gerant}</div>
                                                        </td>
                                                        <td className="text-end pe-4 fw-bold text-success">
                                                            + {formatCurrency(entry.montant)}
                                                        </td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr><td colSpan="3" className="text-center py-4 text-muted">Aucun historique disponible.</td></tr>
                                            )}
                                        </tbody>
                                    </Table>
                                </Card.Body>
                            </Card>
                        </Col>
                    </Row>
                </Tab>
            </Tabs>

            {/* Modale Validation Rapport */}
            <Modal show={showValidateReportModal} onHide={() => setShowValidateReportModal(false)} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Valider le Rapport de Caisse</Modal.Title>
                </Modal.Header>
                <Form onSubmit={confirmValidateReport}>
                    <Modal.Body>
                        <Alert variant="info">
                            En validant ce rapport, le montant théorique de <strong>{selectedReport && formatCurrency(selectedReport.soldeTheorique)}</strong> sera ajouté à la Caisse Centrale.
                        </Alert>
                        {selectedReport && selectedReport.ecart !== 0 && (
                            <Alert variant="warning">
                                <strong>Attention :</strong> Il y a un écart de {formatCurrency(selectedReport.ecart)} dans ce rapport.
                                <div className="small mt-1" style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap', maxHeight: '200px', overflowY: 'auto' }}>Commentaire gérant : {selectedReport.commentairesGérant || "Aucun"}</div>
                            </Alert>
                        )}
                        <Form.Group>
                            <Form.Label>Commentaire Admin (Optionnel)</Form.Label>
                            <Form.Control
                                as="textarea"
                                rows={3}
                                value={adminComment}
                                onChange={(e) => setAdminComment(e.target.value)}
                                placeholder="Observation sur l'écart ou la validation..."
                            />
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowValidateReportModal(false)}>Annuler</Button>
                        <Button variant="success" type="submit">Valider et Encaisser</Button>
                    </Modal.Footer>
                </Form>
            </Modal>

            {/* Modale Détails Rapport */}
            <Modal show={showDetailsModal} onHide={() => setShowDetailsModal(false)} size="xl" centered>
                <Modal.Header closeButton>
                    <Modal.Title>
                        <iconify-icon icon="solar:document-text-bold-duotone" className="me-2"></iconify-icon>
                        Détails du Rapport
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {detailsLoading ? (
                        <div className="text-center py-5"><Spinner animation="border" /></div>
                    ) : reportDetails ? (
                        <>
                            <Row className="mb-4 g-3">
                                <Col md={6}>
                                    <Card className="h-100">
                                        <Card.Body>
                                            <Card.Title as="h6" className="text-muted">Gérant / Boutique</Card.Title>
                                            <Card.Text className="fw-bold fs-5">{reportDetails.rapport.gerant?.nom} / {reportDetails.rapport.boutique?.nom}</Card.Text>
                                        </Card.Body>
                                    </Card>
                                </Col>
                                <Col md={6}>
                                    <Card className="h-100">
                                        <Card.Body>
                                            <Card.Title as="h6" className="text-muted">Date du Rapport</Card.Title>
                                            <Card.Text className="fw-bold fs-5">{new Date(reportDetails.rapport.createdAt).toLocaleString('fr-FR')}</Card.Text>
                                        </Card.Body>
                                    </Card>
                                </Col>
                                <Col md={4}><Card bg="primary-subtle"><Card.Body><Card.Title as="h6">Solde Théorique</Card.Title><Card.Text className="fw-bold fs-5">{formatCurrency(reportDetails.rapport.soldeTheorique)}</Card.Text></Card.Body></Card></Col>
                                <Col md={4}><Card bg="success-subtle"><Card.Body><Card.Title as="h6">Montant Reçu</Card.Title><Card.Text className="fw-bold fs-5">{formatCurrency(reportDetails.rapport.montantCloture)}</Card.Text></Card.Body></Card></Col>
                                <Col md={4}><Card bg={reportDetails.rapport.ecart === 0 ? 'light' : 'danger-subtle'}><Card.Body><Card.Title as="h6">Écart</Card.Title><Card.Text className="fw-bold fs-5">{formatCurrency(reportDetails.rapport.ecart)}</Card.Text></Card.Body></Card></Col>
                            </Row>

                            <Tabs defaultActiveKey="ventes" id="report-details-tabs" className="nav-tabs-custom">
                                <Tab eventKey="ventes" title={<span className="d-flex align-items-center"><iconify-icon icon="solar:cart-large-2-bold" className="me-2"></iconify-icon>Ventes ({reportDetails.ventes.length})</span>}>
                                    <Table striped hover size="sm" className="mt-3">
                                        <thead>
                                            <tr>
                                                <th>Heure</th>
                                                <th>Article</th>
                                                <th className="text-center">Qté</th>
                                                <th className="text-end">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {reportDetails.ventes.map(vente => (
                                                <tr key={vente._id}>
                                                    <td>{new Date(vente.createdAt).toLocaleTimeString('fr-FR')}</td>
                                                    <td>{vente.article?.nom || 'Article supprimé'}</td>
                                                    <td className="text-center">{vente.quantite}</td>
                                                    <td className="text-end fw-bold">{formatCurrency(vente.prixTotal)}</td>
                                                </tr>
                                            ))}
                                            {reportDetails.ventes.length === 0 && (
                                                <tr><td colSpan="4" className="text-center text-muted py-3">Aucune vente pour cette session.</td></tr>
                                            )}
                                        </tbody>
                                    </Table>
                                </Tab>
                                <Tab eventKey="depenses" title={<span className="d-flex align-items-center"><iconify-icon icon="solar:wallet-minus-bold" className="me-2"></iconify-icon>Dépenses ({reportDetails.depenses.length})</span>}>
                                    <Table striped hover size="sm" className="mt-3">
                                        <thead>
                                            <tr>
                                                <th>Heure</th>
                                                <th>Motif</th>
                                                <th className="text-end">Montant</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {reportDetails.depenses.map(depense => (
                                                <tr key={depense._id}>
                                                    <td>{new Date(depense.createdAt).toLocaleTimeString('fr-FR')}</td>
                                                    <td>{depense.motif}</td>
                                                    <td className="text-end fw-bold text-danger">{formatCurrency(depense.montant)}</td>
                                                </tr>
                                            ))}
                                            {reportDetails.depenses.length === 0 && (
                                                <tr><td colSpan="3" className="text-center text-muted py-3">Aucune dépense pour cette session.</td></tr>
                                            )}
                                        </tbody>
                                    </Table>
                                </Tab>
                            </Tabs>
                        </>
                    ) : <Alert variant="info">Aucun détail à afficher.</Alert>}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowDetailsModal(false)}>Fermer</Button>
                </Modal.Footer>
            </Modal>

            {/* Modale Rejet Rapport */}
            <Modal show={showRejectReportModal} onHide={() => setShowRejectReportModal(false)} centered>
                <Modal.Header closeButton>
                    <Modal.Title className="text-danger">Rejeter le Rapport</Modal.Title>
                </Modal.Header>
                <Form onSubmit={confirmRejectReport}>
                    <Modal.Body>
                        <p>Vous êtes sur le point de rejeter le rapport de <strong>{selectedReport?.gerant?.nom}</strong>.</p>
                        {selectedReport && selectedReport.ecart !== 0 && (
                            <Alert variant="warning">
                                <strong>Rappel :</strong> Il y a un écart de {formatCurrency(selectedReport.ecart)} dans ce rapport.
                            </Alert>
                        )}
                        <Form.Group>
                            <Form.Label>Motif du rejet (Obligatoire)</Form.Label>
                            <Form.Control
                                as="textarea"
                                rows={3}
                                value={adminComment}
                                onChange={(e) => setAdminComment(e.target.value)}
                                required
                                placeholder="Expliquez pourquoi le rapport est rejeté..."
                            />
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowRejectReportModal(false)}>Annuler</Button>
                        <Button variant="danger" type="submit">Confirmer le Rejet</Button>
                    </Modal.Footer>
                </Form>
            </Modal>
        </div>
    );
};

export default AdminCaisseView;
