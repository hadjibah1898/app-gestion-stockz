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
import { useLocation } from 'react-router-dom';
import { caisseAPI, clientAPI } from '../services/api';
import jsPDF from 'jspdf';

import autoTable from 'jspdf-autotable';
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
    const location = useLocation(); // Pour détecter si on vient du dashboard avec une action
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

    // Nouveaux états pour les animations de chargement des actions
    const [openingCaisse, setOpeningCaisse] = useState(false);
    const [closingCaisse, setClosingCaisse] = useState(false);
    const [isCorrection, setIsCorrection] = useState(false); // État pour savoir si on est en mode correction
    const [currentRapportForCorrection, setCurrentRapportForCorrection] = useState(null); // Stocker le rapport en cours de correction

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
                // Gestion du cas où un rapport a été rejeté et nécessite une action
                if (err.response?.data?.statut === 'REJETE') {
                    setIsCorrection(true);
                    setError(
                        <div>
                            <strong>Rapport Rejeté :</strong> {err.response.data.message}
                            <br/>
                            <Button variant="outline-danger" size="sm" className="mt-2" onClick={() => setShowCloseModal(true)}>
                                Corriger et Relancer la clôture
                            </Button>
                        </div>
                    );
                } else {
                    setIsCorrection(false);
                }
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

    // Effet pour gérer l'ouverture automatique de la modale de clôture depuis le Dashboard
    useEffect(() => {
        if (location.state?.openCloseModal && caisseStatut && !loading) {
            setShowCloseModal(true);
            // Nettoyer l'état pour éviter la réouverture si on rafraîchit la page
            window.history.replaceState({}, document.title);
        }
    }, [location.state, caisseStatut, loading]);

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

    const handleStartCorrection = (rapport) => {
        setMontantCloture(rapport.montantCloture);
        setCommentaires(rapport.commentairesGérant || '');
        setCurrentRapportForCorrection(rapport);
        setIsCorrection(true);
        setShowCloseModal(true);
    };

    const handleOpenCaisse = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setOpeningCaisse(true);
        try {
            await caisseAPI.ouvrir({ fondInitial: parseFloat(fondInitial) });
            setSuccess("Caisse ouverte avec succès !");
            setFondInitial('');
            fetchStatut(); // Recharger le statut
        } catch (err) {
            setError(err.response?.data?.message || "Erreur lors de l'ouverture de la caisse.");
        } finally {
            setOpeningCaisse(false);
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
                let soldeTheorique = 0;

                if (isCorrection && currentRapportForCorrection) {
                    soldeTheorique = currentRapportForCorrection.soldeTheorique;
                } else if (caisseStatut) {
                    const totalDepenses = caisseStatut.session?.totalDepenses || 0;
                    const totalDettes = caisseStatut.session?.totalDettes || 0;
                    // LOGIQUE COMPTABLE : Recouvrements exclus
                    soldeTheorique = (caisseStatut.fondInitial || 0) + (caisseStatut.session?.totalVentes || 0) - totalDettes - totalDepenses;
                }
                
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
        setClosingCaisse(true);

        const montantClotureNum = parseFloat(montantCloture);
        if (isNaN(montantClotureNum)) {
             setError("Veuillez saisir un montant valide.");
             setClosingCaisse(false);
             return;
        }

        // Recalculer l'écart immédiatement pour validation (évite les problèmes de timeout)
        let soldeTheorique = 0;
        if (isCorrection && currentRapportForCorrection) {
            soldeTheorique = currentRapportForCorrection.soldeTheorique;
        } else if (caisseStatut) {
            const totalDepenses = caisseStatut.session?.totalDepenses || 0;
            const totalDettes = caisseStatut.session?.totalDettes || 0;
            soldeTheorique = (caisseStatut.fondInitial || 0) + (caisseStatut.session?.totalVentes || 0) - totalDettes - totalDepenses;
        }
        
        const ecartCalcule = montantClotureNum - soldeTheorique;

        // Vérifier si un écart existe et si la justification est obligatoire
        if (ecartCalcule !== 0 && !commentaires.trim()) {
            setEcart(ecartCalcule);
            setAfficherJustification(true);
            setError("Veuillez justifier l'écart détecté avant de valider la clôture.");
            setClosingCaisse(false);
            return;
        }

        try {
            if (isCorrection) {
                // En mode correction, on appelle la route spécifique
                await caisseAPI.corrigerRapport({
                    montantCloture: montantClotureNum,
                    commentairesGérant: commentaires
                });
                setSuccess("Rapport corrigé et renvoyé pour validation.");
            } else {
                // Mode fermeture standard
                await caisseAPI.fermer({ 
                    montantCloture: montantClotureNum, 
                    // Correction : Assurer que le commentaire est envoyé même s'il n'y a pas d'écart
                    // Le backend attend probablement 'commentairesGérant' ou 'commentaire'
                    commentairesGérant: commentaires,
                    commentaires: commentaires, // Envoi sous les deux clés pour compatibilité
                    // Si c'est une relance après rejet, on peut avoir besoin de l'ID du rapport précédent, 
                    // mais généralement 'fermer' crée un nouveau rapport ou met à jour l'actuel.
                });
                setSuccess("Caisse fermée et rapport généré avec succès.");
            }
            setMontantCloture('');
            setCommentaires('');
            setEcart(null);
            setAfficherJustification(false);
            setShowCloseModal(false);
            setCurrentRapportForCorrection(null);
            setCaisseStatut(null); // Réinitialiser le statut pour afficher le formulaire d'ouverture
            fetchStatut(); // Recharger le statut
        } catch (err) {
            setError(err.response?.data?.message || "Erreur lors de l'opération.");
        } finally {
            setClosingCaisse(false);
        }
    };

    // Helper pour calculer les valeurs à afficher dans la modale (Session active OU Correction)
    const getDisplayValues = () => {
        if (isCorrection && currentRapportForCorrection) {
            // Cas Correction : On utilise les données figées du rapport
            // Dettes = (Fond + Ventes - Dépenses) - SoldeThéorique
            const fondInitial = currentRapportForCorrection.fondInitial || 0;
            const totalVentes = currentRapportForCorrection.totalVentes || 0;
            const totalDepenses = currentRapportForCorrection.totalDepensesApprouvees || 0;
            const soldeTheorique = currentRapportForCorrection.soldeTheorique || 0;
            // On recalcule le montant des dettes par déduction pour l'affichage
            const totalDettes = (fondInitial + totalVentes - totalDepenses) - soldeTheorique;

            return { fondInitial, totalVentes, totalDettes, totalDepenses, soldeTheorique };
        } else {
            // Cas Clôture Normale : On utilise les stats de la session en cours
            const source = statistiquesSession || caisseStatut;
            const fondInitial = source?.fondInitial || 0;
            const totalVentes = source?.session?.totalVentes || 0;
            const totalDettes = source?.session?.totalDettes || 0;
            const totalDepenses = source?.session?.totalDepenses || 0;
            const soldeTheorique = (fondInitial + totalVentes - totalDettes) - totalDepenses;

            return { fondInitial, totalVentes, totalDettes, totalDepenses, soldeTheorique };
        }
    };

    const displayValues = getDisplayValues();

    const renderOpenCaisseForm = () => (
        <Card className="border-0 shadow-sm rounded-4">
            <Card.Body className="p-4">
                <div className="text-center mb-4">
                    <iconify-icon icon="solar:lock-keyhole-minimalistic-bold-duotone" style={{ fontSize: '64px' }} className="text-danger"></iconify-icon>
                    <h4 className="fw-bold mt-3">Caisse Fermée</h4>
                    {error && typeof error !== 'string' && ( // Si l'erreur est un objet (notre bouton de relance)
                        <Alert variant="danger" className="mt-3">
                            {error}
                        </Alert>
                    )}
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
                        <Button variant="success" type="submit" size="lg" disabled={openingCaisse}>
                            {openingCaisse ? (
                                <>
                                    <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" />
                                    <span className="ms-2">Ouverture...</span>
                                </>
                            ) : (
                                <><iconify-icon icon="solar:key-bold" className="me-2"></iconify-icon> Ouvrir la Caisse</>
                            )}
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
                    <RapportsTab onCorrect={handleStartCorrection} />
                </Tab>
            </Tabs>

            {/* Modale de clôture de caisse */}
            <Modal show={showCloseModal} onHide={() => setShowCloseModal(false)} centered>
                <Modal.Header closeButton>
                    <Modal.Title className="d-flex align-items-center">
                        Clôturer la caisse
                        {isCorrection && <Badge bg="warning" text="dark" className="ms-2 fs-6">Mode Correction</Badge>}
                    </Modal.Title>
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
                        <Card className="mb-3 bg-light border-2">
                            <Card.Body className="p-3">
                                <div className="d-flex justify-content-between mb-2">
                                    <span className="text-muted">Fond initial</span>
                                    <span className="fw-bold">{displayValues.fondInitial.toLocaleString()} GNF</span>
                                </div>
                                <div className="d-flex justify-content-between mb-2">
                                    <span className="text-muted">Total ventes session</span>
                                    <span className="fw-bold text-success">+ {displayValues.totalVentes.toLocaleString()} GNF</span>
                                </div>
                                <div className="d-flex justify-content-between mb-2">
                                    <span className="text-muted">Dettes accordées (Crédit)</span>
                                    <span className="fw-bold text-warning">- {displayValues.totalDettes.toLocaleString()} GNF</span>
                                </div>
                                <div className="d-flex justify-content-between">
                                    <span className="text-muted">Total Dépenses</span>
                                    <span className="fw-bold text-danger">- {displayValues.totalDepenses.toLocaleString()} GNF</span>
                                </div>
                                <hr/>
                                <div className="d-flex justify-content-between align-items-center">
                                    <span className="fw-bold text-danger">Total Espèces Attendu</span>
                                    <span className="fw-bold fs-5 text-danger">{displayValues.soldeTheorique.toLocaleString()} GNF</span>
                                </div>
                            </Card.Body>
                        </Card>

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
                        <Button variant="secondary" onClick={() => setShowCloseModal(false)} disabled={closingCaisse}>Annuler</Button>
                        <Button variant="danger" type="submit" disabled={closingCaisse}>
                            {closingCaisse ? (
                                <>
                                    <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" />
                                    <span className="ms-2">Clôture en cours...</span>
                                </>
                            ) : 'Confirmer la Clôture'}
                        </Button>
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
    
    // Calcul du cash disponible réel (Fond + Ventes Cash - Dépenses déjà faites)
    const availableCash = caisseStatut 
        ? (caisseStatut.fondInitial + (caisseStatut.session?.totalEncaisse || 0) - (caisseStatut.session?.totalDepenses || 0))
        : 0;

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

        if (parseFloat(newExpense.montant) > availableCash) {
            setError(`Fonds insuffisants en caisse. Disponible: ${availableCash.toLocaleString()} GNF`);
            setSubmitLoading(false);
            return;
        }

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

        if (parseFloat(paymentAmount) > availableCash) {
            setCommissionError(`Fonds insuffisants en caisse. Disponible: ${availableCash.toLocaleString()} GNF`);
            setCommissionSubmitLoading(false);
            return;
        }

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
            // Utilisation du service clientAPI déjà configuré avec l'URL de production
            await clientAPI.payerCommission({
                workerId: selectedWorker._id,
                montant: amountToPay,
            });

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
                        <Button variant="info" size="sm" onClick={handleOpenCommissionModal} className="text-white" disabled={!caisseStatut}>
                        <iconify-icon icon="solar:money-bag-bold" className="me-2 align-middle"></iconify-icon>
                        Payer Commission
                    </Button>
                        <Button variant="primary" size="sm" onClick={handleOpenCreateModal} disabled={!caisseStatut}>
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
                                    isInvalid={parseFloat(newExpense.montant) > availableCash}
                                />
                                <InputGroup.Text>GNF</InputGroup.Text>
                                <Form.Control.Feedback type="invalid">
                                    Le montant dépasse le cash disponible ({availableCash.toLocaleString()} GNF).
                                </Form.Control.Feedback>
                            </InputGroup>
                            <Form.Text className="text-muted">Cash disponible : <span className="fw-bold text-success">{availableCash.toLocaleString()} GNF</span></Form.Text>
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
                                                isInvalid={parseFloat(paymentAmount) > availableCash}
                                                placeholder={`Max: ${selectedWorkerForInfo.commission.toLocaleString()}`}
                                            />
                                            <InputGroup.Text>GNF</InputGroup.Text>
                                            <Form.Control.Feedback type="invalid">
                                                Le montant dépasse le cash disponible ({availableCash.toLocaleString()} GNF).
                                            </Form.Control.Feedback>
                                        </InputGroup>
                                        <Form.Text className="text-muted">Cash disponible : <span className="fw-bold text-success">{availableCash.toLocaleString()} GNF</span></Form.Text>
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
const RapportsTab = ({ onCorrect }) => {
    const [rapports, setRapports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedRapport, setSelectedRapport] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [detailedReportData, setDetailedReportData] = useState(null); // Nouvel état pour les détails du rapport

    useEffect(() => {
        caisseAPI.getMesRapports()
            .then(res => setRapports(res.data))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, []);

    // Effet pour charger les détails du rapport lorsque la modale s'ouvre ou que le rapport sélectionné change
    useEffect(() => {
        const fetchDetailedReport = async () => {
            if (showDetailsModal && selectedRapport) {
                try {
                    const res = await caisseAPI.getReportDetails(selectedRapport._id);
                    setDetailedReportData(res.data);
                } catch (err) {
                    console.error("Erreur lors du chargement des détails du rapport:", err);
                }
            }
        };
        fetchDetailedReport();
    }, [showDetailsModal, selectedRapport]);

    const getStatusBadge = (status) => {
        switch (status) {
            case 'VALIDE': return <Badge bg="success">Validé</Badge>;
            case 'REJETE': return <Badge bg="danger">Rejeté</Badge>;
            default: return <Badge bg="warning">En attente</Badge>;
        }
    };

    const exportToPDF = () => {
        const doc = new jsPDF();
        
        // En-tête du document
        doc.setFontSize(18);
        doc.text("Historique des Rapports de Caisse", 14, 20);
        
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Généré le : ${new Date().toLocaleString('fr-FR')}`, 14, 28);
        
        // En-têtes du tableau
        let y = 40;
        doc.setFontSize(10);
        doc.setTextColor(0);
        doc.setFont("helvetica", "bold");
        
        doc.text("Date", 14, y);
        doc.text("Ventes", 40, y);
        doc.text("Théorique", 75, y);
        doc.text("Clôture", 110, y);
        doc.text("Écart", 145, y);
        doc.text("Statut", 175, y);
        
        doc.line(14, y + 2, 196, y + 2);
        y += 10;
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);

        rapports.forEach(r => {
            // Saut de page si nécessaire
            if (y > 280) {
                doc.addPage();
                y = 20;
            }
            
            const date = new Date(r.createdAt).toLocaleDateString('fr-FR');
            const ventes = (r.totalVentes || 0).toLocaleString('fr-FR').replace(/[\u00a0\u202f]/g, ' ');
            const theo = (r.soldeTheorique || 0).toLocaleString('fr-FR').replace(/[\u00a0\u202f]/g, ' ');
            const cloture = (r.montantCloture || 0).toLocaleString('fr-FR').replace(/[\u00a0\u202f]/g, ' ');
            const ecart = (r.ecart || 0).toLocaleString('fr-FR').replace(/[\u00a0\u202f]/g, ' ');
            const statut = r.statut === 'VALIDE' ? 'Validé' : (r.statut === 'REJETE' ? 'Rejeté' : 'En attente');
            
            doc.text(date, 14, y);
            doc.text(ventes, 40, y);
            doc.text(theo, 75, y);
            doc.text(cloture, 110, y);
            doc.text(ecart, 145, y);
            doc.text(statut, 175, y);
            
            y += 8;
        });
        
        doc.save(`rapports_caisse_${new Date().toISOString().slice(0,10)}.pdf`);
    };

    // Nouvelle fonction pour exporter le rapport détaillé en PDF
    const generateDetailedReportPDF = () => {
        if (!detailedReportData) return;

        const { rapport, ventes, depenses } = detailedReportData;
        const doc = new jsPDF();
        let y = 10;

        // Helper pour formater la monnaie
        const formatCurrency = (value) => (value || 0).toLocaleString('fr-FR') + ' GNF';

        // En-tête
        doc.setFontSize(18);
        doc.text(`Rapport de Caisse Détaillé - ${rapport.boutique.nom}`, 14, y);
        y += 7;
        doc.setFontSize(12);
        doc.text(`Gérant: ${rapport.gerant.nom}`, 14, y);
        y += 5;
        doc.text(`Date du rapport: ${new Date(rapport.createdAt).toLocaleDateString('fr-FR')}`, 14, y);
        y += 10;

        // Résumé du Rapport
        doc.setFontSize(14);
        doc.text("Résumé du Rapport", 14, y);
        y += 5;
        autoTable(doc, {
            startY: y,
            head: [['Description', 'Montant']],
            body: [
                ['Fond Initial', formatCurrency(rapport.fondInitial)],
                ['Total Ventes', formatCurrency(rapport.totalVentes)],
                ['Total Dépenses Approuvées', formatCurrency(rapport.totalDepensesApprouvees)],
                ['Solde Théorique', formatCurrency(rapport.soldeTheorique)],
                ['Montant Clôturé', formatCurrency(rapport.montantCloture)],
                ['Écart', formatCurrency(rapport.ecart)],
                ['Statut', rapport.statut],
                ['Commentaires Gérant', rapport.commentairesGérant || 'N/A'],
                ['Commentaires Admin', rapport.commentairesAdmin || 'N/A']
            ],
            theme: 'grid',
            styles: { fontSize: 10, cellPadding: 2 },
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
            columnStyles: { 1: { halign: 'right' } }
        });
        y = doc.lastAutoTable.finalY + 10;

        // Ventes
        if (ventes && ventes.length > 0) {
            if (y > doc.internal.pageSize.height - 40) { // Vérifier le saut de page
                doc.addPage();
                y = 10;
            }
            doc.setFontSize(14);
            doc.text("Détail des Ventes", 14, y);
            y += 5;
            autoTable(doc, {
                startY: y,
                head: [['Article', 'Code', 'Quantité', 'Prix Unitaire', 'Prix Total']],
                body: ventes.map(v => [
                    v.article?.nom || 'N/A',
                    v.article?.code || 'N/A',
                    v.quantite,
                    formatCurrency(v.prixTotal / v.quantite),
                    formatCurrency(v.prixTotal)
                ]),
                theme: 'striped',
                styles: { fontSize: 9, cellPadding: 2 },
                headStyles: { fillColor: [60, 179, 113], textColor: 255 },
                columnStyles: {
                    2: { halign: 'center' },
                    3: { halign: 'right' },
                    4: { halign: 'right' }
                }
            });
            y = doc.lastAutoTable.finalY + 10;
        }

        // Dépenses
        if (depenses && depenses.length > 0) {
            if (y > doc.internal.pageSize.height - 40) { // Vérifier le saut de page
                doc.addPage();
                y = 10;
            }
            doc.setFontSize(14);
            doc.text("Détail des Dépenses", 14, y);
            y += 5;
            autoTable(doc, {
                startY: y,
                head: [['Motif', 'Montant', 'Date']],
                body: depenses.map(d => [d.motif, formatCurrency(d.montant), new Date(d.createdAt).toLocaleDateString('fr-FR')]),
                theme: 'striped',
                styles: { fontSize: 9, cellPadding: 2 },
                headStyles: { fillColor: [220, 53, 69], textColor: 255 },
                columnStyles: { 1: { halign: 'right' }, 2: { halign: 'center' } }
            });
        }
        doc.save(`rapport_caisse_detaille_${rapport._id}.pdf`);
    };

    return (
        <Card className="border-0 shadow-sm rounded-4 mt-4">
            <Card.Header className="d-flex justify-content-between align-items-center">
                <h5 className="fw-bold mb-0">Historique de mes Rapports de Caisse</h5>
                <Button variant="outline-danger" size="sm" onClick={exportToPDF} disabled={loading || rapports.length === 0}>
                    <iconify-icon icon="solar:file-pdf-bold" className="me-2"></iconify-icon>
                    Exporter PDF
                </Button>
            </Card.Header>
            <Card.Body>
                <Table striped hover responsive>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Total Ventes</th>
                            <th>Dettes accordées</th>
                            <th>Solde EXACT</th>
                            <th>Montant Clôturé</th>
                            <th>Écart</th>
                            <th>Statut</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="8" className="text-center"><Spinner size="sm" /></td></tr>
                        ) : rapports.length > 0 ? (
                            rapports.map(r => (
                                <tr key={r._id}>
                                    <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                                    <td>{r.totalVentes.toLocaleString()} GNF</td>
                                    <td>{(r.totalDettes || 0).toLocaleString()} GNF</td>
                                    <td>{r.soldeTheorique.toLocaleString()} GNF</td>
                                    <td>{r.montantCloture.toLocaleString()} GNF</td>
                                    <td>
                                        <Badge bg={r.ecart === 0 ? 'success' : 'danger'}>
                                            {r.ecart.toLocaleString()} GNF
                                        </Badge>
                                    </td>
                                    <td>{getStatusBadge(r.statut)}</td>
                                    <td>
                                        <Button 
                                            variant="outline-primary" 
                                            size="sm" 
                                            onClick={() => { setSelectedRapport(r); setShowDetailsModal(true); }}
                                            title="Voir les détails et échanges"
                                        >
                                            <iconify-icon icon="solar:chat-line-bold-duotone" className="me-1"></iconify-icon>
                                            Détails
                                            {r.commentairesAdmin && <span className="position-absolute translate-middle p-1 bg-danger border border-light rounded-circle" style={{fontSize: '0.5rem'}}></span>}
                                        </Button>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr><td colSpan="8" className="text-center text-muted">Aucun rapport trouvé.</td></tr>
                        )}
                    </tbody>
                </Table>
            </Card.Body>

            {/* Modale de Détails et Échanges */}
            <Modal show={showDetailsModal} onHide={() => setShowDetailsModal(false)} centered size="lg">
                <Modal.Header closeButton>
                    <Modal.Title>Détails du Rapport & Échanges</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {selectedRapport && (
                        <>
                            <Row className="mb-4">
                                <Col md={6}>
                                    <div className="p-3 bg-light rounded-3 h-100">
                                        <h6 className="text-muted mb-3">Résumé Financier</h6>
                                        <div className="d-flex justify-content-between mb-2">
                                            <span>Total Ventes :</span>
                                            <span className="fw-bold">{selectedRapport.totalVentes.toLocaleString()} GNF</span>
                                        </div>
                                        <div className="d-flex justify-content-between mb-2">
                                            <span>Solde EXACT :</span>
                                            <span className="fw-bold">{selectedRapport.soldeTheorique.toLocaleString()} GNF</span>
                                        </div>
                                        <div className="d-flex justify-content-between border-top pt-2 mt-2">
                                            <span>Montant Clôture :</span>
                                            <span className="fw-bold text-primary">{selectedRapport.montantCloture.toLocaleString()} GNF</span>
                                        </div>
                                    </div>
                                </Col>
                                <Col md={6}>
                                    <h6 className="fw-bold mb-3">Discussion & Justifications</h6>
                                    
                                    <div className="mb-3">
                                        <small className="text-muted d-block mb-1">Votre commentaire (Gérant) :</small>
                                        <div className="p-2 border rounded bg-white small" style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap', maxHeight: '300px', overflowY: 'auto' }}>
                                            {selectedRapport.commentairesGérant || <em className="text-muted">Aucun commentaire envoyé.</em>}
                                        </div>
                                    </div>

                                    {selectedRapport.commentairesAdmin && (
                                        <div className="mb-3 animate__animated animate__fadeIn">
                                            <small className="text-primary fw-bold d-block mb-1">Réponse de l'Admin :</small>
                                            <div className="p-2 border border-primary bg-primary-subtle rounded text-primary-emphasis small">
                                                <iconify-icon icon="solar:chat-round-check-bold" className="me-1 align-middle"></iconify-icon>
                                                {selectedRapport.commentairesAdmin}
                                            </div>
                                        </div>
                                    )}

                                    {!selectedRapport.commentairesAdmin && selectedRapport.statut !== 'EN_ATTENTE' && (
                                        <div className="alert alert-light text-center small text-muted">
                                            Pas de réponse de l'administrateur pour le moment.
                                        </div>
                                    )}
                                </Col>
                            </Row>
                        </>
                    )}
                </Modal.Body>
                <Modal.Footer>
                    {selectedRapport && selectedRapport.statut === 'REJETE' && (
                        <Button variant="warning" onClick={() => {
                            setShowDetailsModal(false);
                            if (onCorrect) onCorrect(selectedRapport);
                        }}>
                            Corriger et Relancer
                        </Button>
                    )}
                    <Button variant="secondary" onClick={() => setShowDetailsModal(false)}>Fermer</Button>
                    {selectedRapport && detailedReportData && (
                        <Button variant="primary" onClick={generateDetailedReportPDF}>
                            <iconify-icon icon="solar:file-text-bold" className="me-2"></iconify-icon>
                            Exporter PDF Détaillé
                        </Button>
                    )}
                </Modal.Footer>
            </Modal>
        </Card>
    );
};

export default CaisseView;