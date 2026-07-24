/**
 * @file AdjustmentsTab.js
 * @description Composant React.
 */

import React, { useState } from 'react';
import { Button, Card, Badge, OverlayTrigger, Tooltip, Form, Modal } from 'react-bootstrap';
import TableComponent from './common/Table';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logo from '../assets/logo.png';

const AdjustmentsTab = ({
    userRole, handleOpenAdjustmentModal, adjustments, adjLoading, handleImageClick, handleOpenValModal, boutiques
}) => {
    const [search, setSearch] = useState('');
    const [reasonFilter, setReasonFilter] = useState('all');
    const [shopFilter, setShopFilter] = useState('all');
    const [showJustificationModal, setShowJustificationModal] = useState(false);
    const [selectedJustification, setSelectedJustification] = useState('');
    const [showAdminCommentModal, setShowAdminCommentModal] = useState(false);
    const [selectedAdminComment, setSelectedAdminComment] = useState('');

    const handleExportPDF = () => {
        const doc = new jsPDF();

        // En-tête
        try { doc.addImage(logo, 'PNG', 14, 8, 40, 15); } catch (e) { }

        doc.setFontSize(18);
        doc.setTextColor(41, 128, 185);
        doc.text("Journal des Écarts d'Inventaire", 60, 16);

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Généré le : ${new Date().toLocaleString('fr-FR')}`, 60, 22);

        const tableColumn = ["Date", "Article", "Boutique", "Gérant", "Motif", "Justification", "Qté", "Statut"];
        const tableRows = filteredAdjustments.map(adj => [
            new Date(adj.createdAt).toLocaleDateString(),
            adj.article?.nom || 'N/A',
            adj.boutique?.nom || 'N/A',
            adj.gerant?.nom || 'N/A',
            adj.raison,
            adj.justification || '-',
            `-${adj.quantite}`,
            adj.statut
        ]);

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 35,
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185], halign: 'center' },
            columnStyles: { 6: { halign: 'center' }, 7: { halign: 'center' } }
        });

        doc.save(`journal_ecarts_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    const filteredAdjustments = adjustments.filter(adj => {
        const matchesSearch = adj.article?.nom?.toLowerCase().includes(search.toLowerCase()) ||
            adj.raison?.toLowerCase().includes(search.toLowerCase()) ||
            adj.gerant?.nom?.toLowerCase().includes(search.toLowerCase()) ||
            adj.justification?.toLowerCase().includes(search.toLowerCase());
        const matchesReason = reasonFilter === 'all' || adj.raison === reasonFilter;
        const matchesShop = shopFilter === 'all' || (adj.boutique?._id || adj.boutique) === shopFilter;
        return matchesSearch && matchesReason && matchesShop;
    });

    return (
        <div className="animate__animated animate__fadeIn">
            <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center mb-4 gap-3">
                <h5 className="fw-bold mb-0">Journal des Écarts d'Inventaire</h5>
                <div className="d-flex flex-wrap gap-2 w-100 justify-content-lg-end align-items-center">
                    {userRole === 'Admin' && (
                        <Form.Select
                            size="sm"
                            className="rounded-pill px-3 shadow-sm flex-grow-1 flex-md-grow-0"
                            value={shopFilter}
                            onChange={(e) => setShopFilter(e.target.value)}
                            style={{ minWidth: '150px', maxWidth: '180px' }}
                        >
                            <option value="all">Toutes les boutiques</option>
                            {Array.isArray(boutiques) && boutiques.map(b => <option key={b._id} value={b._id}>{b.nom}</option>)}
                        </Form.Select>
                    )}
                    <Form.Select
                        size="sm"
                        className="rounded-pill px-3 shadow-sm flex-grow-1 flex-md-grow-0"
                        value={reasonFilter}
                        onChange={(e) => setReasonFilter(e.target.value)}
                        style={{ minWidth: '150px', maxWidth: '180px' }}
                    >
                        <option value="all">Tous les motifs</option>
                        <option value="Casse">Casse</option>
                        <option value="Vol">Vol</option>
                        <option value="Perte">Perte</option>
                        <option value="Péremption">Péremption</option>
                        <option value="Erreur Inventaire">Erreur Inventaire</option>
                    </Form.Select>
                    <Button variant="outline-danger" size="sm" className="rounded-pill px-3 shadow-sm flex-grow-1 flex-md-grow-0" onClick={handleExportPDF} disabled={filteredAdjustments.length === 0}>
                        <iconify-icon icon="solar:file-pdf-bold" className="me-2 align-middle"></iconify-icon>
                        PDF
                    </Button>
                    <Form.Control
                        placeholder="🔍 Rechercher..."
                        size="sm"
                        className="rounded-pill px-3 shadow-sm flex-grow-1 flex-md-grow-0"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ minWidth: '200px', maxWidth: '250px' }}
                    />
                    {userRole === 'Gérant' && (
                        <Button
                            variant="danger"
                            size="sm"
                            onClick={handleOpenAdjustmentModal}
                            className="rounded-pill shadow-sm px-4 fw-bold d-flex justify-content-center align-items-center flex-grow-1 flex-lg-grow-0 mt-2 mt-lg-0"
                            style={{ background: 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)', border: 'none' }}
                        >
                            <iconify-icon icon="solar:danger-triangle-bold-duotone" className="me-2 fs-5"></iconify-icon>
                            Déclarer une Perte / Casse
                        </Button>
                    )}
                </div>
            </div>

            <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
                <div className="table-responsive">
                    <TableComponent
                        columns={[
                            { key: 'createdAt', label: 'Date', render: d => <span className="text-muted small">{new Date(d).toLocaleDateString('fr-FR')}</span> },
                            { key: 'article', label: 'Article', render: a => <span className="fw-bold text-dark">{a?.nom}</span> },
                            { key: 'boutique', label: 'Point de Vente', render: b => <Badge bg="light" text="dark" className="border">{b?.nom || 'N/A'}</Badge> },
                            { key: 'raison', label: 'Motif', render: r => <Badge bg="dark">{r}</Badge> },
                            {
                                key: 'justification', label: 'Note', render: j => j ? (
                                    <span
                                        className="text-primary small cursor-pointer d-flex align-items-center gap-1 hover-underline"
                                        onClick={() => { setSelectedJustification(j); setShowJustificationModal(true); }}
                                    >
                                        <iconify-icon icon="solar:chat-square-dots-bold-duotone" style={{ fontSize: '18px' }}></iconify-icon>
                                        Voir
                                    </span>
                                ) : '-'
                            },
                            { key: 'quantite', label: 'Qté', render: q => <span className="text-danger fw-bold">-{q}</span> },
                            { key: 'imageJustificatif', label: 'Preuve', render: img => img ? <img src={img} onClick={() => handleImageClick(img)} className="rounded-3 shadow-sm cursor-pointer border" style={{ width: '40px', height: '40px', objectFit: 'cover' }} alt="justificatif" /> : <iconify-icon icon="solar:camera-minimalistic-linear" className="text-muted opacity-25"></iconify-icon> },
                            {
                                key: 'statut', label: 'Statut', render: s => (
                                    <Badge bg={s === 'VALIDE' ? 'success-subtle' : s === 'REJETE' ? 'danger-subtle' : 'warning-subtle'} text={s === 'VALIDE' ? 'success' : s === 'REJETE' ? 'danger' : 'warning-emphasis'} className="px-3 py-2">{s}</Badge>
                                )
                            },
                            {
                                key: 'actions', label: 'Actions', render: (_, adj) => (
                                    userRole === 'Admin' && adj.statut === 'EN_ATTENTE' ? (
                                        <div className="d-flex gap-2">
                                            <Button variant="success" size="sm" className="rounded-pill shadow-sm" onClick={() => handleOpenValModal(adj, 'VALIDE')}>
                                                <iconify-icon icon="solar:check-circle-bold" className="me-1"></iconify-icon>Approuver
                                            </Button>
                                            <Button variant="danger" size="sm" className="rounded-pill" onClick={() => handleOpenValModal(adj, 'REJETE')}>
                                                Rejeter
                                            </Button>
                                        </div>
                                    ) : adj.commentaireAdmin ? (
                                        <OverlayTrigger overlay={<Tooltip>Voir le commentaire de l'admin</Tooltip>}>
                                            <span
                                                className="text-info small cursor-pointer d-flex align-items-center gap-1"
                                                onClick={() => { setSelectedAdminComment(adj.commentaireAdmin); setShowAdminCommentModal(true); }}
                                            >
                                                <iconify-icon icon="solar:chat-line-linear"></iconify-icon>
                                                Obs.
                                            </span>
                                        </OverlayTrigger>
                                    ) : '-'
                                )
                            }
                        ]}
                        data={filteredAdjustments}
                        loading={adjLoading}
                        emptyMessage="Aucune correction enregistrée."
                    />
                </div>
            </Card>

            {/* Modale pour afficher la justification complète du gérant */}
            <Modal show={showJustificationModal} onHide={() => setShowJustificationModal(false)} centered size="sm">
                <Modal.Header closeButton className="border-0 pb-0">
                    <Modal.Title className="fw-bold h6 text-primary text-uppercase">Justification du gérant</Modal.Title>
                </Modal.Header>
                <Modal.Body className="pt-2">
                    <div className="p-3 bg-light rounded-4 small text-dark border shadow-sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {selectedJustification}
                    </div>
                </Modal.Body>
                <Modal.Footer className="border-0 pt-0">
                    <Button variant="secondary" size="sm" className="rounded-pill px-4 shadow-sm fw-bold" onClick={() => setShowJustificationModal(false)}>
                        Fermer
                    </Button>
                </Modal.Footer>
            </Modal>

            {/* Modale pour afficher le commentaire complet de l'administrateur */}
            <Modal show={showAdminCommentModal} onHide={() => setShowAdminCommentModal(false)} centered size="sm">
                <Modal.Header closeButton className="border-0 pb-0">
                    <Modal.Title className="fw-bold h6 text-info text-uppercase">Commentaire de l'administrateur</Modal.Title>
                </Modal.Header>
                <Modal.Body className="pt-2">
                    <div className="p-3 bg-light rounded-4 small text-dark border shadow-sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {selectedAdminComment}
                    </div>
                </Modal.Body>
                <Modal.Footer className="border-0 pt-0">
                    <Button variant="secondary" size="sm" className="rounded-pill px-4 shadow-sm fw-bold" onClick={() => setShowAdminCommentModal(false)}>
                        Fermer
                    </Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default AdjustmentsTab;