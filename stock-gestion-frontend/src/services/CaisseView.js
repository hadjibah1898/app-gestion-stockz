import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Form, Spinner, Alert, Row, Col, InputGroup, Modal, Tabs, Tab, Table, Badge } from 'react-bootstrap';
import { caisseAPI } from '../services/api';

const CaisseView = () => {
    const [caisseStatut, setCaisseStatut] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // State for forms
    const [fondInitial, setFondInitial] = useState('');
    const [montantCloture, setMontantCloture] = useState('');
    const [commentaires, setCommentaires] = useState('');

    // State for modals
    const [showCloseModal, setShowCloseModal] = useState(false);

    const fetchStatut = useCallback(async () => {
        try {
            setLoading(true);
            const res = await caisseAPI.getStatut();
            setCaisseStatut(res.data);
        } catch (err) {
            // Si la caisse n'est pas ouverte, l'API renvoie 403, ce qui est normal.
            // On vérifie si un rapport est en attente.
            if (err.response && err.response.status === 403) {
                setError(err.response.data.message);
            } else {
                setError("Erreur lors de la récupération du statut de la caisse.");
            }
            setCaisseStatut(null); // Assure que l'état est bien null en cas d'erreur
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatut();
    }, [fetchStatut]);

    const handleOpenCaisse = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        try {
            await caisseAPI.ouvrir({ fondInitial: parseFloat(fondInitial) });
            setSuccess("Caisse ouverte avec succès !");
            setFondInitial('');
            fetchStatut(); // Recharger le statut
        } catch (err) {
            setError(err.response?.data?.message || "Erreur lors de l'ouverture de la caisse.");
        }
    };

    const handleCloseCaisse = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        try {
            await caisseAPI.fermer({ montantCloture: parseFloat(montantCloture), commentairesGérant: commentaires });
            setSuccess("Caisse fermée et rapport généré avec succès.");
            setMontantCloture('');
            setCommentaires('');
            setShowCloseModal(false);
            fetchStatut(); // Recharger le statut
        } catch (err) {
            setError(err.response?.data?.message || "Erreur lors de la fermeture de la caisse.");
        }
    };

    const renderOpenCaisseForm = () => (
        <Card className="border-0 shadow-sm rounded-4">
            <Card.Body className="p-4">
                <div className="text-center mb-4">
                    <iconify-icon icon="solar:lock-keyhole-minimalistic-bold-duotone" style={{ fontSize: '64px' }} className="text-danger"></iconify-icon>
                    <h4 className="fw-bold mt-3">Caisse Fermée</h4>
                    <p className="text-muted">Veuillez ouvrir la caisse pour commencer à enregistrer des ventes.</p>
                </div>
                <Form onSubmit={handleOpenCaisse}>
                    <Form.Group className="mb-3">
                        <Form.Label>Fond de caisse initial</Form.Label>
                        <InputGroup>
                            <Form.Control
                                type="number"
                                min="0"
                                value={fondInitial}
                                onChange={(e) => setFondInitial(e.target.value)}
                                required
                                autoFocus
                                placeholder="Montant en GNF"
                            />
                            <InputGroup.Text>GNF</InputGroup.Text>
                        </InputGroup>
                    </Form.Group>
                    <div className="d-grid">
                        <Button variant="success" type="submit" size="lg">
                            <iconify-icon icon="solar:key-bold" className="me-2"></iconify-icon>
                            Ouvrir la Caisse
                        </Button>
                    </div>
                </Form>
            </Card.Body>
        </Card>
    );

    const renderCaisseOuverte = () => (
        <Card className="border-0 shadow-sm rounded-4">
            <Card.Header className="bg-success-subtle text-success-emphasis py-3 d-flex justify-content-between align-items-center">
                <h5 className="fw-bold mb-0">
                    <iconify-icon icon="solar:play-circle-bold" className="me-2"></iconify-icon>
                    Caisse Ouverte
                </h5>
                <Badge bg="success" pill>Session en cours</Badge>
            </Card.Header>
            <Card.Body className="p-4">
                <Row className="g-4 text-center">
                    <Col md={4}>
                        <Card className="bg-light border-0">
                            <Card.Body>
                                <h6 className="text-muted">Fond Initial</h6>
                                <h4 className="fw-bold">{(caisseStatut.fondInitial || 0).toLocaleString()} GNF</h4>
                            </Card.Body>
                        </Card>
                    </Col>
                    <Col md={4}>
                        <Card className="bg-light border-0">
                            <Card.Body>
                                <h6 className="text-muted">Ventes de la session</h6>
                                <h4 className="fw-bold text-primary">{(caisseStatut.session.totalVentes || 0).toLocaleString()} GNF</h4>
                                <small className="text-muted">{caisseStatut.session.nombreVentes} transaction(s)</small>
                            </Card.Body>
                        </Card>
                    </Col>
                    <Col md={4}>
                        <Card className="bg-light border-0">
                            <Card.Body>
                                <h6 className="text-muted">Dépenses de la session</h6>
                                <h4 className="fw-bold text-danger">{(caisseStatut.session.totalDepenses || 0).toLocaleString()} GNF</h4>
                                <small className="text-muted">{caisseStatut.session.nombreDepenses} dépense(s)</small>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
                <div className="d-grid mt-4">
                    <Button variant="danger" size="lg" onClick={() => setShowCloseModal(true)}>
                        <iconify-icon icon="solar:logout-3-bold" className="me-2"></iconify-icon>
                        Clôturer la Caisse et Générer le Rapport
                    </Button>
                </div>
            </Card.Body>
        </Card>
    );

    if (loading) return <div className="text-center p-5"><Spinner animation="border" /></div>;

    return (
        <div className="p-4">
            <h3 className="fw-bold mb-4">Gestion de la Caisse</h3>
            {success && <Alert variant="success">{success}</Alert>}
            {error && <Alert variant="danger">{error}</Alert>}

            <Tabs defaultActiveKey="caisse" id="caisse-tabs" className="mb-3">
                <Tab eventKey="caisse" title="Caisse">
                    <div className="mt-4">
                        {caisseStatut ? renderCaisseOuverte() : renderOpenCaisseForm()}
                    </div>
                </Tab>
                <Tab eventKey="depenses" title="Dépenses">
                    <DepensesTab />
                </Tab>
                <Tab eventKey="rapports" title="Mes Rapports">
                    <RapportsTab />
                </Tab>
            </Tabs>

            {/* Modale de clôture de caisse */}
            <Modal show={showCloseModal} onHide={() => setShowCloseModal(false)} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Clôturer la caisse</Modal.Title>
                </Modal.Header>
                <Form onSubmit={handleCloseCaisse}>
                    <Modal.Body>
                        <p>Veuillez compter le montant total présent physiquement dans votre caisse et le saisir ci-dessous.</p>
                        <Form.Group className="mb-3">
                            <Form.Label>Montant de clôture</Form.Label>
                            <InputGroup>
                                <Form.Control
                                    type="number"
                                    min="0"
                                    value={montantCloture}
                                    onChange={(e) => setMontantCloture(e.target.value)}
                                    required
                                    autoFocus
                                />
                                <InputGroup.Text>GNF</InputGroup.Text>
                            </InputGroup>
                        </Form.Group>
                        <Form.Group>
                            <Form.Label>Commentaires (Optionnel)</Form.Label>
                            <Form.Control
                                as="textarea"
                                rows={3}
                                value={commentaires}
                                onChange={(e) => setCommentaires(e.target.value)}
                                placeholder="Expliquez un éventuel écart, etc."
                            />
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowCloseModal(false)}>Annuler</Button>
                        <Button variant="danger" type="submit">Confirmer la Clôture</Button>
                    </Modal.Footer>
                </Form>
            </Modal>
        </div>
    );
};

// Sous-composant pour l'onglet Dépenses
const DepensesTab = () => {
    const [depenses, setDepenses] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        caisseAPI.getMesDepenses()
            .then(res => setDepenses(res.data))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, []);

    const getStatusBadge = (status) => {
        switch (status) {
            case 'APPROUVEE': return <Badge bg="success">Approuvée</Badge>;
            case 'REFUSEE': return <Badge bg="danger">Refusée</Badge>;
            default: return <Badge bg="warning">En attente</Badge>;
        }
    };

    return (
        <Card className="border-0 shadow-sm rounded-4 mt-4">
            <Card.Header>
                <h5 className="fw-bold mb-0">Mes Dépenses</h5>
            </Card.Header>
            <Card.Body>
                {/* TODO: Ajouter un formulaire de création de dépense ici */}
                <p className="text-muted">Le formulaire de création de dépense sera ajouté ici.</p>
                <Table striped hover responsive>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Motif</th>
                            <th>Montant</th>
                            <th>Statut</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="4" className="text-center"><Spinner size="sm" /></td></tr>
                        ) : depenses.length > 0 ? (
                            depenses.map(d => (
                                <tr key={d._id}>
                                    <td>{new Date(d.createdAt).toLocaleDateString()}</td>
                                    <td>{d.motif}</td>
                                    <td>{d.montant.toLocaleString()} GNF</td>
                                    <td>{getStatusBadge(d.statut)}</td>
                                </tr>
                            ))
                        ) : (
                            <tr><td colSpan="4" className="text-center text-muted">Aucune dépense enregistrée.</td></tr>
                        )}
                    </tbody>
                </Table>
            </Card.Body>
        </Card>
    );
};

// Sous-composant pour l'onglet Rapports
const RapportsTab = () => {
    const [rapports, setRapports] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        caisseAPI.getMesRapports()
            .then(res => setRapports(res.data))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, []);

    const getStatusBadge = (status) => {
        switch (status) {
            case 'VALIDE': return <Badge bg="success">Validé</Badge>;
            case 'REJETE': return <Badge bg="danger">Rejeté</Badge>;
            default: return <Badge bg="warning">En attente</Badge>;
        }
    };

    return (
        <Card className="border-0 shadow-sm rounded-4 mt-4">
            <Card.Header>
                <h5 className="fw-bold mb-0">Historique de mes Rapports de Caisse</h5>
            </Card.Header>
            <Card.Body>
                <Table striped hover responsive>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Total Ventes</th>
                            <th>Solde Théorique</th>
                            <th>Montant Clôturé</th>
                            <th>Écart</th>
                            <th>Statut</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="6" className="text-center"><Spinner size="sm" /></td></tr>
                        ) : rapports.length > 0 ? (
                            rapports.map(r => (
                                <tr key={r._id}>
                                    <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                                    <td>{r.totalVentes.toLocaleString()} GNF</td>
                                    <td>{r.soldeTheorique.toLocaleString()} GNF</td>
                                    <td>{r.montantCloture.toLocaleString()} GNF</td>
                                    <td>
                                        <Badge bg={r.ecart === 0 ? 'success' : 'danger'}>
                                            {r.ecart.toLocaleString()} GNF
                                        </Badge>
                                    </td>
                                    <td>{getStatusBadge(r.statut)}</td>
                                </tr>
                            ))
                        ) : (
                            <tr><td colSpan="6" className="text-center text-muted">Aucun rapport trouvé.</td></tr>
                        )}
                    </tbody>
                </Table>
            </Card.Body>
        </Card>
    );
};

export default CaisseView;