/**
 * @file HistoryTab.js
 * @description Ce composant est un composant de présentation.
 * Il est responsable de l'affichage de l'historique des ventes pour un utilisateur "Gérant".
 * Il reçoit toutes les données et les fonctions de gestion (comme l'annulation) via ses props depuis le composant parent `VentesView`.
 * Il inclut un interrupteur pour filtrer et n'afficher que les ventes annulées.
 */
import React, { useState } from 'react';
import { 
    Card, 
    Table, 
    Badge, 
    Button, 
    Form, 
    Pagination, 
    Spinner, 
    Row, 
    Col, 
    OverlayTrigger, 
    Tooltip 
} from 'react-bootstrap';
import { formatCurrency } from '../utils/formatUtils'; // Import the new utility

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
    isPendingView,
    ecoMode
}) => {
    // État pour gérer l'affichage des détails (accordéon)
    const [expandedGroups, setExpandedGroups] = useState({});
    const [selectedItems, setSelectedItems] = useState({}); // { tableId: [itemId1, itemId2] }

    // Helper pour le temps écoulé (Style Odoo)
    const getRelativeTime = (date) => {
        const diff = new Date() - new Date(date);
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return "À l'instant";
        if (mins < 60) return `Il y a ${mins} min`;
        return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

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
        const newOrders = (historique || []).filter(g => g.statut === 'commande');
        const readyOrders = (historique || []).filter(g => g.statut === 'en_preparation');

        return (
            <>
            <Row className="g-3">
                {newOrders.map(group => (
                    <Col xl={3} lg={4} md={6} xs={12} key={group.orderGroupId}>
                        <Card className="border-0 shadow-sm rounded-4 h-100 overflow-hidden border-top border-4 border-warning animate__animated animate__fadeIn position-relative">
                             <Card.Header className="bg-white py-3 border-0">
                                 <div className="d-flex justify-content-between align-items-center">
                                     <Badge bg="primary" className="fs-6 px-3 py-2 rounded-pill shadow-sm">
                                         <iconify-icon icon="solar:chair-bold" className="me-2 align-middle"></iconify-icon>
                                         {group.numeroTable ? `TABLE ${group.numeroTable}` : 'À EMPORTER'}
                                     </Badge>
                                     <div className="text-end">
                                         <div className="small fw-bold text-primary">{getRelativeTime(group.createdAt)}</div>
                                         <div className="x-small text-muted">Par: {group.gerant?.nom || 'N/A'}</div>
                                     </div>
                                 </div>
                             </Card.Header>
                             <Card.Body className="p-2 bg-light bg-opacity-50">
                                 <div className="pending-items-list" style={{ maxHeight: '450px', overflowY: 'auto', overflowX: 'hidden' }}>
                                     {group.items?.map(item => (
                                         <div key={item._id} className={`d-flex align-items-center p-2 mb-2 bg-white rounded-3 shadow-sm ${item.isCancelled ? 'opacity-50' : ''}`} style={{ transition: 'all 0.2s' }}>
                                             {!item.isCancelled && (
                                                 <Form.Check 
                                                     type="checkbox"
                                                     className="me-2 custom-cart-checkbox"
                                                     style={{ transform: 'scale(1.2)' }}
                                                     checked={selectedItems[group.orderGroupId]?.includes(item._id) || false}
                                                     onChange={() => toggleItemSelection(group.orderGroupId, item._id)} // This is correct
                                                 />
                                             )}
                                             {item.article?.image && !ecoMode ? ( // Apply ecoMode here
                                                 <img src={item.article.image} alt="" className="rounded me-2" style={{ width: '40px', height: '40px', objectFit: 'cover' }} />
                                             ) : (
                                                 <div className="bg-secondary bg-opacity-10 rounded d-flex align-items-center justify-content-center me-2" style={{ width: '50px', height: '50px' }}><iconify-icon icon="solar:box-bold" className="text-muted"></iconify-icon></div>
                                             )}
                                             <div className="flex-grow-1" style={{ minWidth: 0 }}>
                                                 <div className={`fw-bold small ${item.isCancelled ? 'text-decoration-line-through' : ''}`}>{item.article?.nom || 'Article supprimé'}</div>
                                                 <div className="d-flex align-items-center gap-2 mt-1">
                                                     {item.statut === 'en_preparation' ? (
                                                         <Badge bg="success-subtle" text="success" pill style={{ fontSize: '0.65rem' }}>DÉJÀ PRÊT</Badge>
                                                     ) : (
                                                         <Badge bg="warning-subtle" text="warning-emphasis" pill style={{ fontSize: '0.65rem' }}>NOUVEAU</Badge>
                                                     )}
                                                 </div>
                                                 <div className="d-flex align-items-center mt-1">
                                                     <span className="badge bg-dark rounded-pill me-2">x{item.quantite}</span>
                                                     <span className="text-success small fw-bold">{item.prixTotal.toLocaleString()} GNF</span>
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
                                     <span className="fw-bold fs-6 text-dark">{formatCurrency(group.totalGroupPrice)}</span>
                                 </div>
                                 <Button 
                                     variant={selectedItems[group.orderGroupId]?.length > 0 ? "primary" : "success"}
                                     className="w-100 rounded-pill py-2 fw-bold shadow-sm d-flex align-items-center justify-content-center" 
                                     onClick={() => {
                                         const idsToUpdate = selectedItems[group.orderGroupId]?.length > 0 
                                            ? selectedItems[group.orderGroupId] 
                                            : group.items.map(i => i._id);
                                         handleFinalizeOrder(group.orderGroupId, 'en_preparation', true, 'Cash', idsToUpdate);
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
                {newOrders.length === 0 && (
                    <Col xs={12} className="text-center py-5">
                        <iconify-icon icon="solar:cup-hot-bold-duotone" style={{ fontSize: '100px', opacity: '0.1' }}></iconify-icon>
                        <h4 className="text-muted mt-3">Aucune commande en attente</h4>
                    </Col>
                )}
            </Row>

            {/* --- RECAPITULATIF DES TABLES PRÊTES (Style Odoo) --- */}
            {readyOrders.length > 0 && (
                <div className="mt-5 pt-4 border-top">
                    <h5 className="fw-bold mb-3 d-flex align-items-center text-success">
                        <iconify-icon icon="solar:check-circle-bold" className="me-2"></iconify-icon>
                        Tables Prêtes (En attente d'encaissement par les serveurs)
                    </h5>
                    <div className="d-flex flex-wrap gap-2">
                        {readyOrders.map(group => (
                            <Card key={group.orderGroupId} className="border-0 shadow-sm rounded-4 bg-success bg-opacity-10 border border-success border-opacity-25" style={{ minWidth: '200px' }}>
                                <Card.Body className="p-3 text-center">
                                    <div className="d-flex justify-content-between align-items-center mb-2">
                                        <Badge bg="success" pill>TABLE {group.numeroTable || 'N/A'}</Badge>
                                        <small className="text-muted">{new Date(group.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</small>
                                    </div>
                                    <div className="fw-bold fs-5 text-dark mb-1">{formatCurrency(group.totalGroupPrice)}</div>
                                    <div className="small text-muted mb-0">Serveur: {group.gerant?.nom || 'N/A'}</div>
                                </Card.Body>
                            </Card>
                        ))}
                    </div>
                    <p className="text-muted small mt-3">
                        <iconify-icon icon="solar:info-circle-linear" className="me-1 align-middle"></iconify-icon>
                        Ces tables ont été validées au bar. Elles apparaissent en vert sur le dashboard des serveurs.
                    </p>
                </div>
            )}
            </>
        );
    }

    return (
        <div className="history-modern-view">
            <style>{`
                .odoo-row { 
                    transition: all 0.2s; 
                    border-bottom: 1px solid rgba(0,0,0,0.05);
                }
                .odoo-row:hover { background-color: rgba(13, 110, 253, 0.03) !important; }
                .bg-finalisee { border-left: 4px solid #198754; } 
                .bg-commande { border-left: 4px solid #0dcaf0; }
                .bg-en_preparation { border-left: 4px solid #ffc107; }
                .bg-annulee { background-color: #f8f9fa !important; opacity: 0.7; }
            `}</style>
            
            <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
                <Card.Header className="bg-white py-3 d-flex justify-content-between align-items-center border-bottom-0">
                    <h5 className="mb-0 fw-bold">Historique des Transactions</h5>
                    <Form.Check
                        type="switch"
                        id="cancelled-sales-switch"
                        label="Ventes annulées uniquement"
                        checked={showCancelledOnly}
                        onChange={(e) => { setCurrentPage(1); setShowCancelledOnly(e.target.checked); }}
                    />
                </Card.Header>
                <Card.Body className="p-0">
                    <Table responsive className="align-middle mb-0 border-0">
                        <thead className="bg-light text-muted small text-uppercase">
                            <tr>
                                <th className="ps-4 border-0">Détails Commande</th>
                                <th className="border-0">Emplacement / Client</th>
                                <th className="border-0">Articles & Contenu</th>
                                <th className="border-0 text-end">Total & Règlement</th>
                                <th className="pe-4 border-0 text-center">État & Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {historique?.map(group => (
                                <React.Fragment key={group.orderGroupId}>
                                    <tr className={`odoo-row ${group.isCancelled ? "bg-annulee" : `bg-${group.statut}`}`}>
                                        <td className="ps-4 py-3">
                                            <div className="fw-bold text-dark"># {group.orderGroupId ? group.orderGroupId.slice(-6).toUpperCase() : 'N/A'}</div>
                                            <div className="small text-muted">{new Date(group.createdAt).toLocaleDateString()} - {new Date(group.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                                            <div className="x-small text-muted">Saisi par : <strong>{group.gerant?.nom || 'N/A'}</strong></div>
                                        </td>
                                        <td>
                                            <div className="d-flex flex-column">
                                                <div className="fw-bold text-dark d-flex align-items-center mb-1">
                                                    <iconify-icon icon="solar:chair-bold" className="me-1 text-primary"></iconify-icon>
                                                    {group.numeroTable ? `Table ${group.numeroTable}` : 'À emporter'}
                                                </div>
                                                <div className="x-small d-flex align-items-center text-muted">
                                                    <iconify-icon icon="solar:user-circle-bold" className="me-1 text-muted"></iconify-icon>
                                                    {group.client?.nom || 'Client de passage'}
                                                </div>
                                            </div>
                                        </td>
                                        <td onClick={() => toggleGroup(group.orderGroupId)} style={{ cursor: 'pointer', minWidth: '220px' }}>
                                            <div className={`d-flex align-items-center justify-content-between p-2 rounded-3 border ${expandedGroups[group.orderGroupId] ? 'bg-white border-primary shadow-sm' : 'bg-light border-transparent'}`}>
                                                <div className="fw-bold text-dark small">
                                                    <iconify-icon icon="solar:cart-large-bold" className="me-2 text-primary"></iconify-icon>
                                                    {group.items?.length} article{group.items?.length > 1 ? 's' : ''}
                                                </div>
                                                <iconify-icon icon={expandedGroups[group.orderGroupId] ? "solar:alt-arrow-up-bold" : "solar:alt-arrow-down-bold"}></iconify-icon>
                                            </div>
                                            {expandedGroups[group.orderGroupId] && (
                                                <div className="mt-2 p-2 bg-white rounded-3 shadow-sm border animate__animated animate__fadeIn">
                                                    <ul className="list-unstyled mb-0 small">
                                                        {group.items?.map(item => (
                                                            <li key={item._id} className="d-flex justify-content-between py-1 border-bottom border-light">
                                                                <span className={item.isCancelled ? "text-decoration-line-through text-muted" : ""}>
                                                                    • {item.article?.nom} <Badge bg="light" text="dark">x{item.quantite}</Badge>
                                                                </span>
                                                                {!item.isCancelled && isCancellationAllowed(item) && (
                                                                    <Button variant="link" className="text-danger p-0 ms-2" onClick={(e) => { e.stopPropagation(); setSaleToCancel(item); setShowCancelModal(true); }}>
                                                                        <iconify-icon icon="solar:trash-bin-trash-bold"></iconify-icon>
                                                                    </Button>
                                                                )}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </td>
                                        <td className="text-end pe-3">
                                            <div className={`fw-bold fs-5 ${group.isCancelled ? 'text-decoration-line-through text-muted' : 'text-dark'}`}>{formatCurrency(group.totalGroupPrice)}</div>
                                            <div className="d-flex flex-wrap justify-content-end gap-1 mt-1">
                                                {group.items?.[0]?.modePaiement && <Badge bg="secondary-subtle" text="dark" className="border-0 fw-normal small">{group.items[0].modePaiement}</Badge>}
                                                {group.totalGroupPourboire > 0 && <Badge bg="info-subtle" text="info" className="border-0 small">Tip: +{formatCurrency(group.totalGroupPourboire)}</Badge>}
                                            </div>
                                        </td>
                                        <td className="pe-4 text-center">
                                            <div className="d-flex flex-column align-items-center gap-1">
                                                {group.isCancelled ? <Badge bg="danger" className="px-3 py-2 rounded-pill">ANNULÉE</Badge> :
                                                 group.statut === 'finalisee' ? <Badge bg="success" className="px-3 py-2 rounded-pill shadow-sm text-uppercase">Payé</Badge> :
                                                 group.statut === 'en_preparation' ? <Badge bg="warning" text="dark" className="px-3 py-2 rounded-pill shadow-sm text-uppercase">Prêt</Badge> :
                                                 <Badge bg="info" className="px-3 py-2 rounded-pill text-white shadow-sm">EN ATTENTE</Badge>}
                                                
                                                {group.statut === 'commande' && !group.isCancelled && userRole === 'Gérant' && (
                                                    <Button variant="primary" size="sm" className="rounded-pill shadow-sm w-100" onClick={() => handleFinalizeOrder(group.orderGroupId, 'en_preparation', true)} disabled={isUpdatingStatus}>
                                                        {isUpdatingStatus ? <Spinner size="sm" /> : "PRÊT À SERVIR"}
                                                    </Button>
                                                )}
                                            </div>
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
            {/* Boutons de navigation rapide */}
            <Pagination.First 
                onClick={() => setCurrentPage(1)} 
                disabled={currentPage === 1} 
            />
            <Pagination.Prev 
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} 
                disabled={currentPage === 1} 
            />
            
            {(() => {
                const pages = [];
                // Logique pour déterminer quelles pages afficher
                for (let i = 1; i <= totalPages; i++) {
                    if (
                        i === 1 || // Toujours la première
                        i === totalPages || // Toujours la dernière
                        (i >= currentPage - 1 && i <= currentPage + 1) // Autour de la page active
                    ) {
                        pages.push(i);
                    }
                }

                return pages.map((p, idx) => (
                    <React.Fragment key={p}>
                        {/* Ajouter des points de suspension si un saut de page est détecté */}
                        {idx > 0 && pages[idx - 1] !== p - 1 && (
                            <Pagination.Ellipsis disabled />
                        )}
                        
                        <Pagination.Item 
                            active={p === currentPage} 
                            onClick={() => setCurrentPage(p)}
                        >
                            {p}
                        </Pagination.Item>
                    </React.Fragment>
                ));
            })()}

            <Pagination.Next 
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} 
                disabled={currentPage === totalPages} 
            />
            <Pagination.Last 
                onClick={() => setCurrentPage(totalPages)} 
                disabled={currentPage === totalPages} 
            />
        </Pagination>
    </Card.Footer>
)}
            </Card>
        </div>
    );
};

export default HistoryTab;