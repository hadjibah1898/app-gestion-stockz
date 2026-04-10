/**
 * @file AdminHistoryTab.js
 * @description Ce composant est un composant de présentation (.
 * Il est responsable de l'affichage de l'historique complet des ventes pour un utilisateur "Admin".
 * Il reçoit toutes les données et les fonctions de gestion (comme l'annulation, la génération de ticket) via ses props depuis le composant parent `VentesView`.
 * Il inclut également la pagination pour naviguer à travers l'historique.
 */
import React, { useState } from 'react';
import { Card, Table, Badge, Button, Pagination, OverlayTrigger, Tooltip, Form } from 'react-bootstrap';
import { generateSaleReceipt, generateMovementsSummary } from '../utils/pdfUtils';

const AdminHistoryTab = ({
    historique,
    totalPages,
    currentPage,
    setCurrentPage,
    isCancellationAllowed,
    handleImageClick,
    setSaleToCancel,
    setShowCancelModal,
    setError
}) => {

    const handleReprint = (vente) => {
        const pu = vente.prixTotal / vente.quantite;
        const subTotalBrut = (vente.article?.prixVente || pu) * vente.quantite;
        
        const ticketData = {
            shopName: vente.boutique?.nom,
            address: vente.boutique?.adresse,
            phone: vente.boutique?.telephone,
            transactionId: `VTE-${vente._id.toString().slice(-6).toUpperCase()}`,
            cashierName: vente.gerant?.nom,
            clientName: vente.client?.nom || 'Client de passage',
            date: vente.createdAt,
            items: [{
                article: vente.article,
                quantite: vente.quantite,
                prixUnitaire: pu,
                prixTotal: vente.prixTotal
            }],
            subTotal: subTotalBrut,
            itemLevelDiscount: subTotalBrut - vente.prixTotal,
            totalNet: vente.prixTotal,
            amountPaid: vente.prixTotal,
            change: 0
        };
        generateSaleReceipt(ticketData);
    };

    const [selectedIds, setSelectedIds] = useState([]);

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedIds(historique.map(v => v._id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectOne = (id) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(i => i !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const handlePrintSelected = () => {
        const selectedSales = historique.filter(v => selectedIds.includes(v._id));
        // On transforme les ventes en format "Mouvement" pour réutiliser l'utilitaire puissant
        const movementsFormat = selectedSales.map(v => ({
            ...v,
            type: 'Vente',
            articles: [{ 
                nomArticle: v.article?.nom, 
                quantite: v.quantite, 
                prixAchatUnitaire: v.article?.prixAchat 
            }],
            operateur: v.gerant
        }));
        generateMovementsSummary(movementsFormat);
    };

    return (
        <Card className="border-0 shadow-sm rounded-4">
            <Card.Header className="bg-white py-3 d-flex justify-content-between align-items-center">
                <h5 className="mb-0 fw-bold">Historique des Mouvements (Ventes)</h5>
                {selectedIds.length > 0 && (
                    <Button variant="primary" size="sm" className="rounded-pill px-4 shadow-sm" onClick={handlePrintSelected}>
                        <iconify-icon icon="solar:printer-bold" className="me-2 align-middle"></iconify-icon>
                        Imprimer la sélection ({selectedIds.length})
                    </Button>
                )}
            </Card.Header>
            <Card.Body className="p-0">
                <Table hover responsive className="align-middle mb-0">
                    <thead className="bg-light">
                        <tr>
                            <th className="ps-4 border-0" style={{ width: '40px' }}>
                                <Form.Check 
                                    type="checkbox" 
                                    onChange={handleSelectAll} 
                                    checked={historique.length > 0 && selectedIds.length === historique.length}
                                />
                            </th>
                            <th className="py-3 border-0 text-secondary small text-uppercase">Date</th>
                            <th className="py-3 border-0 text-secondary small text-uppercase">Article</th>
                            <th className="py-3 border-0 text-secondary small text-uppercase text-center">Qté</th>
                            <th className="py-3 border-0 text-secondary small text-uppercase text-end">Total</th>
                            <th className="py-3 border-0 text-secondary small text-uppercase">Vendeur</th>
                            <th className="py-3 border-0 text-secondary small text-uppercase">Client</th>
                            <th className="py-3 border-0 text-secondary small text-uppercase text-end">Dette accordée</th>
                            <th className="pe-4 py-3 border-0 text-secondary small text-uppercase text-end">Statut / Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {historique.map(vente => (
                            <tr key={vente._id} className={
                                vente.statut === 'refusee' || vente.isCancelled ? "bg-light text-muted" :
                                vente.statut === 'en_attente_remise' ? "bg-warning-subtle" :
                                ""
                            }>
                                <td className="ps-4">
                                    <Form.Check 
                                        type="checkbox" 
                                        checked={selectedIds.includes(vente._id)} 
                                        onChange={() => handleSelectOne(vente._id)} 
                                    />
                                </td>
                                <td>
                                    <div className="fw-bold">{new Date(vente.createdAt).toLocaleDateString()}</div>
                                    <div className="small text-muted">{new Date(vente.createdAt).toLocaleTimeString()}</div>
                                </td>
                                <td>
                                    <div className="d-flex align-items-center">
                                        {vente.article?.image ? (
                                            <img src={vente.article?.image} alt="" className="rounded shadow-sm me-3" style={{ width: '40px', height: '40px', objectFit: 'cover', cursor: 'pointer', filter: vente.isCancelled ? 'grayscale(100%)' : 'none' }} onClick={() => handleImageClick(vente.article?.image)} />
                                        ) : (
                                            <div className="bg-light rounded d-flex align-items-center justify-content-center me-3" style={{ width: '40px', height: '40px' }}><iconify-icon icon="solar:box-bold" className="text-muted"></iconify-icon></div>
                                        )}
                                        <div>
                                            <div className={vente.isCancelled ? "text-decoration-line-through" : "fw-bold"}>{vente.article?.nom || 'Article supprimé'}</div>
                                            {vente.remiseAppliquee > 0 && !vente.isCancelled && (
                                                <Badge bg="warning" text="dark" pill>
                                                    Remise {vente.remiseAppliquee.toLocaleString()} {vente.remiseType === 'pourcentage' ? '%' : 'GNF'}
                                                </Badge>
                                            )}
                                            {vente.article?.code && <div className="small text-muted">{vente.article?.code}</div>}
                                        </div>
                                    </div>
                                </td>
                                <td className="text-center"><Badge bg="light" text="dark" className="border">{vente.quantite}</Badge></td>
                                <td className="text-end fw-bold text-primary">
                                    {vente.isCancelled ? <span className="text-decoration-line-through text-muted">{vente.prixTotal.toLocaleString()} GNF</span> : `${vente.prixTotal.toLocaleString()} GNF`}
                                </td>
                                <td>{vente.gerant?.nom || 'Inconnu'}</td>
                                <td>{vente.client?.nom || 'Passage'}</td>
                                <td className="text-end fw-bold text-warning">
                                    {/* Affiche la dette si la vente est à crédit, sinon 0 GNF */}
                                    {(vente.type === 'credit' || vente.isCredit || vente.montantCredit > 0) ? ((vente.montantCredit || vente.prixTotal || 0).toLocaleString() + ' GNF') : '0 GNF'}
                                </td>
                                <td className="pe-4 text-end">
                                    {(() => {
                                        if (vente.statut === 'refusee') {
                                            return (
                                                <Badge bg="danger-subtle" text="danger" className="px-3 py-2 rounded-pill">
                                                    <iconify-icon icon="solar:close-circle-bold" className="me-1 align-middle"></iconify-icon>
                                                    REMISE REFUSÉE
                                                </Badge>
                                            );
                                        }
                                        if (vente.isCancelled) {
                                            return (
                                                <Badge bg="danger-subtle" text="danger" className="px-3 py-2 rounded-pill">
                                                    <iconify-icon icon="solar:close-circle-bold" className="me-1 align-middle"></iconify-icon>
                                                    VENTE ANNULÉE
                                                </Badge>
                                            );
                                        }
                                        if (vente.statut === 'en_attente_remise') {
                                            return (
                                                <Badge bg="warning-subtle" text="warning" className="px-3 py-2 rounded-pill">
                                                    <iconify-icon icon="solar:clock-circle-bold" className="me-1 align-middle"></iconify-icon>
                                                    EN ATTENTE
                                                </Badge>
                                            );
                                        }
                                        return (
                                            <div className="d-flex gap-2 justify-content-end">
                                                <OverlayTrigger overlay={<Tooltip>Réimprimer le ticket</Tooltip>}>
                                                    <Button variant="outline-secondary" size="sm" className="rounded-pill px-3" onClick={() => handleReprint(vente)}>
                                                        <iconify-icon icon="solar:printer-bold" className="align-middle"></iconify-icon>
                                                    </Button>
                                                </OverlayTrigger>
                                                <Button
                                                    variant="outline-danger"
                                                    size="sm"
                                                    className="rounded-pill px-3"
                                                    onClick={() => { setSaleToCancel(vente); setShowCancelModal(true); }}
                                                    disabled={!isCancellationAllowed(vente)}
                                                    title={!isCancellationAllowed(vente) ? "Délai d'annulation dépassé (24h)" : "Annuler cette vente"}
                                                >
                                                    <iconify-icon icon="solar:trash-bin-trash-bold" className="me-1 align-middle"></iconify-icon>
                                                    Annuler
                                                </Button>
                                            </div>
                                        );
                                    })()}
                                </td>
                            </tr>
                        ))}
                        {historique.length === 0 && <tr><td colSpan="9" className="text-center py-5 text-muted"><iconify-icon icon="solar:bill-list-linear" style={{ fontSize: '48px' }} className="mb-2 opacity-50"></iconify-icon><p className="mb-0">Aucune transaction trouvée</p></td></tr>}
                    </tbody>
                </Table>
            </Card.Body>
            {totalPages > 1 && (
                <Card.Footer className="d-flex justify-content-center border-0 pt-0">
                    <Pagination>
                        <Pagination.Prev onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1} />
                        {[...Array(totalPages)].map((_, idx) => (
                            <Pagination.Item key={idx + 1} active={idx + 1 === currentPage} onClick={() => setCurrentPage(idx + 1)}>
                                {idx + 1}
                            </Pagination.Item>
                        ))}
                        <Pagination.Next onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} />
                    </Pagination>
                </Card.Footer>
            )}
        </Card>
    );
};

export default AdminHistoryTab;