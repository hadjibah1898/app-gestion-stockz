/**
 * @file AdminHistoryTab.js
 * @description Ce composant est un composant de présentation (.
 * Il est responsable de l'affichage de l'historique complet des ventes pour un utilisateur "Admin".
 * Il reçoit toutes les données et les fonctions de gestion (comme l'annulation, la génération de ticket) via ses props depuis le composant parent `VentesView`.
 * Il inclut également la pagination pour naviguer à travers l'historique.
 */
import React, { useState } from 'react';
import { Card, Table, Badge, Button, Pagination, OverlayTrigger, Tooltip, Form } from 'react-bootstrap';
import { generateReceiptPDF, generateMovementsSummary } from '../utils/pdfUtils';

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

    const handleReprint = (group) => {
        const subTotal = group.items.reduce((acc, item) => acc + ((item.article?.prixVente || (item.prixTotal / item.quantite)) * item.quantite), 0);
        
        const ticketData = {
            shopName: group.boutique?.nom || "Boutique",
            address: group.boutique?.adresse || "",
            phone: group.boutique?.telephone || "",
            transactionId: `GRP-${group.orderGroupId.toString().slice(-6).toUpperCase()}`,
            cashierName: group.gerant?.nom || "Admin",
            clientName: group.client?.nom || 'Client de passage',
            date: group.createdAt,
            items: group.items.map(item => ({
                article: item.article,
                quantite: item.quantite,
                prixUnitaire: item.prixTotal / item.quantite,
                prixTotal: item.prixTotal
            })),
            subTotal: subTotal,
            itemLevelDiscount: subTotal - group.totalGroupPrice,
            totalNet: group.totalGroupPrice,
            amountPaid: group.totalGroupPrice,
            change: 0 // Assurez-vous que le change est calculé correctement si nécessaire
        };
        generateReceiptPDF(ticketData);
    };

    const [selectedIds, setSelectedIds] = useState([]);

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedIds(historique.map(g => g.orderGroupId));
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
        const selectedGroups = historique.filter(g => selectedIds.includes(g.orderGroupId));
        // On transforme les ventes en format "Mouvement" pour réutiliser l'utilitaire puissant
        const movementsFormat = [];
        selectedGroups.forEach(group => {
            group.items.forEach(item => {
                movementsFormat.push({
                    ...item,
                    type: 'Vente',
                    articles: [{ 
                        nomArticle: item.article?.nom, 
                        quantite: item.quantite, 
                        prixAchatUnitaire: item.article?.prixAchat 
                    }],
                    operateur: item.gerant
                });
            });
        });
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
                                    checked={historique && historique.length > 0 && selectedIds.length === historique.length}
                                />
                            </th>
                            <th className="py-3 border-0 text-secondary small text-uppercase">Date</th>
                            <th className="py-3 border-0 text-secondary small text-uppercase">Articles</th>
                            <th className="py-3 border-0 text-secondary small text-uppercase text-center">Boutique</th>
                            <th className="py-3 border-0 text-secondary small text-uppercase text-end">Total</th>
                            <th className="py-3 border-0 text-secondary small text-uppercase text-center">Table</th>
                            <th className="py-3 border-0 text-secondary small text-uppercase">Mode / Réf</th>
                            <th className="py-3 border-0 text-secondary small text-uppercase">Vendeur</th>
                            <th className="py-3 border-0 text-secondary small text-uppercase">Client</th>
                            <th className="pe-4 py-3 border-0 text-secondary small text-uppercase text-end">Statut / Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {historique && historique.map(group => (
                            <tr key={group.orderGroupId} className={
                                group.isCancelled ? "bg-light text-muted" :
                                group.statut === 'commande' ? "bg-warning-subtle" :
                                ""
                            }>
                                <td className="ps-4">
                                    <Form.Check 
                                        type="checkbox" 
                                        checked={selectedIds.includes(group.orderGroupId)} 
                                        onChange={() => handleSelectOne(group.orderGroupId)} 
                                    />
                                </td>
                                <td>
                                    <div className="fw-bold">{group.createdAt ? new Date(group.createdAt).toLocaleDateString() : 'N/A'}</div>
                                    <div className="small text-muted">{group.createdAt ? new Date(group.createdAt).toLocaleTimeString() : ''}</div>
                                </td>
                                <td>
                                    <ul className="list-unstyled mb-0 small">
                                        {group.items?.map(item => (
                                            <li key={item._id} className={item.isCancelled ? "text-decoration-line-through" : ""}>
                                                {item.article?.nom || 'Article supprimé'} <Badge bg="light" text="dark">x{item.quantite}</Badge>
                                                {(item.remiseAppliquee || 0) > 0 && (
                                                    <Badge bg="warning" text="dark" pill className="ms-1">
                                                        -{(item.remiseAppliquee || 0).toLocaleString()}{item.remiseType === 'pourcentage' ? '%' : 'GNF'}
                                                    </Badge>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </td>
                                <td className="text-center">
                                    <Badge bg="info" pill>{group.boutique?.nom || 'N/A'}</Badge>
                                </td>
                                <td className="text-end fw-bold text-primary">
                                    {group.isCancelled ? <span className="text-decoration-line-through text-muted">{(group.totalGroupPrice || 0).toLocaleString()} GNF</span> : `${(group.totalGroupPrice || 0).toLocaleString()} GNF`}
                                </td>
                                <td className="text-center">
                                    {group.numeroTable ? (<Badge bg="dark" className="px-2 py-1">{group.numeroTable}</Badge>) : '-'}
                                </td>
                                <td>
                                    <div className="d-flex flex-column align-items-start">
                                        {group.items[0]?.modePaiement === 'Orange Money' ? <Badge style={{backgroundColor: '#FF6600'}} className="border-0 fw-normal">OM</Badge> :
                                         group.items[0]?.modePaiement === 'MobiCash' ? <Badge style={{backgroundColor: '#FFCC00', color: '#000'}} className="border-0 fw-normal">Mobi</Badge> :
                                         group.items[0]?.modePaiement === 'PayCard' ? <Badge bg="info" className="border-0 fw-normal">Card</Badge> :
                                         group.items[0]?.modePaiement === 'Virement' ? <Badge bg="secondary" className="border-0 fw-normal">Bank</Badge> :
                                         group.items[0]?.modePaiement === 'Dette' ? <Badge bg="warning-subtle" text="warning-emphasis" className="border-0 fw-normal">Dette</Badge> :
                                         <Badge bg="success-subtle" text="success" className="border-0 fw-normal">Cash</Badge>}
                                        {group.items[0]?.transactionRef && <small className="text-muted x-small mt-1 font-monospace" style={{fontSize: '0.65rem'}}>{group.items[0].transactionRef}</small>}
                                    </div>
                                </td>
                                <td>{group.gerant?.nom || 'Inconnu'}</td>
                                <td>{group.client?.nom || 'Passage'}</td>
                                <td className="pe-4 text-end">
                                    {(() => {
                                        if (group.statut === 'refusee') {
                                            return (
                                                <Badge bg="danger-subtle" text="danger" className="px-3 py-2 rounded-pill">
                                                    <iconify-icon icon="solar:close-circle-bold" className="me-1 align-middle"></iconify-icon>
                                                    REMISE REFUSÉE
                                                </Badge>
                                            );
                                        }
                                        if (group.isCancelled) {
                                            return (
                                                <Badge bg="danger-subtle" text="danger" className="px-3 py-2 rounded-pill">
                                                    <iconify-icon icon="solar:close-circle-bold" className="me-1 align-middle"></iconify-icon>
                                                    VENTE ANNULÉE
                                                </Badge>
                                            );
                                        }
                                        if (group.statut === 'en_attente_remise') {
                                            return (
                                                <Badge bg="warning-subtle" text="warning" className="px-3 py-2 rounded-pill">
                                                    <iconify-icon icon="solar:clock-circle-bold" className="me-1 align-middle"></iconify-icon>
                                                    EN ATTENTE
                                                </Badge>
                                            );
                                        }
                                        if (group.statut === 'commande') {
                                            return <Badge bg="warning" text="dark" className="px-3 py-2 rounded-pill">EN ATTENTE</Badge>;
                                        }
                                        return (
                                            <div className="d-flex gap-2 justify-content-end">
                                                <OverlayTrigger overlay={<Tooltip>Réimprimer le ticket</Tooltip>}>
                                                    <Button variant="outline-secondary" size="sm" className="rounded-pill px-3" onClick={() => handleReprint(group)}>
                                                        <iconify-icon icon="solar:printer-bold" className="align-middle"></iconify-icon>
                                                    </Button>
                                                </OverlayTrigger>
                                                {group.items.map(item => (
                                                    !item.isCancelled && isCancellationAllowed(item) && (
                                                        <Button
                                                            key={item._id}
                                                            variant="outline-danger"
                                                            size="sm"
                                                            className="rounded-pill px-3"
                                                            onClick={() => { setSaleToCancel(item); setShowCancelModal(true); }}
                                                            disabled={!isCancellationAllowed(item)}
                                                            title={!isCancellationAllowed(item) ? "Délai d'annulation dépassé (24h)" : "Annuler cet article"}
                                                        >
                                                            <iconify-icon icon="solar:trash-bin-trash-bold" className="me-1 align-middle"></iconify-icon>
                                                            Annuler
                                                        </Button>
                                                    )
                                                ))}
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
                    <Pagination className="mb-0">
                        <Pagination.First onClick={() => setCurrentPage(1)} disabled={currentPage === 1} />
                        <Pagination.Prev onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1} />
                        
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                            .filter(page => 
                                page === 1 || 
                                page === totalPages || 
                                (page >= currentPage - 1 && page <= currentPage + 1)
                            )
                            .map((page, index, array) => (
                                <React.Fragment key={page}>
                                    {index > 0 && array[index - 1] !== page - 1 && <Pagination.Ellipsis disabled />}
                                    <Pagination.Item 
                                        active={page === currentPage} 
                                        onClick={() => setCurrentPage(page)}
                                    >
                                        {page}
                                    </Pagination.Item>
                                </React.Fragment>
                            ))
                        }

                        <Pagination.Next onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} />
                        <Pagination.Last onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} />
                    </Pagination>
                </Card.Footer>
            )}
        </Card>
    );
};

export default AdminHistoryTab;