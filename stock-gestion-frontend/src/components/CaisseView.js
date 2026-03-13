/**
 * @file CaisseView.js
 * @description Ce composant gère l'ensemble de la logique de la caisse pour un gérant.
 * Il permet d'ouvrir la caisse avec un fond initial, de la clôturer en générant un rapport,
 * et de gérer les dépenses de la session.
 * Il est divisé en plusieurs onglets :
 * - Caisse : Pour l'ouverture/clôture.
 * - Dépenses : Pour enregistrer les dépenses et payer les commissions.
 * - Mes Rapports : Pour visualiser l'historique des rapports de caisse du gérant.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Form, Spinner, Alert, Row, Col, InputGroup, Modal, Tabs, Tab, Table, Badge } from 'react-bootstrap';
import { caisseAPI, clientAPI } from '../services/api';

// CSS pour l'animation de clignotement
const blinkAnimationStyle = `
.blink-animation {
    animation: blinker 1.5s linear infinite;
}

@keyframes blinker {
    50% {
        opacity: 0.3;
    }
}
`;

// Injecter le style dans le document
if (typeof document !== 'undefined') {
    const styleSheet = document.createElement('style');
    styleSheet.type = 'text/css';
    styleSheet.innerText = blinkAnimationStyle;
    document.head.appendChild(styleSheet);
}

const CaisseView = () => {
    const [caisseStatut, setCaisseStatut] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // State for forms
    const [fondInitial, setFondInitial] = useState('');
    const [montantCloture, setMontantCloture] = useState('');
    const [commentaires, setCommentaires] = useState('');
    const [ecart, setEcart] = useState(null);
    const [afficherJustification, setAfficherJustification] = useState(false);

    // State for modals
    const [showCloseModal, setShowCloseModal] = useState(false);
    
    // State for debouncing
    const [ecartTimeout, setEcartTimeout] = useState(null);
    
    // Nouvel état pour les statistiques de la session
    const [statistiquesSession, setStatistiquesSession] = useState(null);

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
                // Afficher le message d'erreur spécifique du backend s'il existe pour faciliter le débogage
                const msg = err.response?.data?.message || "Erreur lors de la récupération du statut de la caisse.";
                const detail = err.response?.data?.error ? ` (${err.response.data.error})` : '';
                setError(msg + detail);
            }
            setCaisseStatut(null); // Assure que l'état est bien null en cas d'erreur
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatut();
    }, [fetchStatut]);

    // Charger les statistiques de la session lorsque la modale s'ouvre
    useEffect(() => {
        if (showCloseModal && caisseStatut) {
            const loadStatistiquesSession = async () => {
                try {
                    const res = await caisseAPI.getStatistiquesSession();
                    setStatistiquesSession(res.data);
                } catch (err) {
                    console.error("Erreur lors du chargement des statistiques de la session:", err);
                    // En cas d'erreur, on utilise les données du statut existant
                    setStatistiquesSession(caisseStatut);
                }
            };
            loadStatistiquesSession();
        }
    }, [showCloseModal, caisseStatut]);


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

    const handleMontantClotureChange = (e) => {
        const value = e.target.value;
        setMontantCloture(value);
        
        // Annuler le timeout précédent
        if (ecartTimeout) {
            clearTimeout(ecartTimeout);
        }
        
        // Calculer l'écart avec un délai court pour l'affichage dynamique
        if (caisseStatut && value && value.trim() !== '') {
            const timeoutId = setTimeout(() => {
                const montantClotureNum = parseFloat(value);
                const totalDepenses = caisseStatut.session?.totalDepenses || 0;
                const totalDettes = caisseStatut.session?.totalDettes || 0;
                const soldeTheorique = (caisseStatut.fondInitial || 0) + (caisseStatut.session?.totalVentes || 0) - totalDettes - totalDepenses;
                const ecartCalcule = montantClotureNum - soldeTheorique;
                
                setEcart(ecartCalcule);
                setAfficherJustification(ecartCalcule !== 0);
            }, 500); 
            
            setEcartTimeout(timeoutId);
        }
    };

    const handleCloseCaisse = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        const montantClotureNum = parseFloat(montantCloture);
        if (isNaN(montantClotureNum)) {
             setError("Veuillez saisir un montant valide.");
             return;
        }

        // Recalculer l'écart immédiatement pour validation (évite les problèmes de timeout)
        const totalDepenses = caisseStatut.session?.totalDepenses || 0;
        const totalDettes = caisseStatut.session?.totalDettes || 0;
        const soldeTheorique = (caisseStatut.fondInitial || 0) + (caisseStatut.session?.totalVentes || 0) - totalDettes - totalDepenses;
        const ecartCalcule = montantClotureNum - soldeTheorique;

        // Vérifier si un écart existe et si la justification est obligatoire
        if (ecartCalcule !== 0 && !commentaires.trim()) {
            setEcart(ecartCalcule);
            setAfficherJustification(true);
            setError("Veuillez justifier l'écart détecté avant de valider la clôture.");
            return;
        }

        try {
            await caisseAPI.fermer({ 
                montantCloture: montantClotureNum, commentairesGérant: commentaires 
            });
            setSuccess("Caisse fermée et rapport généré avec succès.");
            setMontantCloture('');
            setCommentaires('');
            setEcart(null);
            setAfficherJustification(false);
            setShowCloseModal(false);
            setCaisseStatut(null); // Réinitialiser le statut pour afficher le formulaire d'ouverture
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
                    <DepensesTab onExpenseCreated={fetchStatut} key={caisseStatut?._id || 'no-session'} caisseStatut={caisseStatut} />
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
                        <Row className="mb-3">
                            <Col md={6}>
                                <Card className="bg-light border-0">
                                    <Card.Body>
                                        <h6 className="text-muted">Fond Initial</h6>
                                        <h5 className="fw-bold">{(caisseStatut?.fondInitial || 0).toLocaleString()} GNF</h5>
                                    </Card.Body>
                                </Card>
                            </Col>
                            <Col md={6}>
                                <Card className="bg-light border-0">
                                    <Card.Body>
                                        <h6 className="text-muted">Ventes de la session</h6>
                                        <h5 className="fw-bold text-primary">{(caisseStatut?.session?.totalVentes || 0).toLocaleString()} GNF</h5>
                                    </Card.Body>
                                </Card>
                            </Col>
                        </Row>
                        <Form.Group className="mb-3">
                            <Form.Label>Montant de clôture</Form.Label>
                            <InputGroup>
                                <Form.Control
                                    type="number"
                                    min="0"
                                    value={montantCloture}
                                    onChange={handleMontantClotureChange}
                                    required
                                    autoFocus
                                />
                                <InputGroup.Text>GNF</InputGroup.Text>
                            </InputGroup>
                        </Form.Group>
                        
                        {/* Résumé des ventes du jour */}
                        <Table bordered className="mb-3 small">
                            <tbody>
                                <tr>
                                    <td className="text-muted">Fond initial</td>
                                    <td className="text-end fw-bold">
                                        {(statistiquesSession?.fondInitial || caisseStatut?.fondInitial || 0).toLocaleString()} GNF
                                    </td>
                                </tr>
                                <tr>
                                    <td className="text-muted">Total ventes session</td>
                                    <td className="text-end fw-bold text-success">
                                        + {(statistiquesSession?.session?.totalVentes || caisseStatut?.session?.totalVentes || 0).toLocaleString()} GNF
                                    </td>
                                </tr>
                                <tr>
                                    <td className="text-muted">Dettes accordées (Crédit)</td>
                                    <td className="text-end fw-bold text-warning">
                                        - {(statistiquesSession?.session?.totalDettes || 0).toLocaleString()} GNF
                                    </td>
                                </tr>
                                <tr>
                                    <td className="text-muted">Total Dépenses</td>
                                    <td className="text-end fw-bold text-danger">
                                        - {(statistiquesSession?.session?.totalDepenses || 0).toLocaleString()} GNF
                                    </td>
                                </tr>
                                <tr style={{border: '2px solid var(--bs-danger)'}}>
                                    <td className="fw-bold text-danger">Solde théorique attendu</td>
                                    <td className="text-end fw-bold fs-5 text-danger">
                                        {((statistiquesSession?.fondInitial || caisseStatut?.fondInitial || 0) + (statistiquesSession?.session?.totalVentes || caisseStatut?.session?.totalVentes || 0) - (statistiquesSession?.session?.totalDettes || 0) - (statistiquesSession?.session?.totalDepenses || 0)).toLocaleString()} GNF
                                    </td>
                                </tr>
                            </tbody>
                        </Table>

                        {afficherJustification && (
                            <Alert variant="danger" className="blink-animation">
                                <strong>Écart détecté :</strong> {ecart.toLocaleString()} GNF. Veuillez justifier cet écart dans les commentaires ci-dessous.
                            </Alert>
                        )}
                        {afficherJustification && (
                            <Form.Group>
                                <Form.Label 
                                    className="blink-animation text-danger fw-bold"
                                    style={{ 
                                        animation: 'blinker 1.5s linear infinite',
                                        color: '#dc3545',
                                        fontWeight: 'bold'
                                    }}
                                >
                                    Commentaires (Obligatoire)
                                </Form.Label>
                                <Form.Control
                                    as="textarea"
                                    rows={3}
                                    value={commentaires}
                                    onChange={(e) => setCommentaires(e.target.value)}
                                    placeholder="Justifiez l'écart détecté..."
                                    className="border-danger"
                                    style={{ 
                                        borderColor: '#dc3545',
                                        animation: 'blinker 1.5s linear infinite'
                                    }}
                                />
                            </Form.Group>
                        )}
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
const DepensesTab = ({ onExpenseCreated, caisseStatut }) => {
    const [depenses, setDepenses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false); // Pour la création de dépense simple
    const [showCommissionModal, setShowCommissionModal] = useState(false); // Pour le paiement de commission
    const [newExpense, setNewExpense] = useState({ montant: '', motif: '' });
    const [submitLoading, setSubmitLoading] = useState(false);
    const [error, setError] = useState('');
    
    // États pour le paiement de commission
    const [workers, setWorkers] = useState([]);
    const [loadingWorkers, setLoadingWorkers] = useState(false);
    const [selectedWorkerId, setSelectedWorkerId] = useState('');
    const [paymentAmount, setPaymentAmount] = useState('');

    const [commissionSubmitLoading, setCommissionSubmitLoading] = useState(false);
    const [commissionError, setCommissionError] = useState('');
    
    const fetchDepenses = useCallback(() => {
        // Si aucune session de caisse n'est ouverte, on n'affiche aucune dépense.
        if (!caisseStatut) {
            setDepenses([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        caisseAPI.getMesDepenses()
            .then(res => {
                // On filtre les dépenses pour ne garder que celles de la session de caisse actuelle.
                const sessionDepenses = res.data.filter(d => d.ouvertureCaisse === caisseStatut._id);
                setDepenses(sessionDepenses);
            })
            .catch(err => {
                console.error(err);
                setDepenses([]); // Vider en cas d'erreur pour éviter d'afficher de mauvaises données.
            })
            .finally(() => setLoading(false));
    }, [caisseStatut]);

    useEffect(() => {
        fetchDepenses();
    }, [fetchDepenses]);

    // Charger les ouvriers quand la modale de commission s'ouvre
    useEffect(() => {
        if (showCommissionModal) {
            setLoadingWorkers(true);
            clientAPI.getAll()
                .then(res => {
                    const workersWithCommission = res.data.filter(c => c.type === 'Ouvrier' && c.commission > 0);
                    setWorkers(workersWithCommission);
                })
                .catch(err => setCommissionError("Erreur chargement des ouvriers."))
                .finally(() => setLoadingWorkers(false));
        }
    }, [showCommissionModal]);

    const handleOpenCreateModal = () => {
        setNewExpense({ montant: '', motif: '' });
        setError('');
        setShowModal(true);
    };

    const handleOpenCommissionModal = () => {
        setSelectedWorkerId('');
        setPaymentAmount('');
        setCommissionError('');
        setShowCommissionModal(true);
    };

    const handleCreateExpense = async (e) => {
        e.preventDefault();
        setSubmitLoading(true);
        setError('');
        try {
            await caisseAPI.creerDepense(newExpense);
            fetchDepenses(); // Rafraîchir la liste
            setNewExpense({ montant: '', motif: '' });
            setShowModal(false);
            if (onExpenseCreated) onExpenseCreated(); // Rafraîchir les stats globales
        } catch (err) {
            setError(err.response?.data?.message || "Erreur lors de l'opération.");
        } finally {
            setSubmitLoading(false);
        }
    };

    const handlePayCommission = async (e) => {
        e.preventDefault();
        setCommissionSubmitLoading(true);
        setCommissionError('');
        const selectedWorker = workers.find(w => w._id === selectedWorkerId);
        if (!selectedWorker) {
            setCommissionError("Veuillez sélectionner un ouvrier.");
            setCommissionSubmitLoading(false);
            return;
        }

        const amountToPay = parseFloat(paymentAmount);
        if (isNaN(amountToPay) || amountToPay <= 0) {
            setCommissionError("Le montant à payer est invalide.");
            setCommissionSubmitLoading(false);
            return;
        }

        if (amountToPay > selectedWorker.commission) {
            setCommissionError("Le montant à payer ne peut pas dépasser la commission due.");
            setCommissionSubmitLoading(false);
            return;
        }

        try {
            // 1. Créer la dépense
            await caisseAPI.creerDepense({
                montant: amountToPay,
                motif: `Paiement commission: ${selectedWorker.nom}`
            });

            // 2. Mettre à jour la commission de l'ouvrier
            const newCommission = selectedWorker.commission - amountToPay;
            await clientAPI.update(selectedWorker._id, { commission: newCommission });

            // 3. Rafraîchir
            fetchDepenses();
            setShowCommissionModal(false);
            if (onExpenseCreated) onExpenseCreated();

        } catch (err) {
            setCommissionError(err.response?.data?.message || "Erreur lors du paiement de la commission.");
        } finally {
            setCommissionSubmitLoading(false);
        }
    };

    const selectedWorkerForInfo = workers.find(w => w._id === selectedWorkerId);

    return (
        <Card className="border-0 shadow-sm rounded-4 mt-4">
            <Card.Header className="bg-white py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
                <h5 className="fw-bold mb-0">Mes Dépenses</h5>
                <div className="d-flex gap-2">
                    <Button variant="info" size="sm" onClick={handleOpenCommissionModal} className="text-white">
                        <iconify-icon icon="solar:money-bag-bold" className="me-2 align-middle"></iconify-icon>
                        Payer Commission
                    </Button>
                    <Button variant="primary" size="sm" onClick={handleOpenCreateModal}>
                        <iconify-icon icon="solar:add-circle-bold" className="me-2 align-middle"></iconify-icon>
                        Nouvelle Dépense
                    </Button>
                </div>
            </Card.Header>
            <Card.Body>
                <Table striped hover responsive className="align-middle">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Motif</th>
                            <th className="text-end">Montant</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="3" className="text-center"><Spinner size="sm" /></td></tr>
                        ) : depenses.length > 0 ? (
                            depenses.map(d => (
                                <tr key={d._id}>
                                    <td>{new Date(d.createdAt).toLocaleDateString()}</td>
                                    <td>{d.motif}</td>
                                    <td className="text-end fw-bold">{(d.montant || 0).toLocaleString()} GNF</td>
                                </tr>
                            ))
                        ) : (
                            <tr><td colSpan="3" className="text-center text-muted">Aucune dépense enregistrée pour cette session.</td></tr>
                        )}
                    </tbody>
                </Table>
            </Card.Body>

            {/* Modale Création Dépense */}
            <Modal show={showModal} onHide={() => setShowModal(false)} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Déclarer une dépense</Modal.Title>
                </Modal.Header>
                <Form onSubmit={handleCreateExpense}>
                    <Modal.Body>
                        {error && <Alert variant="danger">{error}</Alert>}
                        <Form.Group className="mb-3">
                            <Form.Label>Motif</Form.Label>
                            <Form.Control 
                                type="text" 
                                required 
                                value={newExpense.motif} 
                                onChange={e => setNewExpense({...newExpense, motif: e.target.value})} 
                                placeholder="Ex: Transport, Achat petit matériel..."
                            />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>Montant</Form.Label>
                            <InputGroup>
                                <Form.Control 
                                    type="number" 
                                    required 
                                    min="1"
                                    value={newExpense.montant} 
                                    onChange={e => setNewExpense({...newExpense, montant: e.target.value})} 
                                />
                                <InputGroup.Text>GNF</InputGroup.Text>
                            </InputGroup>
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowModal(false)}>Annuler</Button>
                        <Button variant="primary" type="submit" disabled={submitLoading}>
                            {submitLoading ? <Spinner size="sm" /> : 'Enregistrer'}
                        </Button>
                    </Modal.Footer>
                </Form>
            </Modal>

            {/* Modale Paiement Commission */}
            <Modal show={showCommissionModal} onHide={() => setShowCommissionModal(false)} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Payer une Commission</Modal.Title>
                </Modal.Header>
                <Form onSubmit={handlePayCommission}>
                    <Modal.Body>
                        {commissionError && <Alert variant="danger">{commissionError}</Alert>}
                        {loadingWorkers ? <div className="text-center"><Spinner /></div> : (
                            <>
                                <Form.Group className="mb-3">
                                    <Form.Label>Ouvrier</Form.Label>
                                    <Form.Select
                                        value={selectedWorkerId}
                                        onChange={e => setSelectedWorkerId(e.target.value)}
                                        required
                                    >
                                        <option value="">Sélectionner un ouvrier...</option>
                                        {workers.map(w => (
                                            <option key={w._id} value={w._id}>
                                                {w.nom} (Due: {w.commission.toLocaleString()} GNF)
                                            </option>
                                        ))}
                                    </Form.Select>
                                    {workers.length === 0 && <Form.Text className="text-muted">Aucun ouvrier avec une commission en attente.</Form.Text>}
                                </Form.Group>

                                {selectedWorkerForInfo && (
                                    <Form.Group className="mb-3">
                                        <Form.Label>Montant à Payer</Form.Label>
                                        <InputGroup>
                                            <Form.Control
                                                type="number"
                                                required
                                                min="1"
                                                max={selectedWorkerForInfo.commission}
                                                value={paymentAmount}
                                                onChange={e => setPaymentAmount(e.target.value)}
                                                placeholder={`Max: ${selectedWorkerForInfo.commission.toLocaleString()}`}
                                            />
                                            <InputGroup.Text>GNF</InputGroup.Text>
                                        </InputGroup>
                                    </Form.Group>
                                )}
                            </>
                        )}
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowCommissionModal(false)}>Annuler</Button>
                        <Button variant="primary" type="submit" disabled={commissionSubmitLoading || !selectedWorkerId}>
                            {commissionSubmitLoading ? <Spinner size="sm" /> : 'Payer et Enregistrer'}
                        </Button>
                    </Modal.Footer>
                </Form>
            </Modal>
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