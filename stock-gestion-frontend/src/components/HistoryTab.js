/**
 * @file HistoryTab.js
 * @description Ce composant est un composant de présentation.
 * Il est responsable de l'affichage de l'historique des ventes pour un utilisateur "Gérant".
 * Il reçoit toutes les données et les fonctions de gestion (comme l'annulation) via ses props depuis le composant parent `VentesView`.
 * Il inclut un interrupteur pour filtrer et n'afficher que les ventes annulées.
 */
import React, { useState } from 'react';
import { Card, Table, Badge, Button, Form, Pagination, Spinner, Row, Col, OverlayTrigger, Tooltip } from 'react-bootstrap';

const HistoryTab = ({
    historique,
    showCancelledOnly,
    setShowCancelledOnly,
    currentPage,
    totalPages,
    setCurrentPage,
    isCancellationAllowed,
    handleImageClick,
    setSaleToCancel,
    setShowCancelModal,
    handleFinalizeOrder,
    userRole,
    isUpdatingStatus,
    isPendingView
}) => {
    // État pour gérer l'affichage des détails (accordéon)
    const [expandedGroups, setExpandedGroups] = useState({});
    const [selectedItems, setSelectedItems] = useState({}); // { tableId: [itemId1, itemId2] }

    const toggleItemSelection = (tableId, itemId) => {
        setSelectedItems(prev => {
            const currentSelection = prev[tableId] || [];
            const newSelection = currentSelection.includes(itemId)
                ? currentSelection.filter(id => id !== itemId)
                : [...currentSelection, itemId];
            return { ...prev, [tableId]: newSelection };
        });
    };

    const toggleGroup = (groupId) => {
        setExpandedGroups(prev => ({
            ...prev,
            [groupId]: !prev[groupId]
        }));
    };

    // --- NOUVELLE VUE : GRILLE DE PRÉPARATION (Mode Panier) ---
    if (isPendingView) {
        return (
            <Row className="g-4">
                {historique && historique.map(group => (
                    <Col xl={4} lg={6} md={6} xs={12} key={group.orderGroupId}>
                        <Card className="border-0 shadow-sm rounded-4 h-100 overflow-hidden border-top border-4 border-warning animate__animated animate__fadeIn">
                             <Card.Header className="bg-white py-3 border-0">
                                 <div className="d-flex justify-content-between align-items-center">
                                     <Badge bg="primary" className="fs-5 px-3 py-2 rounded-pill shadow-sm">
                                         <iconify-icon icon="solar:chair-bold" className="me-2 align-middle"></iconify-icon>
                                         {group.numeroTable ? `TABLE ${group.numeroTable}` : 'À EMPORTER'}
                                     </Badge>
                                     <div className="text-end">
                                         <div className="small fw-bold">{new Date(group.createdAt).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}</div>
                                         <Badge bg="light" text="dark" className="border">Serveur: {group.gerant?.nom || 'N/A'}</Badge>
                                     </div>
                                 </div>
                             </Card.Header>
                             <Card.Body className="p-2 bg-light bg-opacity-50">
                                 <div className="pending-items-list" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                                     {group.items?.map(item => (
                                         <div key={item._id} className={`d-flex align-items-center p-2 mb-2 bg-white rounded-3 shadow-sm ${item.isCancelled ? 'opacity-50' : ''}`} style={{ transition: 'all 0.2s' }}>
                                             {!item.isCancelled && (
                                                 <Form.Check 
                                                     type="checkbox"
                                                     className="me-2 custom-cart-checkbox"
                                                     style={{ transform: 'scale(1.2)' }}
                                                     checked={selectedItems[group.orderGroupId]?.includes(item._id) || false}
                                                     onChange={() => toggleItemSelection(group.orderGroupId, item._id)}
                                                 />
                                             )}
                                             {item.article?.image ? (
                                                 <img src={item.article.image} alt="" className="rounded me-2" style={{ width: '50px', height: '50px', objectFit: 'cover' }} />
                                             ) : (
                                                 <div className="bg-secondary bg-opacity-10 rounded d-flex align-items-center justify-content-center me-2" style={{ width: '50px', height: '50px' }}><iconify-icon icon="solar:box-bold" className="text-muted"></iconify-icon></div>
                                             )}
                                             <div className="flex-grow-1" style={{ minWidth: 0 }}>
                                                 <div className={`fw-bold small ${item.isCancelled ? 'text-decoration-line-through' : ''}`}>{item.article?.nom || 'Article supprimé'}</div>
                                                 <div className="d-flex align-items-center mt-1">
                                                     <span className="badge bg-dark rounded-pill me-2">x{item.quantite}</span>
                                                     <span className="text-primary small fw-bold">{item.prixTotal.toLocaleString()} GNF</span>
                                                 </div>
                                             </div>
                                             {!item.isCancelled && isCancellationAllowed(item) && (
                                                 <OverlayTrigger overlay={<Tooltip>Annuler cet article</Tooltip>}>
                                                     <Button variant="link" className="text-danger p-1 ms-1" onClick={() => { setSaleToCancel(item); setShowCancelModal(true); }}>
                                                         <iconify-icon icon="solar:trash-bin-trash-bold" style={{ fontSize: '18px' }}></iconify-icon>
                                                     </Button>
                                                 </OverlayTrigger>
                                             )}
                                         </div>
                                     ))}
                                 </div>
                             </Card.Body>
                             <Card.Footer className="bg-white border-0 pt-0 pb-3 px-3">
                                 <div className="d-flex justify-content-between align-items-center mb-3 pt-3 border-top">
                                     <span className="text-muted small fw-bold">TOTAL COMMANDE</span>
                                     <span className="fw-bold fs-5 text-success">{group.totalGroupPrice.toLocaleString()} GNF</span>
                                 </div>
                                 <Button 
                                     variant={selectedItems[group.orderGroupId]?.length > 0 ? "primary" : "warning"}
                                     className="w-100 rounded-pill py-2 fw-bold shadow-sm d-flex align-items-center justify-content-center" 
                                     onClick={() => {
                                         handleFinalizeOrder(group.orderGroupId, 'en_preparation', true, group.items, selectedItems[group.orderGroupId]);
                                         // Vider la sélection pour cette table après l'action
                                         setSelectedItems(prev => ({ ...prev, [group.orderGroupId]: [] }));
                                     }}
                                     disabled={isUpdatingStatus || group.isCancelled}
                                 >
                                     {isUpdatingStatus ? <Spinner as="span" animation="border" size="sm" /> : <>
                                         <iconify-icon icon="solar:cup-hot-bold" className="me-2 fs-5"></iconify-icon>
                                         {selectedItems[group.orderGroupId]?.length > 0 
                                            ? `MARQUER LA SÉLECTION PRÊTE (${selectedItems[group.orderGroupId].length})` 
                                            : 'TOUTE LA TABLE EST PRÊTE'}
                                     </>}
                                 </Button>
                             </Card.Footer>
                        </Card>
                    </Col>
                ))}
                {(!historique || historique.length === 0) && (
                    <Col xs={12} className="text-center py-5">
                        <iconify-icon icon="solar:cup-hot-bold-duotone" style={{ fontSize: '100px', opacity: '0.1' }}></iconify-icon>
                        <h4 className="text-muted mt-3">Aucune commande en attente</h4>
                    </Col>
                )}
            </Row>
        );
    }

    return (
        <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
            <Card.Header className="bg-white py-3 d-flex justify-content-between align-items-center">
                <h5 className="mb-0 fw-bold">Historique des Transactions</h5>
                <Form.Check
                    type="switch"
                    id="cancelled-sales-switch"
                    label="Afficher uniquement les ventes annulées"
                    checked={showCancelledOnly}
                    onChange={(e) => {
                        setCurrentPage(1);
                        setShowCancelledOnly(e.target.checked);
                    }}
                />
            </Card.Header>
            <Card.Body className="p-0">
                <Table hover responsive className="align-middle mb-0">
                    <thead className="bg-light">
                        <tr>
                            <th className="ps-4 py-3 border-0 text-secondary small text-uppercase">Commande</th>
                            <th className="py-3 border-0 text-secondary small text-uppercase">Articles</th>
                            <th className="py-3 border-0 text-secondary small text-uppercase text-end">Total Commande</th>
                            <th className="py-3 border-0 text-secondary small text-uppercase text-center">Statut</th>
                            <th className="py-3 border-0 text-secondary small text-uppercase text-center">Table</th>
                            <th className="py-3 border-0 text-secondary small text-uppercase text-end">Pourboire</th>
                            <th className="py-3 border-0 text-secondary small text-uppercase">Paiement</th>
                            <th className="py-3 border-0 text-secondary small text-uppercase">Client</th>
                            <th className="pe-4 py-3 border-0 text-secondary small text-uppercase text-end">Statut / Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {historique && historique.map(group => ( // historique est maintenant un tableau de groupes
                            <React.Fragment key={group.orderGroupId}>
                                <tr className={
                                    group.isCancelled ? "bg-light text-muted" :
                                    group.statut === 'commande' ? "bg-warning-subtle" :
                                    ""
                                }>
                                    <td className="ps-4">
                                        <div className="fw-bold">{new Date(group.createdAt).toLocaleDateString()}</div>
                                        <div className="small text-muted">{new Date(group.createdAt).toLocaleTimeString()}</div>
                                        <div className="small text-muted">Serveur: {group.gerant?.nom || 'N/A'}</div>
                                    </td>
                                    <td onClick={() => toggleGroup(group.orderGroupId)} style={{ cursor: 'pointer', minWidth: '200px' }}>
                                        <div className="d-flex align-items-center justify-content-between bg-light p-2 rounded-3 border-dashed border-2">
                                            <div className="fw-bold text-primary small">
                                                <iconify-icon icon="solar:bag-bold-duotone" className="me-2"></iconify-icon>
                                                {group.items?.length} article{group.items?.length > 1 ? 's' : ''}
                                            </div>
                                            <iconify-icon 
                                                icon={expandedGroups[group.orderGroupId] ? "solar:alt-arrow-up-linear" : "solar:alt-arrow-down-linear"}
                                                className="text-muted"
                                            ></iconify-icon>
                                        </div>

                                        {expandedGroups[group.orderGroupId] && (
                                            <ul className="list-unstyled mb-0 small mt-2 animate__animated animate__fadeIn border-top pt-2">
                                                {group.items?.map(item => (
                                                    <li key={item._id} className={`py-1 border-bottom border-light ${item.isCancelled ? "text-decoration-line-through text-muted" : ""}`}>
                                                        <iconify-icon icon="solar:dot-bold" className="me-1 text-muted"></iconify-icon>
                                                        {item.article?.nom || 'Article supprimé'} 
                                                        <Badge bg="light" text="dark" className="ms-1 border">x{item.quantite}</Badge>
                                                        {item.remiseAppliquee > 0 && !item.isCancelled && (
                                                            <Badge bg="warning" text="dark" pill className="ms-1" style={{ fontSize: '0.65rem' }}>-{item.remiseAppliquee}{item.remiseType === 'pourcentage' ? '%' : 'GNF'}</Badge>
                                                        )}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </td>
                                    <td className="text-end fw-bold text-primary">
                                        {group.isCancelled ? <span className="text-decoration-line-through text-muted">{group.totalGroupPrice.toLocaleString()} GNF</span> : `${group.totalGroupPrice.toLocaleString()} GNF`}
                                    </td>
                                    <td className="text-center">
                                        {group.isCancelled ? <Badge bg="danger-subtle" text="danger" className="px-3 py-2 rounded-pill">ANNULÉE</Badge> :
                                         group.statut === 'finalisee' ? <Badge bg="success-subtle" text="success" className="px-3 py-2 rounded-pill">FINALISÉE</Badge> :
                                         group.statut === 'commande' ? <Badge bg="warning-subtle" text="warning" className="px-3 py-2 rounded-pill">EN ATTENTE</Badge> :
                                         <Badge bg="secondary-subtle" text="secondary" className="px-3 py-2 rounded-pill">{group.statut.toUpperCase()}</Badge>}
                                    </td>
                                    <td className="text-center">
                                        {group.numeroTable ? (
                                            <Badge bg="dark" className="px-2 py-1">{group.numeroTable}</Badge>
                                        ) : '-'}
                                    </td>
                                    <td className="text-end text-success fw-bold">
                                        {group.items.reduce((sum, item) => sum + (item.pourboire || 0), 0) > 0 ? `+${group.items.reduce((sum, item) => sum + (item.pourboire || 0), 0).toLocaleString()}` : '-'}
                                    </td>
                                    <td>
                                        <div className="d-flex flex-column align-items-start">
                                            {/* Assuming all items in a group have the same payment mode for simplicity */}
                                            {group.items?.[0]?.modePaiement === 'Orange Money' ? <Badge style={{backgroundColor: '#FF6600'}} className="border-0 fw-normal">OM</Badge> :
                                            group.items?.[0]?.modePaiement === 'MobiCash' ? <Badge style={{backgroundColor: '#FFCC00', color: '#000'}} className="border-0 fw-normal">Mobi</Badge> :
                                            group.items?.[0]?.modePaiement === 'PayCard' ? <Badge bg="info" className="border-0 fw-normal">Card</Badge> :
                                            group.items?.[0]?.modePaiement === 'Virement' ? <Badge bg="secondary" className="border-0 fw-normal">Bank</Badge> :
                                            group.items?.[0]?.modePaiement === 'Dette' ? <Badge bg="warning-subtle" text="warning-emphasis" className="border-0 fw-normal">Dette</Badge> :
                                            <Badge bg="success-subtle" text="success" className="border-0 fw-normal">Cash</Badge>}
                                            {group.items?.[0]?.transactionRef && <small className="text-muted x-small mt-1" style={{fontSize: '0.65rem'}}>{group.items[0].transactionRef}</small>}
                                        </div>
                                    </td>
                                    <td>{group.client ? <div className="d-flex align-items-center gap-1"><iconify-icon icon="solar:user-circle-bold" className="text-muted"></iconify-icon> {group.client.nom}</div> : <span className="text-muted small">Passage</span>}</td>
                                    <td className="pe-4 text-end">
                                        {group.statut === 'commande' && userRole === 'Gérant' && (
                                            <div className="d-flex gap-2 justify-content-end align-items-center">
                                                <Button variant="success" size="sm" className="rounded-pill px-3 shadow-sm" onClick={() => handleFinalizeOrder(group.orderGroupId, 'finalisee', true)} disabled={isUpdatingStatus}>
                                                    {isUpdatingStatus ? <Spinner as="span" animation="border" size="sm" /> : <>
                                                        <iconify-icon icon="solar:check-circle-bold" className="me-1 align-middle"></iconify-icon>
                                                        TERMINER (PAYÉ)
                                                    </>}
                                                </Button>
                                            </div>
                                        )}
                                        {/* Boutons d'annulation pour chaque article du groupe */}
                                        {group.items?.map(item => (
                                            !item.isCancelled && isCancellationAllowed(item) && (
                                                <Button
                                                    key={`cancel-${item._id}`}
                                                    variant="outline-danger"
                                                    size="sm"
                                                    className="rounded-pill px-3 mt-1"
                                                    onClick={() => { setSaleToCancel(item); setShowCancelModal(true); }}
                                                    title="Annuler cet article"
                                                >
                                                    <iconify-icon icon="solar:trash-bin-trash-bold" className="me-1 align-middle"></iconify-icon>
                                                    Annuler {item.article?.nom}
                                                </Button>
                                            )
                                        ))}
                                    </td>
                                </tr>
                            </React.Fragment>
                        ))}
                    </tbody>
                </Table>
            </Card.Body>
            {totalPages > 1 && (
                <Card.Footer className="d-flex justify-content-center border-0 bg-white py-3">
                    <Pagination className="mb-0">
                        <Pagination.First onClick={() => setCurrentPage(1)} disabled={currentPage === 1} />
                        <Pagination.Prev onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1} />
                        
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
                        <Pagination.Next onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} />
                        <Pagination.Last onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} />
                    </Pagination>
                </Card.Footer>
            )}
        </Card>
    );
};

export default HistoryTab;