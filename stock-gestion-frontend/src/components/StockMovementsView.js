// src/components/StockMovementsView.js
// Composant d'affichage des mouvements de stock
// Permet de visualiser les entrées et sorties de stock
// Affiche les informations sur les articles, les quantités et les dates
// Contient les fonctionnalités de recherche et de filtres

import React, { useState, useEffect, useCallback } from 'react';
import { Card, Spinner, Alert, Form, Row, Col, Badge, Button, Modal, Pagination, OverlayTrigger, Tooltip, Table } from 'react-bootstrap';
import { mouvementAPI, boutiqueAPI, fournisseurAPI } from '../services/api';
import XLSX from 'xlsx-js-style';
import { generateMovementsSummary } from '../utils/pdfUtils';

const StockMovementsView = () => {
    const [mouvements, setMouvements] = useState([]);
    const [boutiques, setBoutiques] = useState([]);
    const [fournisseurs, setFournisseurs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filters, setFilters] = useState({ type: '', boutique: '', fournisseur: '', startDate: '', endDate: '' });
    const [successMessage, setSuccessMessage] = useState('');
    
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const itemsPerPage = 15; // Aligné sur la limite par défaut du backend
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [movementToCancel, setMovementToCancel] = useState(null);
    const [selectedIds, setSelectedIds] = useState([]);

    const fetchMouvements = useCallback(async () => {
        try {
            setLoading(true);
            const params = {
                ...filters,
                page: currentPage,
                limit: itemsPerPage
            };
            const [mouvementsRes, boutiquesRes, fournisseursRes] = await Promise.all([
                mouvementAPI.getAll(params),
                boutiqueAPI.getAll(),
                fournisseurAPI.getAll()
            ]);

            // Utilisation des métadonnées du backend
            if (mouvementsRes.data && mouvementsRes.data.data) {
                setMouvements(mouvementsRes.data.data);
                setTotalPages(mouvementsRes.data.totalPages || 1);
            } else {
                // Fallback si l'API renvoie encore un tableau simple (compatibilité)
                setMouvements(mouvementsRes.data || []);
                setTotalPages(1);
            }

            setBoutiques(boutiquesRes.data);
            setFournisseurs(fournisseursRes.data.data || fournisseursRes.data || []);
        } catch (err) {
            setError(err.response?.data?.message || "Erreur lors du chargement des mouvements.");
        } finally {
            setLoading(false);
        }
    }, [filters, currentPage]);

    useEffect(() => {
        fetchMouvements();
    }, [fetchMouvements]);

    // Réinitialiser la sélection lors du changement de page ou de filtre
    useEffect(() => {
        setSelectedIds([]);
    }, [currentPage, filters]);


    const handleFilterChange = (e) => {
        setFilters({ ...filters, [e.target.name]: e.target.value });
        setCurrentPage(1); // Revenir à la première page lors d'un filtrage
    };

    const handleSelectAll = (checked) => {
        if (checked) {
            setSelectedIds(mouvements.map(m => m._id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectOne = (id) => {
        setSelectedIds(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handlePrintSelected = () => {
        const selectedMouvements = mouvements.filter(m => selectedIds.includes(m._id));
        generateMovementsSummary(selectedMouvements);
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

    const handleExportPDF = async () => {
        try {
            setLoading(true);
            // Récupérer TOUS les mouvements correspondant aux filtres (limit: 0)
            const res = await mouvementAPI.getAll({ ...filters, limit: 0 });
            const allData = res.data.data || res.data || [];
            generateMovementsSummary(allData);
        } catch (err) {
            setError("Erreur lors de la préparation du PDF.");
        } finally {
            setLoading(false);
        }
    };

    const handleExportExcel = async () => {
        setLoading(true);
        const res = await mouvementAPI.getAll({ ...filters, limit: 0 });
        const allData = res.data.data || res.data || [];
        
        const dataToExport = allData.map(mvt => ({
            'Date': new Date(mvt.createdAt).toLocaleString('fr-FR'),
            'Type': mvt.type,
            'Origine': mvt.fournisseur?.nom || mvt.boutiqueSource?.nom || 'N/A',
            'Destination': mvt.boutiqueDestination?.nom || (mvt.type === 'Vente' ? 'Client' : 'N/A'),
            'Articles': mvt.articles.map(a => `${a.nomArticle} (${a.quantite})`).join(', '),
            'Opérateur': mvt.operateur?.nom || 'Système',
            'Transporteur': mvt.nomTransporteur || '-',
            'Détails': mvt.details || '-',
            'Statut': mvt.isCancelled ? 'Annulé' : 'Validé'
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Mouvements_Stock");
        XLSX.writeFile(workbook, `export_mouvements_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const getTypeBadge = (type) => {
        switch (type) {
            case 'Approvisionnement': return 'success';
            case 'Transfert': return 'primary';
            case 'Vente': return 'warning';
            case 'Annulation Vente': return 'danger';
            case 'Modification Prix': return 'info';
            default: return 'secondary';
        }
    };

    const columns = [
        {
            key: 'select',
            label: (
                <Form.Check 
                    type="checkbox" 
                    onChange={(e) => handleSelectAll(e.target.checked)} 
                    checked={mouvements.length > 0 && selectedIds.length === mouvements.length}
                />
            ),
            render: (_, item) => (
                <Form.Check 
                    type="checkbox" 
                    checked={selectedIds.includes(item._id)} 
                    onChange={() => handleSelectOne(item._id)} 
                />
            )
        },
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
                    {articles.map((art, idx) => {
                        // Pour les modifications de prix, la quantité n'est pas pertinente.
                        const showQuantity = art.quantite > 0;
                        return <li key={idx}>{art.nomArticle} {showQuantity && <Badge pill bg="light" text="dark" className="ms-1">x{art.quantite}</Badge>}</li>
                    })}
                </ul>
            )
        },
        {
            key: 'operateur',
            label: 'Opérateur',
            render: (op) => op?.nom || 'Système'
        },
        {
            key: 'nomTransporteur',
            label: 'Transporteur',
            render: (val) => val || '-'
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
                // Si l'opération est déjà annulée (marquée par le backend), on affiche un badge
                if (item.isCancelled) {
                    return (
                        <Badge bg="secondary" className="d-flex align-items-center gap-1 px-2 py-1" style={{width: 'fit-content'}}>
                            <iconify-icon icon="solar:close-circle-bold" style={{ fontSize: '16px' }}></iconify-icon>
                            Opération Annulée
                        </Badge>
                    );
                }
                // Seuls les transferts et approvisionnements non annulés peuvent être annulés depuis cette vue
                if (item.type === 'Transfert' || item.type === 'Approvisionnement') {
                    return (
                        <OverlayTrigger overlay={<Tooltip>Annuler cette opération et restaurer le stock.</Tooltip>}>
                            <Button variant="link" className="text-danger p-0" onClick={() => handleCancelClick(item)}>
                                <iconify-icon icon="solar:undo-left-round-bold-duotone" style={{ fontSize: '22px' }}></iconify-icon>
                            </Button>
                        </OverlayTrigger>
                    );
                }
                return null; // Pas d'action pour les ventes valides ou autres types
            }
        }
    ];

    if (loading) return <Spinner animation="border" />;

    return (
        <div className="p-4">
            <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-2">
                <h3 className="fw-bold mb-0">Mouvements de Stock</h3> 
                <div className="d-flex gap-2">
                    {selectedIds.length > 0 && (
                        <Button variant="primary" onClick={handlePrintSelected} className="rounded-pill px-4 shadow-sm">
                            <iconify-icon icon="solar:printer-bold" className="me-2 align-middle"></iconify-icon>
                            Imprimer la sélection ({selectedIds.length})
                        </Button>
                    )}
                    <Button variant="outline-success" onClick={handleExportExcel} className="rounded-pill px-4 shadow-sm">
                        <iconify-icon icon="solar:file-spreadsheet-bold" className="me-2 align-middle"></iconify-icon>
                        Exporter Excel
                    </Button>
                    <Button variant="outline-secondary" onClick={handleExportPDF} className="rounded-pill px-4 shadow-sm">
                        <iconify-icon icon="solar:printer-bold" className="me-2 align-middle"></iconify-icon>
                        Exporter PDF
                    </Button>
                </div>
            </div>
            {error && <Alert variant="danger">{error}</Alert>}
            {successMessage && <Alert variant="success">{successMessage}</Alert>}

            <Card className="border-0 shadow-sm rounded-4 mb-4">
                <Card.Body>
                    <Row className="g-3">
                        <Col md={2}>
                            <Form.Label>Type de mouvement</Form.Label>
                            <Form.Select name="type" value={filters.type} onChange={handleFilterChange}>
                                <option value="">Tous les types</option>
                                <option value="Approvisionnement">Approvisionnement</option>
                                <option value="Transfert">Transfert</option>
                                <option value="Vente">Vente</option>
                                <option value="Annulation Vente">Annulation Vente</option>
                                <option value="Modification Prix">Modification Prix</option>
                            </Form.Select>
                        </Col>
                        <Col md={3}>
                            <Form.Label>Boutique</Form.Label>
                            <Form.Select name="boutique" value={filters.boutique} onChange={handleFilterChange}>
                                <option value="">Toutes les boutiques</option>
                                {boutiques.map(b => (
                                    <option key={b._id} value={b._id}>{b.nom}</option>
                                ))}
                            </Form.Select>
                        </Col>
                        <Col md={3}>
                            <Form.Label>Fournisseur</Form.Label>
                            <Form.Select name="fournisseur" value={filters.fournisseur} onChange={handleFilterChange}>
                                <option value="">Tous les fournisseurs</option>
                                {fournisseurs.map(f => (
                                    <option key={f._id} value={f._id}>{f.nom}</option>
                                ))}
                            </Form.Select>
                        </Col>
                        <Col md={2}>
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
                    <Table hover responsive className="align-middle mb-0">
                        <thead className="bg-light">
                            <tr>
                                {columns.map(col => (
                                    <th key={col.key} className="border-0 small text-uppercase text-secondary">
                                        {col.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {mouvements.length > 0 ? (
                                mouvements.map((item, index) => {
                                    const isCancelled = item.isCancelled;
                                    return (
                                        <tr key={item._id || index} className={isCancelled ? 'bg-light text-muted' : ''}>
                                            {columns.map(col => (
                                                <td key={col.key} className="border-0">
                                                    {col.render ? col.render(item[col.key], item) : item[col.key]}
                                                </td>
                                            ))}
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr><td colSpan={columns.length} className="text-center py-5 text-muted">
                                    <iconify-icon icon="solar:bill-list-linear" style={{fontSize: '48px'}} className="mb-2 opacity-50"></iconify-icon>
                                    <p className="mb-0">Aucun mouvement de stock trouvé.</p>
                                </td></tr>
                            )}
                        </tbody>
                    </Table>
                    {totalPages > 1 && (
                        <div className="d-flex justify-content-center p-3 border-top">
                            <Pagination className="mb-0">
                                <Pagination.First onClick={() => setCurrentPage(1)} disabled={currentPage === 1} />
                                <Pagination.Prev onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} />
                                
                                {(() => {
                                    const pages = [];
                                    for (let i = 1; i <= totalPages; i++) {
                                        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
                                            pages.push(i);
                                        }
                                    }
                                    return pages.map((p, idx) => (
                                        <React.Fragment key={p}>
                                            {idx > 0 && pages[idx - 1] !== p - 1 && <Pagination.Ellipsis disabled />}
                                            <Pagination.Item 
                                                active={p === currentPage} 
                                                onClick={() => setCurrentPage(p)}
                                            >
                                                {p}
                                            </Pagination.Item>
                                        </React.Fragment>
                                    ));
                                })()}

                                <Pagination.Next onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} />
                                <Pagination.Last onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} />
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