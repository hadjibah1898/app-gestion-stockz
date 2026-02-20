import React, { useState, useEffect, useCallback } from 'react';
import { Card, Spinner, Alert, Form, Row, Col, Badge, Button, Modal, Pagination, OverlayTrigger, Tooltip, Table } from 'react-bootstrap';
import TableComponent from './common/Table';
import { mouvementAPI, boutiqueAPI } from '../services/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const StockMovementsView = () => {
    const [mouvements, setMouvements] = useState([]);
    const [boutiques, setBoutiques] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filters, setFilters] = useState({ type: '', boutique: '', startDate: '', endDate: '' });
    const [successMessage, setSuccessMessage] = useState('');
    
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [movementToCancel, setMovementToCancel] = useState(null);

    const fetchMouvements = useCallback(async () => {
        try {
            setLoading(true);
            const [mouvementsRes, boutiquesRes] = await Promise.all([
                mouvementAPI.getAll(filters),
                boutiqueAPI.getAll()
            ]);
            setMouvements(mouvementsRes.data);
            setBoutiques(boutiquesRes.data);
        } catch (err) {
            setError(err.response?.data?.message || "Erreur lors du chargement des mouvements.");
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        fetchMouvements();
    }, [fetchMouvements]);

    const handleFilterChange = (e) => {
        setFilters({ ...filters, [e.target.name]: e.target.value });
        setCurrentPage(1); // Revenir à la première page lors d'un filtrage
    };

    const handleCancelClick = (movement) => {
        setMovementToCancel(movement);
        setShowCancelModal(true);
    };

    const confirmCancel = async () => {
        try {
            await mouvementAPI.cancel(movementToCancel._id);
            setSuccessMessage("Opération annulée avec succès.");
            fetchMouvements();
        } catch (err) {
            setError(err.response?.data?.message || "Erreur lors de l'annulation.");
        } finally {
            setShowCancelModal(false);
            setTimeout(() => setSuccessMessage(''), 3000);
        }
    };

    const handleExportPDF = () => {
        const doc = new jsPDF();
        doc.text("Historique des Mouvements de Stock", 14, 15);

        const tableColumn = ["Date", "Type", "Origine", "Destination", "Articles", "Opérateur"];
        const tableRows = [];

        mouvements.forEach(mvt => {
            const date = new Date(mvt.createdAt).toLocaleString('fr-FR');
            const origine = mvt.fournisseur?.nom || mvt.boutiqueSource?.nom || 'N/A';
            const destination = mvt.boutiqueDestination?.nom || (mvt.type === 'Vente' ? 'Client' : 'N/A');
            const articles = mvt.articles.map(a => `${a.nomArticle} (${a.quantite})`).join(', ');
            const operateur = mvt.operateur?.nom || 'Système';

            tableRows.push([date, mvt.type, origine, destination, articles, operateur]);
        });

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 20,
            styles: { fontSize: 8 },
        });

        doc.save("mouvements_stock.pdf");
    };

    const getTypeBadge = (type) => {
        switch (type) {
            case 'Approvisionnement': return 'success';
            case 'Transfert': return 'primary';
            case 'Vente': return 'warning';
            default: return 'secondary';
        }
    };

    const columns = [
        {
            key: 'createdAt',
            label: 'Date',
            render: (date) => new Date(date).toLocaleString('fr-FR')
        },
        {
            key: 'type',
            label: 'Type',
            render: (type) => <Badge bg={getTypeBadge(type)}>{type}</Badge>
        },
        {
            key: 'origine',
            label: 'Origine',
            render: (_, item) => item.fournisseur?.nom || item.boutiqueSource?.nom || 'N/A'
        },
        {
            key: 'destination',
            label: 'Destination',
            render: (_, item) => item.boutiqueDestination?.nom || (item.type === 'Vente' ? 'Client' : 'N/A')
        },
        {
            key: 'articles',
            label: 'Articles',
            render: (articles) => (
                <ul className="list-unstyled mb-0 small">
                    {articles.map((art, idx) => (
                        <li key={idx}>{art.nomArticle} <Badge pill bg="light" text="dark">x{art.quantite}</Badge></li>
                    ))}
                </ul>
            )
        },
        {
            key: 'operateur',
            label: 'Opérateur',
            render: (op) => op?.nom || 'Système'
        },
        {
            key: 'details',
            label: 'Détails',
            render: (details) => <span className="small text-muted">{details}</span>
        },
        {
            key: 'actions',
            label: 'Actions',
            render: (_, item) => {
                if (item.isCancelled || item.details?.includes('ANNULATION')) {
                    let cancelledText = 'Opération Annulée';
                    switch (item.type) {
                        case 'Vente':
                            cancelledText = 'Vente Annulée';
                            break;
                        case 'Transfert':
                            cancelledText = 'Transfert Annulé';
                            break;
                        case 'Approvisionnement':
                            cancelledText = 'Approvisionnement Annulé';
                            break;
                        default: break;
                    }
                    return (
                        <Badge bg="secondary" className="d-flex align-items-center gap-1 px-2 py-1" style={{width: 'fit-content'}}>
                            <iconify-icon icon="solar:close-circle-bold" style={{ fontSize: '16px' }}></iconify-icon>
                            {cancelledText}
                        </Badge>
                    );
                }
                if (item.type === 'Transfert' || item.type === 'Approvisionnement') {
                    return (
                        <OverlayTrigger overlay={<Tooltip>Annuler cette opération et restaurer le stock.</Tooltip>}>
                            <Button variant="link" className="text-danger p-0" onClick={() => handleCancelClick(item)}>
                                <iconify-icon icon="solar:undo-left-round-bold-duotone" style={{ fontSize: '22px' }}></iconify-icon>
                            </Button>
                        </OverlayTrigger>
                    );
                }
                return null;
            }
        }
    ];

    // Logique de pagination
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentMouvements = mouvements.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(mouvements.length / itemsPerPage);

    if (loading) return <Spinner animation="border" />;

    return (
        <div className="p-4">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h3 className="fw-bold mb-0">Mouvements de Stock</h3>
                <Button variant="outline-secondary" onClick={handleExportPDF} className="rounded-pill px-4 shadow-sm">
                    <iconify-icon icon="solar:printer-bold" className="me-2 align-middle"></iconify-icon>
                    Exporter PDF
                </Button>
            </div>
            {error && <Alert variant="danger">{error}</Alert>}
            {successMessage && <Alert variant="success">{successMessage}</Alert>}

            <Card className="border-0 shadow-sm rounded-4 mb-4">
                <Card.Body>
                    <Row className="g-3">
                        <Col md={3}>
                            <Form.Label>Type de mouvement</Form.Label>
                            <Form.Select name="type" value={filters.type} onChange={handleFilterChange}>
                                <option value="">Tous les types</option>
                                <option value="Approvisionnement">Approvisionnement</option>
                                <option value="Transfert">Transfert</option>
                                <option value="Vente">Vente</option>
                            </Form.Select>
                        </Col>
                        <Col md={3}>
                            <Form.Label>Boutique concernée</Form.Label>
                            <Form.Select name="boutique" value={filters.boutique} onChange={handleFilterChange}>
                                <option value="">Toutes les boutiques</option>
                                {boutiques.map(b => (
                                    <option key={b._id} value={b._id}>{b.nom}</option>
                                ))}
                            </Form.Select>
                        </Col>
                        <Col md={3}>
                            <Form.Label>Date début</Form.Label>
                            <Form.Control type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange} />
                        </Col>
                        <Col md={3}>
                            <Form.Label>Date fin</Form.Label>
                            <Form.Control type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange} />
                        </Col>
                    </Row>
                </Card.Body>
            </Card>

            <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
                <Card.Body className="p-0">
                    <Table responsive hover className="align-middle mb-0">
                        <thead className="bg-body-tertiary">
                            <tr>
                                {columns.map(col => <th key={col.key} className="border-0 px-3 small text-uppercase text-muted">{col.label}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {currentMouvements.length > 0 ? (
                                currentMouvements.map((item, index) => {
                                    const isCancelled = item.isCancelled || item.details?.includes('ANNULATION');
                                    return (
                                        <tr key={item._id || index} className={isCancelled ? 'table-light' : ''} style={isCancelled ? { textDecoration: 'line-through', opacity: 0.6 } : {}}>
                                            {columns.map(col => (
                                                <td key={col.key} className="px-3">
                                                    {col.render ? col.render(item[col.key], item) : item[col.key]}
                                                </td>
                                            ))}
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr><td colSpan={columns.length} className="text-center p-4 text-muted">Aucun mouvement de stock trouvé.</td></tr>
                            )}
                        </tbody>
                    </Table>
                    {totalPages > 1 && (
                        <div className="d-flex justify-content-center p-3 border-top">
                            <Pagination className="mb-0">
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
                </Card.Body>
            </Card>

            <Modal show={showCancelModal} onHide={() => setShowCancelModal(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>Confirmer l'annulation</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {movementToCancel?.type === 'Transfert' 
                        ? "Êtes-vous sûr de vouloir annuler ce transfert ? Les articles seront retournés à la boutique d'origine."
                        : "Êtes-vous sûr de vouloir annuler cet approvisionnement ? Les articles seront retirés du stock."}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowCancelModal(false)}>Non</Button>
                    <Button variant="danger" onClick={confirmCancel}>Oui, annuler</Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default StockMovementsView;