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
import { toast } from 'react-toastify';
import { useLocation } from 'react-router-dom';
import { caisseAPI, clientAPI, venteAPI } from '../services/api';
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

    // États pour le détail Fintech dans la modale de clôture
    const [showActiveFintechDetails, setShowActiveFintechDetails] = useState(false);
    const [activeFintechData, setActiveFintechData] = useState({ sales: [], recoveries: [] });
    const [loadingFintechDetails, setLoadingFintechDetails] = useState(false);

    const fetchStatut = useCallback(async () => {
        try {
            setLoading(true);
            const res = await caisseAPI.getStatut();
            // L'intercepteur Axios unwrap déjà : res est directement l'objet caisse
            setCaisseStatut(res);
        } catch (err) {
            // Si la caisse n'est pas ouverte, l'API renvoie 403, ce qui est normal.
            // On vérifie si un rapport est en attente.
            if (err.response && err.response.status === 403) {
                // L'intercepteur gère déjà le toast, on peut juste logguer ou ignorer
            } else {
                // Afficher le message d'erreur spécifique du backend s'il existe pour faciliter le débogage
                // Gestion du cas où un rapport a été rejeté et nécessite une action
                if (err.response?.data?.statut === 'REJETE') {
                    setIsCorrection(true);
                    toast.error(
                        <div><strong>Rapport Rejeté :</strong> {err.response.data.message} <Button variant="outline-danger" size="sm" className="mt-2" onClick={() => setShowCloseModal(true)}>
                                Corriger et Relancer la clôture
                            </Button>
                        </div>
                    );
                } else {
                    setIsCorrection(false);
                }
                // L'intercepteur gère déjà le toast pour les autres erreurs
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
                    // L'intercepteur Axios unwrap déjà : res est directement l'objet
                    setStatistiquesSession(res);
                } catch (err) {
                    console.error("Erreur lors du chargement des statistiques de la session:", err);
                    // En cas d'erreur, on utilise les données du statut existant
                    setStatistiquesSession(caisseStatut);
                }
            };
            loadStatistiquesSession();
        }
    }, [showCloseModal, caisseStatut]);

    // Réinitialiser les détails Fintech à la fermeture de la modale
    useEffect(() => {
        if (!showCloseModal) {
            setShowActiveFintechDetails(false);
            setActiveFintechData({ sales: [], recoveries: [] });
        }
    }, [showCloseModal]);

    const toggleActiveFintechDetails = async () => {
        const source = currentRapportForCorrection || caisseStatut;
        if (!showActiveFintechDetails && source) {
            setLoadingFintechDetails(true);
            try {
                const sessionId = source.ouvertureCaisse?._id || source.ouvertureCaisse || source._id;
                const [ventesRes, dettesRes] = await Promise.all([
                    venteAPI.getHistorique({ limit: 0 }),
                    clientAPI.getDebtHistory()
                ]);

                const mobileModes = ['Orange Money', 'MobiCash', 'PayCard', 'Virement'];
                const allSales = (ventesRes.data && ventesRes.data.ventes) ? ventesRes.data.ventes : (ventesRes.ventes || ventesRes.data || []);
                const fintechSales = (allSales || [])
                    .filter(v => (v.ouvertureCaisse?._id || v.ouvertureCaisse) === sessionId && mobileModes.includes(v.modePaiement) && !v.isCancelled);
                const fintechRecoveries = (dettesRes.data || dettesRes || [])
                    .filter(p => (p.ouvertureCaisse?._id || p.ouvertureCaisse) === sessionId && mobileModes.includes(p.modePaiement) && p.statut === 'VALIDEE');

                setActiveFintechData({ sales: fintechSales, recoveries: fintechRecoveries });
            } catch (err) {
                console.error("Erreur chargement détails Fintech:", err);
            } finally {
                setLoadingFintechDetails(false);
            }
        }
        setShowActiveFintechDetails(!showActiveFintechDetails);
    };

    const handleStartCorrection = (rapport) => {
        setMontantCloture(rapport.montantCloture);
        setCommentaires(rapport.commentairesGérant || '');
        setCurrentRapportForCorrection(rapport);
        setIsCorrection(true);
        setShowCloseModal(true);
    };

    const handleOpenCaisse = async (e) => {
        e.preventDefault();
        // setError(''); // Géré par l'intercepteur
        setSuccess('');
        setOpeningCaisse(true);
        try {
            await caisseAPI.ouvrir({ fondInitial: parseFloat(fondInitial) });
            toast.success("Caisse ouverte avec succès !");
            setFondInitial('');
            fetchStatut(); // Recharger le statut
        } catch (err) {
            // Erreur gérée par l'intercepteur Axios
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
                    const stats = getDisplayValues();
                    soldeTheorique = stats.soldeTheorique;
                }
                
                const ecartCalcule = Math.round(montantClotureNum - soldeTheorique);
                
                setEcart(ecartCalcule);
                setAfficherJustification(ecartCalcule !== 0);
            }, 500); 
            
            setEcartTimeout(timeoutId);
        }
    };

    const handleCloseCaisse = async (e) => {
        e.preventDefault();
        // setError(''); // Géré par l'intercepteur
        setSuccess('');
        setClosingCaisse(true);

        const montantClotureNum = parseFloat(montantCloture);
        if (isNaN(montantClotureNum)) {
             toast.error("Veuillez saisir un montant valide.");
             setClosingCaisse(false);
             return;
        }

        // Recalculer l'écart immédiatement pour validation (évite les problèmes de timeout)
        let soldeTheorique = 0;
        if (isCorrection && currentRapportForCorrection) {
            soldeTheorique = currentRapportForCorrection.soldeTheorique;
        } else if (caisseStatut) {
            const source = statistiquesSession || caisseStatut;
            
            const stats = {
                f: source.fondInitial || 0,
                v: source.totalVentes ?? source.session?.totalVentes ?? 0,
                m_sales: source.totalMobileMoneySales ?? source.session?.totalMobileMoneySales ?? ((source.totalMobileMoney ?? source.session?.totalMobileMoney ?? 0) - (source.totalMobileMoneyRecoveries ?? source.session?.totalMobileMoneyRecoveries ?? 0)),
                m_rec: source.totalMobileMoneyRecoveries ?? source.session?.totalMobileMoneyRecoveries ?? 0,
                d: source.totalDettesAccordees ?? source.session?.totalDettesAccordees ?? source.totalDettes ?? 0,
                r: source.totalRecouvrement ?? source.session?.totalRecouvrement ?? 0,
                dep: source.totalDepenses ?? source.session?.totalDepenses ?? 0
            };
            const rapportsValides = source?.totalRapportsValides ?? source?.session?.totalRapportsValides ?? 0;
            soldeTheorique = Math.round(stats.f + (stats.v - stats.d - stats.m_sales) + (stats.r - stats.m_rec) - stats.dep + rapportsValides);
        }
        
        const ecartCalcule = montantClotureNum - soldeTheorique;

        // Vérifier si un écart existe et si la justification est obligatoire
        if (ecartCalcule !== 0 && !commentaires.trim()) {
            setEcart(ecartCalcule);
            setAfficherJustification(true);
            toast.error("Veuillez justifier l'écart détecté avant de valider la clôture.");
            setClosingCaisse(false);
            return;
        }

        try {
            if (isCorrection) {
                // En mode correction, on appelle la route spécifique
                await caisseAPI.corrigerRapport({
                    montantCloture: Math.round(montantClotureNum),
                    commentairesGérant: commentaires
                });
                toast.success("Rapport corrigé et renvoyé pour validation.");
            } else {
                // Mode fermeture standard
                await caisseAPI.fermer({ 
                    montantCloture: Math.round(montantClotureNum), 
                    commentairesGérant: commentaires.trim(),
                    commentaires: commentaires.trim()
                });
                toast.success("Caisse fermée et rapport généré avec succès.");
            }
            setMontantCloture('');
            setCommentaires('');
            setEcart(null);
            setAfficherJustification(false);
            setShowCloseModal(false);
            setCurrentRapportForCorrection(null);
            setCaisseStatut(null); // Réinitialiser le statut pour afficher le formulaire d'ouverture
            fetchStatut(); // Recharger le statut (l'intercepteur gère l'erreur)
        } catch (err) {
            // Erreur gérée par l'intercepteur Axios
        } finally {
            setClosingCaisse(false);
        }
    };

    // Helper pour calculer les valeurs à afficher dans la modale (Session active OU Correction)
    const getDisplayValues = () => {
        if (isCorrection && currentRapportForCorrection) {
            // Cas Correction : On utilise les données figées du rapport
            const r = currentRapportForCorrection;
            const m_total = r.totalMobileMoney || 0;
            const m_rec = r.totalMobileMoneyRecoveries || 0;
            const m_sales = m_total - m_rec;

            return { 
                fondInitial: r.fondInitial || 0, totalVentes: r.totalVentes || 0, 
                totalVentesCash: Math.round((r.totalVentes || 0) - (r.totalDettes || 0) - m_sales),
                totalVentesFintech: m_sales,
                totalMobileMoneyRecoveries: m_rec,
                totalDettes: r.totalDettes || 0, totalDepenses: r.totalDepensesApprouvees || 0, 
                totalMobileMoney: m_total, 
                totalRecouvrementCash: Math.round((r.totalRecouvrement || 0) - m_rec),
                soldeTheorique: r.soldeTheorique || 0, totalRecouvrement: r.totalRecouvrement || 0 
            };
        } else {
            const source = statistiquesSession || caisseStatut;
            const v = source?.totalVentes ?? source?.session?.totalVentes ?? 0;
            const d = source?.totalDettesAccordees ?? source?.session?.totalDettesAccordees ?? source?.totalDettes ?? 0;
            const m_total = source?.totalMobileMoney ?? source?.session?.totalMobileMoney ?? 0;
            const m_rec = source?.totalMobileMoneyRecoveries ?? source?.session?.totalMobileMoneyRecoveries ?? 0;
            const m_sales = m_total - m_rec;
            const r = source?.totalRecouvrement ?? source?.session?.totalRecouvrement ?? 0;
            const dep = source?.totalDepenses ?? source?.session?.totalDepenses ?? 0;
            const f = source?.fondInitial ?? 0;

            const totalRapportsValides = source?.totalRapportsValides ?? source?.session?.totalRapportsValides ?? 0;
            return { 
                fondInitial: f, totalVentes: v, totalVentesCash: Math.round(v - d - m_sales), totalDettes: d, 
                totalVentesFintech: m_sales,
                totalMobileMoneyRecoveries: m_rec,
                totalMobileMoney: m_total, totalRecouvrementCash: Math.round(r - m_rec),
                totalDepenses: dep, totalRecouvrement: r, totalRapportsValides,
                soldeTheorique: Math.round(f + (v - d - m_sales) + (r - m_rec) - dep + totalRapportsValides) 
            };
        }
    };

    const displayValues = getDisplayValues();

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
                <Row className="g-3 text-center">
                    <Col md={2}>
                        <Card className="bg-light border-0">
                            <Card.Body>
                                <h6 className="text-muted">Fond Initial</h6>
                                <h4 className="fw-bold">{(caisseStatut.fondInitial || 0).toLocaleString()} GNF</h4>
                            </Card.Body>
                        </Card>
                    </Col>
                    <Col md={2}>
                        <Card className="bg-light border-0">
                            <Card.Body>
                                <h6 className="text-muted">Ventes (Gérant)</h6>
                                <h4 className="fw-bold text-primary">{(caisseStatut.session?.totalVentes || 0).toLocaleString()} GNF</h4>
                                <small className="text-muted">{caisseStatut.session?.nombreVentes || 0} transaction(s)</small>
                            </Card.Body>
                        </Card>
                    </Col>
                    <Col md={2}>
                        <Card className="bg-light border-0">
                            <Card.Body>
                                <h6 className="text-muted">Recouvrements</h6>
                                <h4 className="fw-bold text-info">{(caisseStatut.totalRecouvrement ?? caisseStatut.session?.totalRecouvrement ?? 0).toLocaleString()} GNF</h4>
                                <small className="text-muted">Dettes payées</small>
                            </Card.Body>
                        </Card>
                    </Col>
                    <Col md={2}>
                        <Card className="bg-light border-0">
                            <Card.Body>
                                <h6 className="text-muted">Dépenses (Gérant)</h6>
                                <h4 className="fw-bold text-danger">{(caisseStatut.session?.totalDepenses || 0).toLocaleString()} GNF</h4>
                                <small className="text-muted">{caisseStatut.session?.nombreDepenses || 0} dépense(s)</small>
                            </Card.Body>
                        </Card>
                    </Col>
                    <Col md={2}>
                        <Card className="border-0 shadow-sm" style={{ backgroundColor: '#FFF8E1' }}>
                            <Card.Body>
                                <h6 className="text-muted">Rapports Caissiers</h6>
                                <h4 className="fw-bold" style={{ color: '#F57C00' }}>
                                    {(caisseStatut.session?.totalRapportsValides || caisseStatut.totalRapportsValides || 0).toLocaleString()} GNF
                                </h4>
                                <small className="text-muted">
                                    <iconify-icon icon="solar:users-group-rounded-bold" className="me-1"></iconify-icon>
                                    {caisseStatut.rapportsCaissiersValides?.length || 0} rapport(s)
                                </small>
                            </Card.Body>
                        </Card>
                    </Col>
                    <Col md={2}>
                        <Card className="bg-primary-subtle border-0 shadow-sm">
                            <Card.Body>
                                <h6 className="text-muted">Total Caisse</h6>
                                <h4 className="fw-bold text-primary">
                                    {(
                                        (caisseStatut.fondInitial || 0) +
                                        (caisseStatut.session?.cashEnCaisse || 0) +
                                        (caisseStatut.session?.totalRapportsValides || caisseStatut.totalRapportsValides || 0)
                                    ).toLocaleString()} GNF
                                </h4>
                                <small className="text-muted">Solde consolidé</small>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>

                {/* Liste détaillée des rapports caissiers validés */}
                {caisseStatut.rapportsCaissiersValides && caisseStatut.rapportsCaissiersValides.length > 0 && (
                    <div className="mt-4">
                        <h6 className="fw-bold mb-2 d-flex align-items-center">
                            <iconify-icon icon="solar:clipboard-list-bold-duotone" className="me-2" style={{ color: '#F57C00' }}></iconify-icon>
                            Rapports Caissiers Validés
                            <Badge bg="warning" text="dark" className="ms-2">{caisseStatut.rapportsCaissiersValides.length}</Badge>
                        </h6>
                        <div className="table-responsive" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                            <Table size="sm" hover className="mb-0 small">
                                <thead className="table-warning sticky-top">
                                    <tr>
                                        <th>Caissier</th>
                                        <th>Date</th>
                                        <th className="text-end">Montant Clôture</th>
                                        <th className="text-end">Écart</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {caisseStatut.rapportsCaissiersValides.map(r => (
                                        <tr key={r._id}>
                                            <td className="fw-bold">{r.caissierNom}</td>
                                            <td className="text-muted">{new Date(r.date).toLocaleDateString('fr-FR')}</td>
                                            <td className="text-end fw-bold text-success">{(r.montantCloture || 0).toLocaleString()} GNF</td>
                                            <td className="text-end">
                                                <Badge bg={r.ecart === 0 ? 'success' : 'danger'}>
                                                    {r.ecart === 0 ? '0' : `${r.ecart?.toLocaleString()} GNF`}
                                                </Badge>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </Table>
                        </div>
                    </div>
                )}

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
            {success && <Alert variant="success">{success}</Alert>} {/* Garder le succès local si besoin */}

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
                                    <span className="text-muted d-flex align-items-center">
                                        <iconify-icon icon="solar:phone-calling-bold" className="me-2" style={{ color: '#FF6600' }}></iconify-icon>
                                        Ventes (Fintech)
                                    </span>
                                    <span className="fw-bold" style={{ color: '#FF6600' }}>+ {(displayValues.totalVentesFintech || 0).toLocaleString()} GNF</span>
                                </div>
                                <div className="d-flex justify-content-between mb-2">
                                    <span className="text-muted d-flex align-items-center">
                                        <iconify-icon icon="solar:phone-calling-bold" className="me-2" style={{ color: '#FF6600' }}></iconify-icon>
                                        Recouvrement (Fintech)
                                    </span>
                                    <span className="fw-bold" style={{ color: '#FF6600' }}>+ {(displayValues.totalMobileMoneyRecoveries || 0).toLocaleString()} GNF</span>
                                </div>
                                <div className="d-flex justify-content-between mb-2 pt-2 border-top border-warning border-opacity-50 align-items-center">
                                    <span className="fw-bold d-flex align-items-center" style={{ color: '#FF6600' }}>
                                        <iconify-icon icon="solar:phone-calling-bold" className="me-2"></iconify-icon>
                                        Total Flux Fintech
                                    </span>
                                    <div className="text-end">
                                        <span className="fw-bold d-block" style={{ color: '#FF6600' }}>{(displayValues.totalMobileMoney || 0).toLocaleString()} GNF</span>
                                        {((displayValues.totalMobileMoney || 0) > 0) && (
                                            <Button 
                                                variant="link" 
                                                size="sm" 
                                                className="p-0 text-decoration-none x-small fw-bold" 
                                                style={{ color: '#FF6600', fontSize: '0.7rem' }}
                                                onClick={toggleActiveFintechDetails}
                                            >
                                                {showActiveFintechDetails ? 'Masquer détails' : 'Voir transactions'}
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                {/* Section détails Fintech active */}
                                {showActiveFintechDetails && (
                                    <div className="mb-3 animate__animated animate__fadeIn">
                                        {loadingFintechDetails ? (
                                            <div className="text-center py-2"><Spinner size="sm" style={{ color: '#FF6600' }} /></div>
                                        ) : (
                                            <div className="border rounded bg-white overflow-auto" style={{ maxHeight: '150px' }}>
                                                <Table size="sm" hover className="mb-0 x-small" style={{ fontSize: '0.75rem' }}>
                                                    <thead className="bg-light sticky-top">
                                                        <tr>
                                                            <th className="ps-2">Heure</th>
                                                            <th>Type</th>
                                                            <th className="text-end pe-2">Montant</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {activeFintechData.sales.map(v => (
                                                            <tr key={v._id}>
                                                                <td className="ps-2 text-muted">{new Date(v.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                                                                <td>Vente ({v.modePaiement === 'Orange Money' ? 'OM' : v.modePaiement === 'MobiCash' ? 'Mobi' : 'Card'})</td>
                                                                <td className="text-end pe-2 fw-bold" style={{ color: '#FF6600' }}>{(v.prixTotal || 0).toLocaleString()}</td>
                                                            </tr>
                                                        ))}
                                                        {activeFintechData.recoveries.map(p => (
                                                            <tr key={p._id}>
                                                                <td className="ps-2 text-muted">{new Date(p.datePaiement || p.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                                                                <td className="text-info">Recouv. ({p.modePaiement === 'Orange Money' ? 'OM' : 'Mobi'})</td>
                                                                <td className="text-end pe-2 fw-bold text-info">{(p.montant || 0).toLocaleString()}</td>
                                                            </tr>
                                                        ))}
                                                        {activeFintechData.sales.length === 0 && activeFintechData.recoveries.length === 0 && (
                                                            <tr><td colSpan="3" className="text-center py-2 text-muted">Aucune transaction numérique.</td></tr>
                                                        )}
                                                    </tbody>
                                                </Table>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <hr className="my-3 opacity-25" />

                                <div className="d-flex justify-content-between mb-2">
                                    <span className="text-muted d-flex align-items-center">
                                        <iconify-icon icon="solar:vault-bold" className="me-2"></iconify-icon>
                                        Fond initial
                                    </span>
                                    <span className="fw-bold">{(displayValues.fondInitial || 0).toLocaleString()} GNF</span>
                                </div>
                                <div className="d-flex justify-content-between mb-2">
                                    <span className="text-muted d-flex align-items-center">
                                        <iconify-icon icon="solar:banknote-bold" className="me-2 text-success"></iconify-icon>
                                        Ventes au comptant (Cash)
                                    </span>
                                    <span className="fw-bold text-success">+ {(displayValues.totalVentesCash || 0).toLocaleString()} GNF</span>
                                </div>
                                <div className="d-flex justify-content-between mb-2">
                                    <span className="text-muted d-flex align-items-center">
                                        <iconify-icon icon="solar:hand-money-bold" className="me-2 text-info"></iconify-icon>
                                        Recouvrements (Cash)
                                    </span>
                                    <span className="fw-bold text-info">+ {(displayValues.totalRecouvrementCash || 0).toLocaleString()} GNF</span>
                                </div>

                                <div className="d-flex justify-content-between mb-2">
                                    <span className="text-muted d-flex align-items-center">
                                        <iconify-icon icon="solar:notebook-bold" className="me-2 text-warning"></iconify-icon>
                                        Dettes accordées (Crédit)
                                    </span>
                                    <span className="fw-bold text-warning">- {(displayValues.totalDettes || 0).toLocaleString()} GNF</span>
                                </div>
                                <div className="d-flex justify-content-between">
                                    <span className="text-muted d-flex align-items-center">
                                        <iconify-icon icon="solar:wallet-minus-bold" className="me-2 text-danger"></iconify-icon>
                                        Total Dépenses (Gérant)
                                    </span>
                                    <span className="fw-bold text-danger">- {(displayValues.totalDepenses || 0).toLocaleString()} GNF</span>
                                </div>
                                <hr className="my-2 opacity-25" />
                                <div className="d-flex justify-content-between mb-2">
                                    <span className="text-muted d-flex align-items-center">
                                        <iconify-icon icon="solar:users-group-rounded-bold" className="me-2" style={{ color: '#F57C00' }}></iconify-icon>
                                        Rapports Caissiers Validés
                                    </span>
                                    <span className="fw-bold" style={{ color: '#F57C00' }}>
                                        + {(statistiquesSession?.totalRapportsValides || caisseStatut?.session?.totalRapportsValides || caisseStatut?.totalRapportsValides || 0).toLocaleString()} GNF
                                    </span>
                                </div>
                                <hr/>
                                
                                {/* Détail nominatif des remboursements */}
                                {statistiquesSession?.listeRecouvrements?.length > 0 && (
                                    <div className="mb-3">
                                        <small className="text-primary fw-bold text-uppercase" style={{ fontSize: '0.7rem' }}>Détail des recouvrements</small>
                                        <div className="border rounded bg-white mt-1" style={{ maxHeight: '100px', overflowY: 'auto' }}>
                                            <Table size="sm" className="mb-0 x-small" style={{ fontSize: '0.8rem' }}>
                                                <tbody>
                                                    {statistiquesSession.listeRecouvrements.map((p, i) => (
                                                        <tr key={i}>
                                                            <td className="ps-2 fw-bold">{p.client?.nom || 'Client Inconnu'}</td>
                                                            <td className="text-end pe-2 fw-bold text-info">{(p.montant || 0).toLocaleString()} GNF</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </Table>
                                        </div>
                                    </div>
                                )}

                                <div className="d-flex justify-content-between align-items-center">
                                    <span className="fw-bold text-danger d-flex align-items-center">
                                        <iconify-icon icon="solar:safe-square-bold" className="me-2" style={{ fontSize: '20px' }}></iconify-icon>
                                        Total Espèces Attendu
                                    </span>
                                    <span className="fw-bold fs-5 text-danger">{(displayValues.soldeTheorique || 0).toLocaleString()} GNF</span>
                                </div>
                            </Card.Body>
                        </Card>

                        {afficherJustification && (
                            <Alert variant="danger" className="blink-animation">
                                <strong>Écart détecté :</strong> {(ecart || 0).toLocaleString()} GNF. Veuillez justifier cet écart dans les commentaires ci-dessous.
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
    const [submitLoading, setSubmitLoading] = useState(false); // Garder pour le spinner
    
    // États pour le paiement de commission
    const [workers, setWorkers] = useState([]);
    const [loadingWorkers, setLoadingWorkers] = useState(false);
    const [selectedWorkerId, setSelectedWorkerId] = useState('');
    const [paymentAmount, setPaymentAmount] = useState('');

    const [commissionSubmitLoading, setCommissionSubmitLoading] = useState(false); // Garder pour le spinner
    
    // Utilisation directe du solde calculé par le backend pour éviter les erreurs de clés
    const availableCash = caisseStatut 
        ? (caisseStatut.session?.cashReelActuel ?? 
          ((caisseStatut.fondInitial || 0) + (caisseStatut.session?.totalVentes || 0) - (caisseStatut.session?.totalDettesAccordees || 0) + (caisseStatut.session?.totalRecouvrement || 0) - (caisseStatut.session?.totalDepenses || 0)))
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
                const sessionDepenses = (res.data.data || []).filter(d => d.ouvertureCaisse === caisseStatut._id);
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
                .catch(err => { /* Erreur gérée par l'intercepteur Axios */ })
                .finally(() => setLoadingWorkers(false));
        }
    }, [showCommissionModal]);

    const handleOpenCreateModal = () => {
        setNewExpense({ montant: '', motif: '' });
        setShowModal(true);
    };

    const handleOpenCommissionModal = () => {
        setSelectedWorkerId('');
        setPaymentAmount('');
        setShowCommissionModal(true);
    };

    const handleCreateExpense = async (e) => {
        e.preventDefault();
        setSubmitLoading(true);
        if (parseFloat(newExpense.montant) > availableCash) {
            toast.error(`Fonds insuffisants en caisse. Disponible: ${availableCash.toLocaleString()} GNF`);
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
            // Erreur gérée par l'intercepteur Axios
        } finally {
            setSubmitLoading(false);
        }
    };

    const handlePayCommission = async (e) => {
        e.preventDefault();
        setCommissionSubmitLoading(true);
        const selectedWorker = workers.find(w => w._id === selectedWorkerId);

        if (parseFloat(paymentAmount) > availableCash) {
            toast.error(`Fonds insuffisants en caisse. Disponible: ${availableCash.toLocaleString()} GNF`);
            setCommissionSubmitLoading(false);
            return;
        }

        if (!selectedWorker) {
            toast.error("Veuillez sélectionner un ouvrier.");
            setCommissionSubmitLoading(false);
            return;
        }

        const amountToPay = parseFloat(paymentAmount);
        if (isNaN(amountToPay) || amountToPay <= 0) {
            toast.error("Le montant à payer est invalide.");
            setCommissionSubmitLoading(false);
            return;
        }

        if (amountToPay > selectedWorker.commission) {
            toast.error("Le montant à payer ne peut pas dépasser la commission due.");
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
            // Erreur gérée par l'intercepteur Axios
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
                            <div className="mt-2 p-2 bg-light rounded small">
                                <div className="d-flex justify-content-between">
                                    <span>Cash disponible :</span>
                                    <span className="fw-bold text-success">{availableCash.toLocaleString()} GNF</span>
                                </div>
                                <div className="text-muted" style={{fontSize: '0.75rem'}}>
                                    (Calculé sur la base du fond initial, des ventes cash et des recouvrements, moins les dépenses déjà validées)
                                </div>
                            </div>
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
    const [filterSalesMode, setFilterSalesMode] = useState(null); // 'digital' ou null
    const [detailsLoading, setDetailsLoading] = useState(false);

    // Helper pour formater la monnaie de manière robuste dans le tableau
    const formatTableCurrency = (value) => {
        const num = value?.$numberDecimal ? parseFloat(value.$numberDecimal) : parseFloat(value);
        const safeValue = isNaN(num) ? 0 : num;
        return safeValue.toLocaleString('fr-FR') + ' GNF';
    };

    useEffect(() => {
                caisseAPI.getMesRapports()
                    .then(res => {
                        // Après l'intercepteur, res = { data: [...], totalPages, ... }
                        setRapports(res.data || []);
                    })
            .catch(err => {
                console.error(err);
                toast.error("Erreur chargement des rapports: " + (err.response?.data?.message || err.message));
            })
            .finally(() => setLoading(false));
    }, []);

    // Effet pour charger les détails du rapport lorsque la modale s'ouvre ou que le rapport sélectionné change
    useEffect(() => {
        const fetchDetailedReport = async () => {
            if (showDetailsModal && selectedRapport) {
                setDetailsLoading(true);
                try {
                    const res = await caisseAPI.getReportDetails(selectedRapport._id);
                    // Après l'intercepteur, res est déjà l'objet { rapport, ventes, depenses, ... }
                    setDetailedReportData(res);
                } catch (err) {
                    console.error("Erreur lors du chargement des détails du rapport:", err);
                } finally {
                    setDetailsLoading(false);
                }
            }
        };
        fetchDetailedReport();
    }, [showDetailsModal, selectedRapport]);

    const getStatusBadge = (status) => {
        switch (status) {
            case 'VALIDE': return <Badge bg="success">Validé</Badge>;
            case 'VALIDEE': return <Badge bg="success">Validé</Badge>; // Support de l'ancienne version
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
        doc.text("Numérique", 70, y);
        doc.text("Théorique", 100, y);
        doc.text("Clôture", 130, y);
        doc.text("Écart", 160, y);
        doc.text("Statut", 185, y);
        
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
            const numerique = (r.totalMobileMoney || 0).toLocaleString('fr-FR').replace(/[\u00a0\u202f]/g, ' ');
            const theo = (r.soldeTheorique || 0).toLocaleString('fr-FR').replace(/[\u00a0\u202f]/g, ' ');
            const cloture = (r.montantCloture || 0).toLocaleString('fr-FR').replace(/[\u00a0\u202f]/g, ' ');
            const ecart = (r.ecart || 0).toLocaleString('fr-FR').replace(/[\u00a0\u202f]/g, ' ');
            const statut = r.statut === 'VALIDE' ? 'Validé' : (r.statut === 'REJETE' ? 'Rejeté' : 'En attente');
            
            doc.text(date, 14, y);
            doc.text(ventes, 40, y);
            doc.text(numerique, 70, y);
            doc.text(theo, 100, y);
            doc.text(cloture, 130, y);
            doc.text(ecart, 160, y);
            doc.text(statut, 185, y);
            
            y += 8;
        });
        
        doc.save(`rapports_caisse_${new Date().toISOString().slice(0,10)}.pdf`);
    };

    // Nouvelle fonction pour exporter le rapport détaillé en PDF
    const generateDetailedReportPDF = () => {
        if (!detailedReportData) return;

        const { rapport, ventes, depenses, remboursements, dettesAccordees } = detailedReportData;
        const doc = new jsPDF();
        let y = 10;

        // Helper robuste anti-NaN et anti-Decimal128
        const formatCurrency = (value) => {
            const num = value?.$numberDecimal ? parseFloat(value.$numberDecimal) : parseFloat(value);
            return (isNaN(num) ? 0 : num).toLocaleString('fr-FR') + ' GNF';
        };

        const v = rapport.totalVentes?.$numberDecimal ? parseFloat( rapport.totalVentes.$numberDecimal) : (parseFloat(rapport.totalVentes) || 0);
        const d = rapport.totalDettes?.$numberDecimal ? parseFloat( rapport.totalDettes.$numberDecimal) : (parseFloat(rapport.totalDettes) || 0);
        const m = rapport.totalMobileMoney?.$numberDecimal ? parseFloat(rapport.totalMobileMoney.$numberDecimal) : (parseFloat(rapport.totalMobileMoney) || 0);
        const totalVentesCash = v - d - m;

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
                ['Paiements Numériques', formatCurrency(rapport.totalMobileMoney)],
                ['Total Dépenses Approuvées', formatCurrency(rapport.totalDepensesApprouvees)],
                ['Recouvrements Dettes', formatCurrency(rapport.totalRecouvrement || 0)],
                ['Total Ventes (Chiffre d\'Affaires)', formatCurrency(rapport.totalVentes)],
                ['Dettes accordées (Crédit)', `- ${formatCurrency(rapport.totalDettes)}`],
                ['Ventes au comptant (Net Cash)', formatCurrency(totalVentesCash)],
                ['Recouvrements Dettes', `+ ${formatCurrency(rapport.totalRecouvrement || 0)}`],
                ['Total Dépenses Approuvées', `- ${formatCurrency(rapport.totalDepensesApprouvees)}`],
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

        y = (doc.lastAutoTable?.finalY || y) + 10;

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
            y = (doc.lastAutoTable?.finalY || y) + 10;
        }

        // Section : Recouvrements de Dettes
        if (remboursements && remboursements.length > 0) {
            if (y > doc.internal.pageSize.height - 40) {
                doc.addPage();
                y = 10;
            }
            doc.setFontSize(14);
            doc.text("Recouvrements de Dettes", 14, y);
            y += 5;
            autoTable(doc, {
                startY: y,
                head: [['Client', 'Montant', 'Date']],
                body: remboursements.map(r => [
                    r.client?.nom || 'N/A',
                    formatCurrency(r.montant),
                    new Date(r.datePaiement || r.createdAt).toLocaleDateString('fr-FR')
                ]),
                theme: 'striped',
                styles: { fontSize: 9, cellPadding: 2 },
                headStyles: { fillColor: [0, 123, 255], textColor: 255 }, // Bleu pour l'info
                columnStyles: { 1: { halign: 'right' }, 2: { halign: 'center' } }
            });
            y = (doc.lastAutoTable?.finalY || y) + 10;
        }

        // Section : Dettes Accordées (Crédit)
        if (dettesAccordees && dettesAccordees.length > 0) {
            if (y > doc.internal.pageSize.height - 40) {
                doc.addPage();
                y = 10;
            }
            doc.setFontSize(14);
            doc.text("Dettes Accordées (Ventes à Crédit)", 14, y);
            y += 5;
            autoTable(doc, {
                startY: y,
                head: [['Client', 'Montant', 'Date']],
                body: dettesAccordees.map(d => [
                    d.client?.nom || 'N/A',
                    formatCurrency(d.montant),
                    new Date(d.createdAt).toLocaleDateString('fr-FR')
                ]),
                theme: 'striped',
                styles: { fontSize: 9, cellPadding: 2 },
                headStyles: { fillColor: [255, 193, 7], textColor: 0 }, // Jaune pour avertissement/crédit
                columnStyles: { 1: { halign: 'right' }, 2: { halign: 'center' } }
            });
            y = (doc.lastAutoTable?.finalY || y) + 10;
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

        // Sécurisation de la position Y pour éviter le crash "reading 'x'"
        y = (Number(doc.lastAutoTable?.finalY) || y + 20) + 10;
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
                            <th>Paiements Num.</th>
                            <th>Ventes Crédit (Dette)</th>
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
                                    <td>{formatTableCurrency(r.totalVentes)}</td>
                                    <td className="fw-bold" style={{ color: '#FF6600' }}>{formatTableCurrency(r.totalMobileMoney)}</td>
                                    <td className="text-warning fw-bold">
                                        {formatTableCurrency(r.totalDettes)}
                                    </td>
                                    <td className="fw-bold">{formatTableCurrency(r.soldeTheorique)}</td>
                                    <td className="text-primary fw-bold">{formatTableCurrency(r.montantCloture)}</td>
                                    <td>
                                        <Badge bg={r.ecart === 0 ? 'success' : 'danger'}>
                                            {formatTableCurrency(r.ecart)}
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
            <Modal show={showDetailsModal} onHide={() => { setShowDetailsModal(false); setFilterSalesMode(null); }} centered size="lg">
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
                                        <div
                                            className={`d-flex justify-content-between mb-2 p-2 rounded transition-all shadow-sm ${filterSalesMode === 'digital' ? 'text-white' : ''}`}
                                            style={{ 
                                                cursor: 'pointer',
                                                backgroundColor: filterSalesMode === 'digital' ? '#FF6600' : '#FFF5EB',
                                                color: filterSalesMode === 'digital' ? '#FFFFFF' : '#FF6600',
                                                border: `1px solid ${filterSalesMode === 'digital' ? '#FF6600' : '#FFE0CC'}`
                                            }}
                                            onClick={() => setFilterSalesMode(filterSalesMode === 'digital' ? null : 'digital')}
                                            title="Cliquez pour filtrer les paiements Orange Money / MobiCash"
                                        >
                                            <span>📱 Paiements Fintech (OM/Mobi) :</span>
                                            <span className="fw-bold">{selectedRapport.totalMobileMoney.toLocaleString()} GNF</span>
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

                                    {detailedReportData && detailedReportData.dettesAccordees?.length > 0 && (
                                        <div className="mb-3">
                                            <small className="text-warning fw-bold d-block mb-1">Dettes Accordées (Crédit) :</small>
                                            <div className="border rounded bg-white" style={{ maxHeight: '150px', overflowY: 'auto' }}>
                                                <Table size="sm" hover className="mb-0" style={{ fontSize: '0.85rem' }}>
                                                    <thead className="table-warning">
                                                        <tr>
                                                            <th>Client</th>
                                                            <th className="text-end">Montant</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {detailedReportData.dettesAccordees.map((d, i) => (
                                                            <tr key={i}>
                                                                <td>{d.client?.nom || 'N/A'}</td>
                                                                <td className="text-end fw-bold text-danger">{(d.montant || 0).toLocaleString()} GNF</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </Table>
                                            </div>
                                        </div>
                                    )}

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

                            {detailsLoading ? (
                                <div className="text-center py-4">
                                    <Spinner animation="border" variant="primary" size="sm" />
                                    <p className="small text-muted mt-2">Chargement des transactions...</p>
                                </div>
                            ) : (
                            /* Liste des ventes détaillées (Filtrable) */
                            detailedReportData?.ventes && (
                                <div className="mt-3 pt-3 border-top">
                                    <div className="d-flex justify-content-between align-items-center mb-2">
                                        <h6 className="fw-bold mb-0 text-muted small text-uppercase">Transactions de la session</h6>
                                        {filterSalesMode && (
                                            <Badge bg="dark" style={{ cursor: 'pointer' }} onClick={() => setFilterSalesMode(null)}>
                                                Filtre Numérique Actif (cliquez pour retirer)
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="border rounded bg-white" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                                        <Table size="sm" hover responsive striped className="mb-0 small align-middle">
                                            <thead className="bg-light sticky-top" style={{ zIndex: 1 }}>
                                                <tr>
                                                    <th className="ps-3">Heure</th>
                                                    <th>Article</th>
                                                    <th>Mode</th>
                                                    <th className="text-end pe-3">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {detailedReportData.ventes
                                                    .filter(v => {
                                                        if (filterSalesMode === 'digital') {
                                                            return ['Orange Money', 'MobiCash', 'PayCard', 'Virement'].includes(v.modePaiement);
                                                        }
                                                        return true;
                                                    })
                                                    .map(vente => (
                                                    <tr key={vente._id}>
                                                        <td className="ps-3">{new Date(vente.createdAt).toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})}</td>
                                                        <td className="fw-bold">{vente.article?.nom || 'N/A'}</td>
                                                        <td>
                                                            {(() => {
                                                                const mode = vente.modePaiement || 'Cash';
                                                                let bg = 'light';
                                                                let text = 'dark';
                                                                let icon = 'solar:money-bag-bold';
                                                                let label = mode;

                                                                if (mode === 'Orange Money') {
                                                                    return <Badge style={{ backgroundColor: '#FF6600', color: 'white' }} className="border-0 fw-normal">
                                                                        <iconify-icon icon="simple-icons:orange" className="me-1 align-middle"></iconify-icon>OM
                                                                    </Badge>;
                                                                } else if (mode === 'MobiCash') {
                                                                    return <Badge style={{ backgroundColor: '#FFCC00', color: 'black' }} className="border-0 fw-normal">
                                                                    <iconify-icon icon="solar:phone-calling-bold" className="me-1 align-middle"></iconify-icon>Mobi // Correction: Utiliser l'icône appropriée
                                                                    </Badge>;
                                                                } else if (mode === 'PayCard') {
                                                                    return <Badge bg="info" className="border-0 fw-normal">
                                                                        <iconify-icon icon="solar:card-bold" className="me-1 align-middle"></iconify-icon>PayCard
                                                                    </Badge>;
                                                                } else if (mode === 'Cash') {
                                                                    bg = 'success-subtle'; text = 'success'; icon = 'solar:banknote-2-bold';
                                                                } else if (mode === 'Dette') {
                                                                    bg = 'danger-subtle'; text = 'danger'; icon = 'solar:notebook-bold';
                                                                }
                                                                return <Badge bg={bg} text={text} className="border-0 fw-normal"><iconify-icon icon={icon} className="me-1 align-middle"></iconify-icon>{label}</Badge>;
                                                            })()}
                                                        </td>
                                                        <td className="text-end pe-3 fw-bold">{(vente.prixTotal || 0).toLocaleString()} GNF</td>
                                                    </tr>
                                                ))}
                                                {detailedReportData.ventes.length === 0 && <tr><td colSpan="4" className="text-center py-3 text-muted">Aucune vente enregistrée.</td></tr>}
                                            </tbody>
                                        </Table>
                                    </div>
                                </div>
                            ))}
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