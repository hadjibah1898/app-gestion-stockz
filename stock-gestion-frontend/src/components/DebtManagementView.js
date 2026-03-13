import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Badge, Card, Form, Modal, Spinner, Tab, Tabs, Alert } from 'react-bootstrap';
import { clientAPI } from '../services/api';

const DebtManagementView = () => {
    const [dettes, setDettes] = useState([]);
    const [encaissementsAValider, setEncaissementsAValider] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    
    const [showPayModal, setShowPayModal] = useState(false);
    const [selectedDebt, setSelectedDebt] = useState(null);
    const [amount, setAmount] = useState('');
    const [submitLoading, setSubmitLoading] = useState(false);

    const userRole = localStorage.getItem('userRole');
    const isAdmin = userRole === 'Admin';

    const loadData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const promises = [clientAPI.getDebts()];

            if (isAdmin) promises.push(clientAPI.getPendingDebtPayments());

            const [dettesRes, validationsRes] = await Promise.all(promises);

            setDettes(dettesRes.data);
            if (isAdmin) setEncaissementsAValider(validationsRes?.data || []);


        } catch (err) {
            setError(err.response?.data?.message || "Erreur lors du chargement des données.");
        } finally {
            setLoading(false);
        }
    }, [isAdmin]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handlePayment = async (e) => {
        e.preventDefault();
        setSubmitLoading(true);
        setError('');
        setSuccess('');
        try {
            await clientAPI.payDette(selectedDebt._id, { montant: Number(amount) });
            setShowPayModal(false);
            setAmount('');
            setSuccess("Paiement enregistré ! En attente de validation par l'administrateur.");
            loadData(); // Recharger les données
            setTimeout(() => setSuccess(''), 4000);
        } catch (err) {
            setError(err.response?.data?.message || "Erreur lors de l'enregistrement du paiement.");
        } finally {
            setSubmitLoading(false);
        }
    };

    const sendWhatsApp = (dette) => {
        const message = `Bonjour ${dette.nom}, nous vous rappelons qu'il reste un solde de ${dette.dette.toLocaleString()} GNF à régler. Merci de votre confiance.`;
        window.open(`https://wa.me/${dette.telephone}?text=${encodeURIComponent(message)}`);
    };

    const validatePayment = async (payId) => {
        if (window.confirm("Confirmez-vous avoir reçu cet argent en caisse ? Cette action est irréversible.")) {
            try {
                await clientAPI.validateDebtPayment(payId);
                setSuccess("Paiement validé avec succès.");
                loadData();
                setTimeout(() => setSuccess(''), 4000);
            } catch (err) {
                setError(err.response?.data?.message || "Erreur de validation");
            }
        }
    };

    const getEcheanceBadge = (date) => {
        if (!date) return null;
        const echeance = new Date(date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diffTime = echeance - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return <Badge bg="danger">Dépassée</Badge>;
        if (diffDays <= 7) return <Badge bg="warning" text="dark">Moins de 7j</Badge>;
        return <Badge bg="info">{echeance.toLocaleDateString()}</Badge>;
    };

    return (
        <div className="p-4">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h3 className="fw-bold mb-0">
                    <iconify-icon icon="solar:wallet-money-bold-duotone" className="me-2 text-primary"></iconify-icon>
                    {isAdmin ? "Contrôle des Créances" : "Gestion des Dettes"}
                </h3>
                <Button variant="outline-primary" onClick={loadData} disabled={loading}>
                    <iconify-icon icon="solar:refresh-bold" className="me-2"></iconify-icon>
                    Actualiser
                </Button>
            </div>

            {error && <Alert variant="danger" onClose={() => setError('')} dismissible>{error}</Alert>}
            {success && <Alert variant="success" onClose={() => setSuccess('')} dismissible>{success}</Alert>}

            <Tabs defaultActiveKey="list" id="debt-management-tabs" className="mb-3 nav-tabs-custom">
                <Tab eventKey="list" title="Liste des Dettes">
                    <Card className="border-0 shadow-sm rounded-4">
                        <Card.Body className="p-0">
                            <Table responsive hover className="align-middle mb-0">
                                <thead className="bg-light">
                                    <tr>
                                        <th className="ps-4">Client</th>
                                        <th>Reste à Payer</th>
                                        <th>Échéance</th>
                                        <th className="pe-4 text-end">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan="4" className="text-center py-5"><Spinner animation="border" /></td></tr>
                                    ) : dettes.length > 0 ? dettes.map(d => (
                                        <tr key={d._id}>
                                            <td className="ps-4">
                                                <div className="fw-bold">{d.nom}</div>
                                                <small className="text-muted">{d.telephone}</small>
                                            </td>
                                            <td className="text-danger fw-bold">{d.dette.toLocaleString()} GNF</td>
                                            <td>{getEcheanceBadge(d.echeanceDette)}</td>
                                            <td className="pe-4 text-end">
                                                {!isAdmin && (
                                                    <Button variant="success" size="sm" className="me-2" onClick={() => { setSelectedDebt(d); setShowPayModal(true); }}>
                                                        <iconify-icon icon="solar:money-bag-bold" className="me-1"></iconify-icon>
                                                        Encaisser
                                                    </Button>
                                                )}
                                                <Button variant="info" size="sm" onClick={() => sendWhatsApp(d)} className="text-white">
                                                    <iconify-icon icon="logos:whatsapp-icon" className="me-1"></iconify-icon>
                                                    Rappel
                                                </Button>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr><td colSpan="4" className="text-center text-muted py-5">Aucune dette en cours.</td></tr>
                                    )}
                                </tbody>
                            </Table>
                        </Card.Body>
                    </Card>
                </Tab>

                {isAdmin && (
                    <Tab eventKey="validation" title={
                        <span className="d-flex align-items-center">
                            <iconify-icon icon="solar:check-circle-bold" className="me-2"></iconify-icon>
                            Validations en attente
                            {encaissementsAValider.length > 0 && <Badge pill bg="warning" text="dark" className="ms-2">{encaissementsAValider.length}</Badge>}
                        </span>
                    }>
                        <Card className="border-0 shadow-sm rounded-4">
                            <Card.Body>
                                <Alert variant="info" className="small">
                                    Validez ces montants dès que vous récupérez l'argent physique auprès du gérant. La validation mettra à jour la dette du client.
                                </Alert>
                                <Table responsive hover>
                                    <thead className="bg-light">
                                        <tr>
                                            <th>Date Encaissement</th>
                                            <th>Client</th>
                                            <th>Montant</th>
                                            <th>Gérant / Boutique</th>
                                            <th className="text-end">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading ? (
                                            <tr><td colSpan="5" className="text-center py-5"><Spinner animation="border" /></td></tr>
                                        ) : encaissementsAValider.length > 0 ? encaissementsAValider.map(p => (
                                            <tr key={p._id}>
                                                <td>{new Date(p.datePaiement).toLocaleString('fr-FR')}</td>
                                                <td>{p.client?.nom || 'Client supprimé'}</td>
                                                <td className="fw-bold text-success">{p.montant.toLocaleString()} GNF</td>
                                                <td>
                                                    <div>{p.gerant?.nom || 'Gérant supprimé'}</div>
                                                    <small className="text-muted">{p.boutique?.nom || 'Boutique supprimée'}</small>
                                                </td>
                                                <td className="text-end">
                                                    <Button variant="primary" size="sm" onClick={() => validatePayment(p._id)}>
                                                        Confirmer Réception
                                                    </Button>
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr><td colSpan="5" className="text-center text-muted py-5">Aucun encaissement à valider.</td></tr>
                                        )}
                                    </tbody>
                                </Table>
                            </Card.Body>
                        </Card>
                    </Tab>
                )}
            </Tabs>

            <Modal show={showPayModal} onHide={() => setShowPayModal(false)} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Encaisser un versement</Modal.Title>
                </Modal.Header>
                <Form onSubmit={handlePayment}>
                    <Modal.Body>
                        <p>Client: <strong className="text-primary">{selectedDebt?.nom}</strong></p>
                        <p>Dette actuelle: <strong className="text-danger">{selectedDebt?.dette.toLocaleString()} GNF</strong></p>
                        <Form.Group>
                            <Form.Label>Montant versé</Form.Label>
                            <Form.Control
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="Entrez le montant en GNF"
                                required
                                min="1"
                                max={selectedDebt?.dette}
                                autoFocus
                            />
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowPayModal(false)} disabled={submitLoading}>Annuler</Button>
                        <Button variant="primary" type="submit" disabled={submitLoading}>
                            {submitLoading ? <Spinner as="span" size="sm" /> : 'Enregistrer le versement'}
                        </Button>
                    </Modal.Footer>
                </Form>
            </Modal>
        </div>
    );
};

export default DebtManagementView;