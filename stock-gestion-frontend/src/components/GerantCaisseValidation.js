/**
 * @file GerantCaisseValidation.js
 * @description Vue de validation des rapports de caisse pour le Gérant.
 */

import React, { useState, useEffect } from 'react';
import { Card, Button, Table, Badge, Spinner, Alert, Modal, Row, Col } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { caisseAPI } from '../services/api';
import { toast } from 'react-toastify';

const GerantCaisseValidation = () => {
    const [rapports, setRapports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedRapport, setSelectedRapport] = useState(null);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [rapportDetails, setRapportDetails] = useState(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [actionLoading, setActionLoading] = useState(null);
    const [caisseOuverte, setCaisseOuverte] = useState(null); // null = chargement, false = fermée, object = ouverte
    const [checkingCaisse, setCheckingCaisse] = useState(true);

    useEffect(() => {
        loadRapports();
        checkCaisseStatus();
    }, []);

    const checkCaisseStatus = async () => {
        try {
            setCheckingCaisse(true);
            const statut = await caisseAPI.getStatut();
            // Après l'intercepteur, statut = null si fermée, ou l'objet session si ouverte
            setCaisseOuverte(!!statut);
        } catch (err) {
            // 403 = caisse fermée, c'est normal
            setCaisseOuverte(false);
        } finally {
            setCheckingCaisse(false);
        }
    };

    const loadRapports = async () => {
        try {
            setLoading(true);
            // Le gérant voit les rapports de ses caissiers
            const res = await caisseAPI.listerRapportsCaissiers();
            // Après l'intercepteur, res = { data: [...], pagination: {...} }
            // ou directement le tableau selon le backend
            setRapports(Array.isArray(res) ? res : (res.data || []));
        } catch (err) {
            toast.error("Erreur lors du chargement des rapports");
        } finally {
            setLoading(false);
        }
    };

    const handleViewDetails = async (rapport) => {
        setSelectedRapport(rapport);
        setShowDetailModal(true);
        setLoadingDetails(true);
        try {
            // Après l'intercepteur, getRapportCaissierDetails retourne directement
            // l'objet { rapport, ventes, depenses, ... }
            const res = await caisseAPI.getRapportCaissierDetails(rapport._id);
            setRapportDetails(res);
        } catch (err) {
            toast.error("Erreur lors du chargement des détails");
        } finally {
            setLoadingDetails(false);
        }
    };

    const handleValidate = async (rapportId) => {
        if (!window.confirm("Êtes-vous sûr de vouloir valider ce rapport ?")) return;

        setActionLoading(rapportId);
        try {
            await caisseAPI.validerRapportCaissier(rapportId, { commentairesGérant: 'Validé par le gérant' });
            toast.success("Rapport validé avec succès !");
            setShowDetailModal(false);
            loadRapports();
        } catch (err) {
            toast.error(err.response?.data?.message || "Erreur lors de la validation");
        } finally {
            setActionLoading(null);
        }
    };

    const handleReject = async (rapportId) => {
        const motif = prompt("Motif du rejet (obligatoire) :");
        if (!motif) return;

        setActionLoading(rapportId);
        try {
            await caisseAPI.rejeterRapportCaissier(rapportId, { commentairesGérant: motif });
            toast.success("Rapport rejeté avec succès !");
            setShowDetailModal(false);
            loadRapports();
        } catch (err) {
            toast.error(err.response?.data?.message || "Erreur lors du rejet");
        } finally {
            setActionLoading(null);
        }
    };

    const getStatusBadge = (statut) => {
        switch (statut) {
            case 'EN_ATTENTE':
                return <Badge bg="warning">En attente</Badge>;
            case 'VALIDE_PAR_GERANT':
                return <Badge bg="info">Validé par Gérant</Badge>;
            case 'REJETE_PAR_GERANT':
                return <Badge bg="danger">Rejeté par Gérant</Badge>;
            case 'VALIDE':
                return <Badge bg="success">Validé Admin</Badge>;
            case 'REJETE':
                return <Badge bg="danger">Rejeté Admin</Badge>;
            default:
                return <Badge bg="secondary">{statut}</Badge>;
        }
    };

    const formatDate = (date) => {
        if (!date) return '-';
        return new Date(date).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {
        return (
            <div className="text-center p-5">
                <Spinner animation="border" variant="primary" style={{ width: '3rem', height: '3rem' }}>
                    <span className="visually-hidden">Chargement...</span>
                </Spinner>
            </div>
        );
    }
    return (
        <div className="p-4">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <div>
                    <h3 className="fw-bold mb-1">Validation des Rapports de Caisse</h3>
                    <p className="text-muted mb-0">Validez ou rejetez les rapports de clôture de caisse</p>
                </div>
                <Button variant="outline-primary" onClick={loadRapports} className="rounded-pill">
                    <iconify-icon icon="solar:refresh-bold" className="me-2"></iconify-icon>
                    Actualiser
                </Button>
            </div>

            {/* Avertissement si la caisse du gérant n'est pas ouverte */}
            {!checkingCaisse && caisseOuverte === false && (
                <Alert variant="warning" className="d-flex align-items-center justify-content-between mb-4">
                    <div className="d-flex align-items-center">
                        <iconify-icon icon="solar:lock-keyhole-minimalistic-bold-duotone" style={{ fontSize: '32px' }} className="me-3 text-danger"></iconify-icon>
                        <div>
                            <strong>Votre caisse est fermée.</strong><br />
                            <span className="small">Vous devez ouvrir votre caisse avant de pouvoir valider ou rejeter les rapports de vos caissiers.</span>
                        </div>
                    </div>
                    <Link to="/gerant-dashboard/caisse" className="btn btn-danger rounded-pill">
                        <iconify-icon icon="solar:key-bold" className="me-2"></iconify-icon>
                        Ouvrir ma caisse
                    </Link>
                </Alert>
            )}

            {rapports.length === 0 ? (
                <Alert variant="info" className="text-center">
                    <iconify-icon icon="solar:clipboard-list-bold-duotone" style={{ fontSize: '48px' }} className="mb-2"></iconify-icon>
                    <p className="mb-0">Aucun rapport de caisse à valider pour le moment.</p>
                </Alert>
            ) : (
                <Card className="border-0 shadow-sm">
                    <Card.Body className="p-0">
                        <Table responsive hover className="align-middle mb-0">
                            <thead className="bg-light">
                                <tr>
                                    <th className="ps-4">Date</th>
                                    <th>Boutique</th>
                                    <th>Fond Initial</th>
                                    <th>Total Ventes</th>
                                    <th>Montant Clôture</th>
                                    <th>Écart</th>
                                    <th>Statut</th>
                                    <th className="text-end pe-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rapports.map(rapport => (
                                    <tr key={rapport._id}>
                                        <td className="ps-4">
                                            <div className="fw-bold">{formatDate(rapport.createdAt)}</div>
                                        </td>
                                        <td>{rapport.boutique?.nom || 'N/A'}</td>
                                        <td>{rapport.fondInitial?.toLocaleString()} GNF</td>
                                        <td className="fw-bold text-success">+{rapport.totalVentes?.toLocaleString()} GNF</td>
                                        <td className="fw-bold">{rapport.montantCloture?.toLocaleString()} GNF</td>
                                        <td>
                                            <span className={`fw-bold ${rapport.ecart === 0 ? 'text-success' : 'text-danger'}`}>
                                                {rapport.ecart === 0 ? '✓ 0' : `${rapport.ecart > 0 ? '+' : ''}${rapport.ecart?.toLocaleString()} GNF`}
                                            </span>
                                        </td>
                                        <td>{getStatusBadge(rapport.statut)}</td>
                                        <td className="text-end pe-4">
                                            <Button
                                                variant="outline-primary"
                                                size="sm"
                                                onClick={() => handleViewDetails(rapport)}
                                                className="me-1"
                                            >
                                                <iconify-icon icon="solar:eye-bold"></iconify-icon>
                                            </Button>
                                            {rapport.statut === 'EN_ATTENTE' && (
                                                <>
                                                    <Button
                                                        variant="outline-success"
                                                        size="sm"
                                                        onClick={() => handleValidate(rapport._id)}
                                                        disabled={actionLoading === rapport._id}
                                                        className="me-1"
                                                    >
                                                        {actionLoading === rapport._id ? (
                                                            <Spinner size="sm" />
                                                        ) : (
                                                            <iconify-icon icon="solar:check-circle-bold"></iconify-icon>
                                                        )}
                                                    </Button>
                                                    <Button
                                                        variant="outline-danger"
                                                        size="sm"
                                                        onClick={() => handleReject(rapport._id)}
                                                        disabled={actionLoading === rapport._id}
                                                    >
                                                        {actionLoading === rapport._id ? (
                                                            <Spinner size="sm" />
                                                        ) : (
                                                            <iconify-icon icon="solar:close-circle-bold"></iconify-icon>
                                                        )}
                                                    </Button>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                    </Card.Body>
                </Card>
            )}

            {/* Modale de détails */}
            <Modal show={showDetailModal} onHide={() => setShowDetailModal(false)} size="lg">
                <Modal.Header closeButton>
                    <Modal.Title>
                        <iconify-icon icon="solar:clipboard-list-bold-duotone" className="me-2"></iconify-icon>
                        Détails du Rapport
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {loadingDetails ? (
                        <div className="text-center p-5">
                            <Spinner animation="border" />
                        </div>
                    ) : rapportDetails ? (
                        <div>
                            <Row className="g-3 mb-4">
                                <Col md={6}>
                                    <Card className="bg-light">
                                        <Card.Body>
                                            <h6 className="text-muted mb-2">Informations Générales</h6>
                                            <p className="mb-1"><strong>Date :</strong> {formatDate(rapportDetails.rapport?.createdAt)}</p>
                                            <p className="mb-1"><strong>Gérant :</strong> {rapportDetails.rapport?.gerant?.nom || 'N/A'}</p>
                                            <p className="mb-0"><strong>Boutique :</strong> {rapportDetails.rapport?.boutique?.nom || 'N/A'}</p>
                                        </Card.Body>
                                    </Card>
                                </Col>
                                <Col md={6}>
                                    <Card className="bg-light">
                                        <Card.Body>
                                            <h6 className="text-muted mb-2">Résumé Financier</h6>
                                            <p className="mb-1"><strong>Fond Initial :</strong> {rapportDetails.rapport?.fondInitial?.toLocaleString()} GNF</p>
                                            <p className="mb-1"><strong>Total Ventes :</strong> {rapportDetails.rapport?.totalVentes?.toLocaleString()} GNF</p>
                                            <p className="mb-0"><strong>Montant Clôture :</strong> {rapportDetails.rapport?.montantCloture?.toLocaleString()} GNF</p>
                                        </Card.Body>
                                    </Card>
                                </Col>
                            </Row>

                            <Row className="g-3 mb-4">
                                <Col md={4}>
                                    <Card className="border-0 shadow-sm bg-success-subtle">
                                        <Card.Body className="text-center">
                                            <h6 className="text-muted">Solde Théorique</h6>
                                            <h4 className="fw-bold text-success">{rapportDetails.rapport?.soldeTheorique?.toLocaleString()} GNF</h4>
                                        </Card.Body>
                                    </Card>
                                </Col>
                                <Col md={4}>
                                    <Card className="border-0 shadow-sm bg-info-subtle">
                                        <Card.Body className="text-center">
                                            <h6 className="text-muted">Écart</h6>
                                            <h4 className={`fw-bold ${rapportDetails.rapport?.ecart === 0 ? 'text-success' : 'text-danger'}`}>
                                                {rapportDetails.rapport?.ecart?.toLocaleString()} GNF
                                            </h4>
                                        </Card.Body>
                                    </Card>
                                </Col>
                                <Col md={4}>
                                    <Card className="border-0 shadow-sm bg-warning-subtle">
                                        <Card.Body className="text-center">
                                            <h6 className="text-muted">Statut</h6>
                                            <h4 className="fw-bold">{getStatusBadge(rapportDetails.rapport?.statut)}</h4>
                                        </Card.Body>
                                    </Card>
                                </Col>
                            </Row>

                            {rapportDetails.rapport?.commentairesGérant && (
                                <Alert variant="info" className="mb-3">
                                    <strong>Commentaires du gérant :</strong><br />
                                    {rapportDetails.rapport.commentairesGérant}
                                </Alert>
                            )}

                            {rapportDetails.rapport?.commentairesAdmin && (
                                <Alert variant="warning" className="mb-3">
                                    <strong>Commentaires de l'admin :</strong><br />
                                    {rapportDetails.rapport.commentairesAdmin}
                                </Alert>
                            )}

                            {rapportDetails.ventes && rapportDetails.ventes.length > 0 && (
                                <Card className="mb-3">
                                    <Card.Header className="bg-white">
                                        <h6 className="fw-bold mb-0">Ventes de la session ({rapportDetails.ventes.length})</h6>
                                    </Card.Header>
                                    <Card.Body className="p-0">
                                        <Table responsive hover size="sm" className="mb-0">
                                            <thead>
                                                <tr>
                                                    <th>Article</th>
                                                    <th>Qté</th>
                                                    <th>Prix Total</th>
                                                    <th>Mode Paiement</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {rapportDetails.ventes.map((vente, idx) => (
                                                    <tr key={idx}>
                                                        <td>{vente.article?.nom || 'N/A'}</td>
                                                        <td>{vente.quantite}</td>
                                                        <td>{vente.prixTotal?.toLocaleString()} GNF</td>
                                                        <td>{vente.modePaiement}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </Table>
                                    </Card.Body>
                                </Card>
                            )}

                            {rapportDetails.depenses && rapportDetails.depenses.length > 0 && (
                                <Card className="mb-3">
                                    <Card.Header className="bg-white">
                                        <h6 className="fw-bold mb-0">Dépenses de la session ({rapportDetails.depenses.length})</h6>
                                    </Card.Header>
                                    <Card.Body className="p-0">
                                        <Table responsive hover size="sm" className="mb-0">
                                            <thead>
                                                <tr>
                                                    <th>Motif</th>
                                                    <th>Montant</th>
                                                    <th>Date</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {rapportDetails.depenses.map((depense, idx) => (
                                                    <tr key={idx}>
                                                        <td>{depense.motif}</td>
                                                        <td className="text-danger">-{depense.montant?.toLocaleString()} GNF</td>
                                                        <td>{formatDate(depense.createdAt)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </Table>
                                    </Card.Body>
                                </Card>
                            )}
                        </div>
                    ) : (
                        <Alert variant="info">Aucun détail disponible</Alert>
                    )}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowDetailModal(false)}>
                        Fermer
                    </Button>
                    {selectedRapport?.statut === 'EN_ATTENTE' && (
                        <>
                            <Button
                                variant="success"
                                onClick={() => handleValidate(selectedRapport._id)}
                                disabled={actionLoading === selectedRapport._id}
                            >
                                {actionLoading === selectedRapport._id ? (
                                    <Spinner size="sm" />
                                ) : (
                                    <>
                                        <iconify-icon icon="solar:check-circle-bold" className="me-2"></iconify-icon>
                                        Valider
                                    </>
                                )}
                            </Button>
                            <Button
                                variant="danger"
                                onClick={() => handleReject(selectedRapport._id)}
                                disabled={actionLoading === selectedRapport._id}
                            >
                                {actionLoading === selectedRapport._id ? (
                                    <Spinner size="sm" />
                                ) : (
                                    <>
                                        <iconify-icon icon="solar:close-circle-bold" className="me-2"></iconify-icon>
                                        Rejeter
                                    </>
                                )}
                            </Button>
                        </>
                    )}
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default GerantCaisseValidation;