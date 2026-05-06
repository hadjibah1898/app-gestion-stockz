import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Row, Col, Card, Badge, Table, Spinner, Alert, Button, Modal, Form } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { generateReceiptPDF } from '../utils/pdfUtils'; // Import de la fonction de génération de PDF
import { venteAPI, boutiqueAPI } from '../services/api';
import ReceiptModal from './ReceiptModal'; // Import de la modale de reçu

const ServeurDashboard = () => {
    const [historique, setHistorique] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [boutiqueConfig, setBoutiqueConfig] = useState(null);
    const [error, setError] = useState('');
    const [showPayModal, setShowPayModal] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [showReceiptModal, setShowReceiptModal] = useState(false);
    const [currentReceiptData, setCurrentReceiptData] = useState(null);
    const [paymentMode, setPaymentMode] = useState('Cash');
    const [transactionRef, setTransactionRef] = useState('');
    const [showQrCodeFullscreenModal, setShowQrCodeFullscreenModal] = useState(false);
    const [fullscreenQrCode, setFullscreenQrCode] = useState('');

    const prevReadyCount = React.useRef(0);

    // Effet de vibration pour les nouvelles commandes prêtes
    useEffect(() => {
        const readyCount = historique.filter(v => v.statut === 'en_preparation').length;
        // Ne vibrer que si le nombre de commandes prêtes a augmenté
        if (readyCount > prevReadyCount.current && window.navigator.vibrate) {
            window.navigator.vibrate([200, 100, 200]);
        }
        prevReadyCount.current = readyCount;
    }, [historique]);

    const fetchData = useCallback(async (isSilent = false) => {
        try {
            if (!isSilent) setLoading(true);
            else setRefreshing(true);
            
            const userId = localStorage.getItem('userId');
            const boutiqueId = localStorage.getItem('boutiqueId');

            if (!userId) {
                throw new Error("ID utilisateur non trouvé. Veuillez vous reconnecter.");
            }
            if (!boutiqueId) {
                throw new Error("ID de boutique non trouvé pour ce serveur. Veuillez contacter l'administrateur.");
            }

            const [ventesRes, boutiqueRes] = await Promise.allSettled([ // Use allSettled to get results even if one promise fails
                venteAPI.getHistorique({ limit: 100, gerantId: userId }), // Limite à 100 pour la rapidité
                boutiqueAPI.getAll({ _id: boutiqueId })
            ]);

            if (ventesRes.status === 'fulfilled') {
                setHistorique(ventesRes.value.data.ventes || []);
            } else { console.error("Failed to fetch sales history:", ventesRes.reason); }

            if (boutiqueRes.status === 'fulfilled' && boutiqueRes.value.data && boutiqueRes.value.data.length > 0) {
                setBoutiqueConfig(boutiqueRes.value.data[0]);
            } else { console.error("Failed to fetch boutique config:", boutiqueRes.reason); }

        } catch (err) {
            console.error("Error fetching data in ServeurDashboard:", err);
            setError(err.message || err.response?.data?.message || "Erreur lors du chargement des statistiques.");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        // Rafraîchissement automatique toutes les 30 secondes pour le "temps réel"
        const interval = setInterval(() => fetchData(true), 30000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const handleFinalizePayment = async () => {
        if (!selectedOrder) return;
        
        const digitalModes = ['Orange Money', 'MobiCash', 'PayCard', 'Virement'];
        
        // UX Validation : Empêcher l'envoi si la référence est vide pour un paiement digital
        if (digitalModes.includes(paymentMode) && !transactionRef.trim()) {
            setError(`Veuillez saisir la référence de transaction pour le paiement ${paymentMode}.`);
            return;
        }

        try {
            const payload = { 
                status: 'finalisee',
                modePaiement: paymentMode,
                transactionRef: digitalModes.includes(paymentMode) ? transactionRef : undefined
            };

            // Si l'ID contient un tiret, c'est notre clé composite (anciennes données).
            // On valide alors les articles un par un.
            if (selectedOrder.id.toString().includes('-')) {
                const promises = selectedOrder.items.map(item => 
                    venteAPI.updateStatus(item._id, payload)
                );
                await Promise.all(promises);
            } else {
                // Sinon, on utilise la mise à jour groupée native du backend
                await venteAPI.updateGroupStatus(selectedOrder.id, payload); // selectedOrder.id est le orderGroupId
            }

            setShowPayModal(false);
            await fetchData();

            // Préparer les données du ticket de caisse
            const subTotal = selectedOrder.items.reduce((acc, item) => acc + (item.isCancelled ? 0 : ((item.article?.prixVente || (item.prixTotal / item.quantite)) * item.quantite)), 0);
            const totalNet = selectedOrder.items.reduce((acc, item) => acc + (item.isCancelled ? 0 : item.prixTotal), 0);
            const totalPourboire = selectedOrder.items.reduce((acc, item) => acc + (item.isCancelled ? 0 : (item.pourboire || 0)), 0);

            const receiptData = {
                shopName: boutiqueConfig?.nom || selectedOrder.boutique?.nom || "Ma Boutique",
                address: boutiqueConfig?.adresse || selectedOrder.boutique?.adresse || "",
                phone: boutiqueConfig?.telephone || selectedOrder.boutique?.telephone || "",
                transactionId: `SRV-${selectedOrder.id.toString().slice(-6).toUpperCase()}`, // ID spécifique au serveur
                cashierName: localStorage.getItem('userName') || "Serveur", // Le serveur est le "caissier" ici
                serverName: localStorage.getItem('userName') || "Serveur", // Le serveur est aussi le serveur
                clientName: selectedOrder.client?.nom || 'Client de passage',
                date: new Date(),
                items: selectedOrder.items.map(item => ({
                    article: item.article,
                    quantite: item.quantite,
                    prixUnitaire: item.prixTotal / item.quantite,
                    prixTotal: item.prixTotal
                })),
                modePaiement: paymentMode,
                subTotal: subTotal,
                itemLevelDiscount: subTotal - totalNet,
                pourboire: totalPourboire,
                totalNet: totalNet + totalPourboire, // Le total net sur le ticket inclut le pourboire
                amountPaid: totalNet + totalPourboire, // Le client paie le total (prix + pourboire)
                change: 0
            };
            setCurrentReceiptData(receiptData);
            setShowReceiptModal(true); // Afficher la modale d'impression
            setPaymentMode('Cash'); // Réinitialiser pour la prochaine fois
            setTransactionRef('');

            setSelectedOrder(null);
        } catch (err) {
            setError("Erreur lors de l'encaissement.");
        }
    };

    // Récupérer le QR Code et le numéro de compte/téléphone correspondant au mode de paiement sélectionné
    const activePaymentDetails = useMemo(() => {
        // On utilise boutiqueConfig (données complètes) plutôt que selectedOrder.boutique (données partielles)
        if (!boutiqueConfig) return null;
        const b = boutiqueConfig;
        if (paymentMode === 'Orange Money') return { qr: b.orangeMoneyQrCode, account: b.orangeMoneyAccount };
        if (paymentMode === 'MobiCash') return { qr: b.mobicashQrCode, account: b.mobicashAccount };
        if (paymentMode === 'PayCard') return { qr: b.paycardQrCode, account: b.paycardAccount };
        return null;
    }, [paymentMode, boutiqueConfig]);

    const activeQrCode = activePaymentDetails?.qr;
    const activeAccount = activePaymentDetails?.account;

    const handlePrintReceipt = () => {
        if (currentReceiptData) {
            generateReceiptPDF(currentReceiptData);
        }
    };

    const { stats, groupedActivity } = useMemo(() => {
        const today = new Date().toLocaleDateString();
        const validSales = historique.filter(v => !v.isCancelled);
        const salesToday = validSales.filter(v => new Date(v.createdAt).toLocaleDateString() === today);
        
        // Regroupement par transaction (Heure à la seconde + Table)
        // Utilisation de orderGroupId pour un regroupement plus fiable
        const groups = {};
        historique.forEach(vente => {
            const key = vente.orderGroupId || `${Math.floor(new Date(vente.createdAt).getTime() / 1000)}-${vente.numeroTable || 'N/A'}`;
            if (!groups[key]) {
                groups[key] = { 
                    id: key, 
                    date: vente.createdAt, 
                    table: vente.numeroTable, 
                    items: [], 
                    total: 0, 
                    statut: vente.statut, 
                    isCancelled: vente.isCancelled,
                    boutique: vente.boutique,
                    client: vente.client
                };
            }
            groups[key].items.push(vente);
            if (!vente.isCancelled) {
                // Le total d'une vente pour un serveur doit inclure son pourboire
                // car c'est la somme finale que le client doit débourser.
                groups[key].total += (vente.prixTotal + (vente.pourboire || 0));
            }
        });

        return {
            stats: {
                count: salesToday.length,
                total: salesToday.reduce((sum, v) => sum + v.prixTotal, 0),
                pourboires: salesToday.reduce((sum, v) => sum + (v.pourboire || 0), 0),
                pending: validSales.filter(v => ['commande', 'en_preparation'].includes(v.statut)).length
            },
            groupedActivity: Object.values(groups).sort((a, b) => new Date(b.date) - new Date(a.date))
        };
    }, [historique]);

    if (loading) return <div className="text-center p-5"><Spinner animation="border" /></div>;

    return (
        <>
        <div className="p-4">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <div className="d-flex align-items-center gap-3">
                    <h3 className="fw-bold mb-0">Mon Tableau de Bord</h3>
                    {refreshing && <Spinner animation="border" size="sm" className="text-primary" />}
                </div>
                <div className="d-flex gap-2">
                    <Button variant="outline-secondary" size="sm" className="rounded-pill px-3" onClick={() => fetchData(true)} disabled={refreshing}>
                        <iconify-icon icon="solar:refresh-bold" className={`align-middle ${refreshing ? 'rotate-animation' : ''}`}></iconify-icon>
                    </Button>
                    <Button as={Link} to="/serveur/ventes" variant="primary" className="rounded-pill px-4 shadow-sm">
                        <iconify-icon icon="solar:cart-plus-bold" className="me-2 align-middle"></iconify-icon>
                        Nouvelle Commande
                    </Button>
                </div>
            </div>

            {error && <Alert variant="danger">{error}</Alert>}
            
            <Row className="g-4 mb-4">
                <Col md={4} xs={12}>
                    <Card className="border-0 shadow-sm bg-primary text-white rounded-4">
                        <Card.Body className="p-4">
                            <h6 className="opacity-75">Mes Ventes (Aujourd'hui)</h6>
                            <h2 className="fw-bold mb-0">{stats.total.toLocaleString()} GNF</h2>
                            <small className="opacity-75">{stats.count} tickets validés</small>
                        </Card.Body>
                    </Card>
                </Col>
                <Col md={4} xs={12}>
                    <Card className="border-0 shadow-sm bg-success text-white rounded-4">
                        <Card.Body className="p-4">
                            <h6 className="opacity-75">Mes Pourboires (Session)</h6>
                            <h2 className="fw-bold mb-0">{stats.pourboires.toLocaleString()} GNF</h2>
                            <small className="opacity-75">Accumulés ce jour</small>
                        </Card.Body>
                    </Card>
                </Col>
                <Col md={4} xs={12}>
                    <Card className="border-0 shadow-sm bg-warning text-white rounded-4">
                        <Card.Body className="p-4">
                            <h6 className="opacity-75">Commandes en Attente</h6>
                            <h2 className="fw-bold mb-0">{stats.pending}</h2>
                            <small className="opacity-75">En cours de préparation au bar</small>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
                <Card.Header className="bg-white py-3"><h5 className="mb-0 fw-bold">Activités Récentes</h5></Card.Header>
                <Table hover responsive className="align-middle mb-0">
                    <thead className="bg-light text-center">
                        <tr><th>Heure</th><th>Table</th><th>Articles</th><th className="text-end pe-4">Total</th><th>Statut</th></tr>
                    </thead>
                    <tbody>
                        {groupedActivity.slice(0, 8).map(group => (
                            <tr key={group.id} className={group.isCancelled ? "bg-light text-muted" : ""}>
                                <td className="text-center">{new Date(group.date).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}</td>
                                <td className="text-center"><Badge bg="dark" className="px-3">{group.table || 'N/A'}</Badge></td>
                                <td>
                                    <ul className="list-unstyled mb-0 small">
                                        {group.items.map((item, idx) => (
                                            <li key={idx} className={item.isCancelled ? "text-decoration-line-through" : ""}>
                                                <iconify-icon icon="solar:dot-bold" className="me-1 text-muted"></iconify-icon>
                                                {item.article?.nom || 'Article supprimé'} <Badge bg="light" text="dark" className="ms-1">x{item.quantite}</Badge>
                                            </li>
                                        ))}
                                    </ul>
                                </td>
                                <td className={`fw-bold text-end pe-4 ${group.isCancelled ? '' : 'text-primary'}`}>{group.total.toLocaleString()} GNF</td>
                                <td className="text-center">
                                    {group.statut === 'en_preparation' ? (
                                        <Button variant="success" size="sm" className="rounded-pill shadow-sm animate__animated animate__pulse animate__infinite" onClick={() => { setSelectedOrder(group); setShowPayModal(true); }}>
                                            ENCAISSER
                                        </Button>
                                    ) : (
                                        group.isCancelled ? <Badge bg="danger">ANNULÉE</Badge> : <Badge bg={group.statut === 'finalisee' ? 'success' : 'warning'}>{group.statut.toUpperCase()}</Badge>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {groupedActivity.length === 0 && <tr><td colSpan="5" className="text-center py-4 text-muted">Aucune activité enregistrée.</td></tr>}
                    </tbody>
                </Table>
            </Card>

            {/* Modale d'encaissement pour le serveur (Validation Workflow Étape 3) */}
            <Modal show={showPayModal} onHide={() => setShowPayModal(false)} centered>
                <Modal.Header closeButton className="border-0 pb-0">
                    <Modal.Title className="fw-bold text-primary">Finaliser l'encaissement</Modal.Title>
                </Modal.Header>
                <Modal.Body className="py-4 text-center">
                    <p className="mb-1 text-muted">Confirmez-vous le règlement par le client de la :</p>
                    <h5 className="fw-bold mb-3">Table {selectedOrder?.table || 'N/A'}</h5>
                    <h3 className="text-success fw-bold">{selectedOrder?.total.toLocaleString()} GNF</h3>

                    <div className="mt-4 pt-3 border-top text-start">
                        <Form.Group className="mb-3">
                            <Form.Label className="small fw-bold text-muted">CHOISIR LE MODE DE PAIEMENT</Form.Label>
                            <div className="d-flex flex-wrap gap-2">
                                {['Cash', 'Orange Money', 'MobiCash', 'PayCard', 'Virement'].map(mode => (
                                    <Button
                                        key={mode}
                                        variant={paymentMode === mode ? (mode === 'Cash' ? 'success' : 'primary') : 'outline-secondary'}
                                        size="sm"
                                        className="rounded-pill px-3 fw-bold"
                                        onClick={() => setPaymentMode(mode)}
                                    >
                                        {mode}
                                    </Button>
                                ))}
                            </div>
                        </Form.Group>

                        {activeQrCode && (
                            <div className="text-center my-3 p-3 bg-light rounded-4 animate__animated animate__zoomIn">
                                <h6 className="fw-bold text-dark mb-2">Scanner pour payer via {paymentMode}</h6>
                                {activeAccount && <p className="small text-muted mb-2">Compte: <span className="fw-bold text-primary">{activeAccount}</span></p>}
                                <img 
                                    src={activeQrCode} 
                                    alt={`QR Code ${paymentMode}`} 
                                    className="img-fluid rounded shadow-sm border bg-white" 
                                    style={{ maxHeight: '200px' }} 
                                    onClick={() => {
                                        setFullscreenQrCode(activeQrCode);
                                        setShowQrCodeFullscreenModal(true);
                                    }}
                                    role="button"
                                    aria-label={`Agrandir le QR Code ${paymentMode}`}
                                />
                            </div>
                        )}


                        {['Orange Money', 'MobiCash', 'PayCard', 'Virement'].includes(paymentMode) && (
                            <Form.Group className="mb-3 animate__animated animate__fadeIn">
                                <Form.Label className="small fw-bold text-muted">RÉFÉRENCE DE TRANSACTION</Form.Label>
                                <Form.Control
                                    size="sm"
                                    type="text"
                                    placeholder={`ID de transaction ${paymentMode}`}
                                    value={transactionRef}
                                    onChange={(e) => setTransactionRef(e.target.value)}
                                    className="rounded-pill border-primary"
                                    required
                                />
                            </Form.Group>
                        )}
                    </div>
                </Modal.Body>
                <Modal.Footer className="border-0 justify-content-center pb-4">
                    <Button variant="light" onClick={() => setShowPayModal(false)} className="rounded-pill px-4 fw-bold">Annuler</Button>
                    <Button 
                        variant="success" 
                        onClick={handleFinalizePayment} 
                        className="rounded-pill px-4 shadow-sm fw-bold"
                        disabled={['Orange Money', 'MobiCash', 'PayCard', 'Virement'].includes(paymentMode) && !transactionRef.trim()}
                    >
                        Valider l'encaissement
                    </Button>
                </Modal.Footer>
            </Modal>

            {/* Modale Impression Ticket */}
            <ReceiptModal
                show={showReceiptModal}
                onHide={() => setShowReceiptModal(false)}
                onPrint={handlePrintReceipt}
            />
        </div>
        {/* Modale d'aperçu d'image pour le QR Code */}
        <Modal show={showQrCodeFullscreenModal} onHide={() => setShowQrCodeFullscreenModal(false)} centered size="lg">
            <Modal.Header closeButton>
                <Modal.Title>QR Code {paymentMode}</Modal.Title>
            </Modal.Header>
            <Modal.Body className="text-center bg-light p-4"><img src={fullscreenQrCode} alt="QR Code en plein écran" className="img-fluid rounded shadow" style={{ maxHeight: '80vh' }} /></Modal.Body>
        </Modal>
        </>
    );
};

export default ServeurDashboard;