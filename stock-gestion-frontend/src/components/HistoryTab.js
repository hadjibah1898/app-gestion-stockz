/**
 * @file HistoryTab.js
 * @description Ce composant est un composant de présentation .
 * Il est responsable de l'affichage de l'historique des ventes pour un utilisateur "Gérant".
 * Il reçoit toutes les données et les fonctions de gestion (comme l'annulation) via ses props depuis le composant parent `VentesView`.
 * Il inclut un interrupteur pour filtrer et n'afficher que les ventes annulées.
 */
import React from 'react';
import { Card, Table, Badge, Button, Form } from 'react-bootstrap';

const HistoryTab = ({
    historique,
    showCancelledOnly,
    setShowCancelledOnly,
    setCurrentPage,
    isCancellationAllowed,
    handleImageClick,
    setSaleToCancel,
    setShowCancelModal
}) => {
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
                            <th className="ps-4 py-3 border-0 text-secondary small text-uppercase">Date</th>
                            <th className="py-3 border-0 text-secondary small text-uppercase">Article</th>
                            <th className="py-3 border-0 text-secondary small text-uppercase text-center">Qté</th>
                            <th className="py-3 border-0 text-secondary small text-uppercase text-end">Total</th>
                            <th className="py-3 border-0 text-secondary small text-uppercase">Client</th>
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
                                <td>{vente.client ? <div className="d-flex align-items-center gap-1"><iconify-icon icon="solar:user-circle-bold" className="text-muted"></iconify-icon> {vente.client.nom}</div> : <span className="text-muted small">Passage</span>}</td>
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
                                        );
                                    })()}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </Table>
            </Card.Body>
        </Card>
    );
};

export default HistoryTab;