import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Badge, Card, Form, Modal, Spinner, Tab, Tabs, Alert, Pagination } from 'react-bootstrap';
import { clientAPI } from '../services/api';
import jsPDF from 'jspdf';

const DebtManagementView = () => {
    const [dettes, setDettes] = useState([]);
    const [encaissementsAValider, setEncaissementsAValider] = useState([]);
    const [paiementsEnAttenteMap, setPaiementsEnAttenteMap] = useState({}); // Map clientID -> montant
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    
    const [showPayModal, setShowPayModal] = useState(false);
    const [selectedDebt, setSelectedDebt] = useState(null);
    const [amount, setAmount] = useState('');
    const [submitLoading, setSubmitLoading] = useState(false);
    const [lastPayment, setLastPayment] = useState(null);

    // --- Nouveaux états pour la modale de confirmation moderne ---
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [actionConfig, setActionConfig] = useState({ type: '', id: '', title: '', message: '', variant: '' });

    const userRole = localStorage.getItem('userRole');
    const isAdmin = userRole === 'Admin';

    const loadData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            // Utilisation de Promise.all pour charger toutes les données en parallèle pour une meilleure performance
            const [dettesRes, validationsRes, historyRes] = await Promise.all([
                clientAPI.getDebts(),
                clientAPI.getPendingDebtPayments().catch(err => {
                    console.warn("Info: Impossible de charger les paiements en attente (Accès restreint ou erreur)", err);
                    return { data: [] }; // Retourner des données vides pour ne pas bloquer les autres requêtes
                }),
                clientAPI.getDebtHistory().catch(err => {
                    console.error("Erreur chargement historique des paiements:", err);
                    return { data: [] }; // Retourner des données vides en cas d'erreur
                })
            ]);

            setDettes(dettesRes.data);
            
            const pendingPayments = validationsRes.data || [];
            const historicalPayments = historyRes.data || [];

            // Création d'une source de vérité unique pour l'historique en combinant les paiements
            // en attente et l'historique reçu, pour pallier les éventuels décalages de la base de données.
            const allPaymentsMap = new Map();
            // On ajoute d'abord l'historique
            historicalPayments.forEach(p => allPaymentsMap.set(p._id, p));
            // Ensuite, on ajoute ou met à jour avec les paiements en attente, qui sont les plus récents.
            pendingPayments.forEach(p => allPaymentsMap.set(p._id, p));

            const combinedHistory = Array.from(allPaymentsMap.values());

            const sortedHistory = combinedHistory.sort((a, b) => {
                return new Date(b.datePaiement || b.createdAt) - new Date(a.datePaiement || a.createdAt);
            });
            setHistory(sortedHistory);
            
            setEncaissementsAValider(pendingPayments);
            
            // Calculer la somme des paiements en attente par client pour déduction logique
            const pendingMap = {};
            pendingPayments.forEach(p => {
                if (p.client && p.client._id) {
                    pendingMap[p.client._id] = (pendingMap[p.client._id] || 0) + p.montant;
                }
            });
            setPaiementsEnAttenteMap(pendingMap);

        } catch (err) {
            console.error("Erreur critique lors du chargement des dettes:", err);
            setError(err.response?.data?.message || "Erreur lors du chargement des données principales.");
        } finally {
            setLoading(false);
        }
    }, []); // Plus de dépendance à isAdmin car la logique est globale

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handlePayment = async (e) => {
        e.preventDefault();
        setSubmitLoading(true);
        setError('');
        setSuccess('');
        try {
            const montantPaye = Number(amount);
            await clientAPI.payDette(selectedDebt._id, { montant: montantPaye });
            setShowPayModal(false);
            setAmount('');
            
            // Mise à jour optimiste locale pour éviter d'attendre le reload
            const newPendingMap = { ...paiementsEnAttenteMap };
            newPendingMap[selectedDebt._id] = (newPendingMap[selectedDebt._id] || 0) + montantPaye;
            setPaiementsEnAttenteMap(newPendingMap);

            // 1. Stocker les infos AVANT d'afficher le succès pour garantir que le bouton s'affiche
            // Le reste à payer sur le ticket tient compte de ce nouveau paiement
            setLastPayment({
                clientName: selectedDebt.nom,
                amount: amount,
                oldDebt: selectedDebt.dette - (paiementsEnAttenteMap[selectedDebt._id] || 0) // On base le reçu sur la dette réelle visible
            });
            
            setSuccess("Paiement enregistré ! En attente de validation par l'administrateur.");
            loadData(); // Recharger les données
            
            // Note : J'ai retiré le setTimeout ici pour que le bouton "Télécharger" reste visible
            // jusqu'à ce que vous fermiez manuellement l'alerte.
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

    const generateReceipt = (payment) => {
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: [80, 120] // Format ticket de caisse (80mm)
        });

        // --- CONFIGURATION LOGO ---
        // Pour ajouter votre logo :
        // 1. Convertissez votre image en Base64 sur un site comme https://www.base64-image.de/
        // 2. Collez le code obtenu ci-dessous à la place de la chaîne vide ""
        const logoBase64 = ""; // Ex: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg..."

        if (logoBase64) {
            try {
                // x=25, y=2, largeur=30, hauteur=20 (Ajustez selon votre logo)
                doc.addImage(logoBase64, 'PNG', 25, 2, 30, 20);
            } catch (e) {
                console.error("Erreur lors de l'ajout du logo", e);
            }
        }

        doc.setFontSize(14);
        // J'ai décalé le texte vers le bas (y=25) pour laisser la place au logo
        doc.text("RECU DE PAIEMENT", 40, 25, { align: 'center' });
        
        doc.setFontSize(10);
        doc.text(`Date: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 5, 35);
        doc.text("------------------------------------------------", 5, 40);
        
        doc.text(`Client:`, 5, 50);
        doc.setFontSize(12);
        doc.text(`${payment.clientName}`, 5, 56);

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        
        doc.text(`Montant Versé:`, 5, 66);
        doc.setFont("helvetica", "bold");
        // NOTE: La locale 'fr-FR' utilise un espace insécable que les polices PDF standard
        // de jsPDF ne gèrent pas bien. On le remplace par un espace normal pour éviter les problèmes d'affichage.
        doc.text(`${parseFloat(payment.amount).toLocaleString('fr-FR').replace(/\s/g, ' ')} GNF`, 75, 66, { align: 'right' });
        
        doc.setFont("helvetica", "normal");
        doc.text(`Reste à payer:`, 5, 76);
        doc.setFont("helvetica", "bold");
        doc.text(`${(payment.oldDebt - parseFloat(payment.amount)).toLocaleString('fr-FR').replace(/\s/g, ' ')} GNF`, 75, 76, { align: 'right' });

        doc.setFont("helvetica", "normal");
        doc.text("------------------------------------------------", 5, 86);
        doc.setFontSize(8);
        doc.text("Signature & Cachet", 40, 92, { align: 'center' });
        
        doc.save(`recu_${payment.clientName.replace(/\s+/g, '_')}_${Date.now()}.pdf`);
    };

    // --- Fonctions Modernisées pour remplacer window.confirm ---
    
    const openValidateModal = (payId) => {
        setActionConfig({
            type: 'VALIDATE',
            id: payId,
            title: 'Valider le paiement',
            message: 'Confirmez-vous avoir reçu physiquement cet argent ? Le montant sera ajouté à votre Caisse Centrale et la dette du client sera réduite. Cette action est irréversible.',
            variant: 'success',
            btnLabel: 'Oui, Valider',
            icon: 'solar:check-circle-bold-duotone'
        });
        setShowConfirmModal(true);
    };

    const openRejectModal = (payId) => {
        setActionConfig({
            type: 'REJECT',
            id: payId,
            title: 'Rejeter le paiement',
            message: 'Voulez-vous vraiment rejeter ce paiement ? Il passera en statut "REJETÉ" et ne sera pas comptabilisé. Utilisez ceci en cas d\'erreur de saisie.',
            variant: 'danger',
            btnLabel: 'Oui, Rejeter',
            icon: 'solar:trash-bin-trash-bold-duotone'
        });
        setShowConfirmModal(true);
    };

    const handleConfirmAction = async () => {
        setShowConfirmModal(false);
        const { type, id } = actionConfig;
        
        try {
            if (type === 'VALIDATE') {
                await clientAPI.validateDebtPayment(id);
                setSuccess("Paiement validé avec succès.");
            } else if (type === 'REJECT') {
                await clientAPI.rejectDebtPayment(id);
                setSuccess("Paiement rejeté.");
            }
            loadData();
            setTimeout(() => setSuccess(''), 4000);
        } catch (err) {
            setError(err.response?.data?.message || "Erreur lors de l'opération");
            loadData();
        }
    };

    const getStatusBadge = (date) => {
        if (!date) return <Badge bg="secondary">Non définie</Badge>;
        const echeance = new Date(date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diffTime = echeance - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return <Badge bg="danger">En Retard</Badge>;
        if (diffDays <= 7) return <Badge bg="warning" text="dark">Urgent</Badge>;
        return <Badge bg="success">En Cours</Badge>;
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
            {success && (
                <Alert variant="success" onClose={() => setSuccess('')} dismissible>
                    <div className="d-flex justify-content-between align-items-center">
                        <span>{success}</span>
                        {lastPayment && (
                            <Button variant="outline-success" size="sm" onClick={() => generateReceipt(lastPayment)}>
                                <iconify-icon icon="solar:printer-bold" className="me-1"></iconify-icon>
                                Télécharger le Reçu
                            </Button>
                        )}
                    </div>
                </Alert>
            )}

            <Tabs defaultActiveKey="list" id="debt-management-tabs" className="mb-3 nav-tabs-custom">
                <Tab eventKey="list" title="Liste des Dettes">
                    <Card className="border-0 shadow-sm rounded-4">
                        <Card.Body className="p-0">
                            <Table responsive hover className="align-middle mb-0">
                                <thead className="bg-light">
                                    <tr>
                                        <th className="ps-4">Client</th>
                                        <th>Dette Comptable</th>
                                        <th>En Attente Validation</th>
                                        <th>Reste à Payer (Net)</th>
                                        <th>Échéance</th>
                                        <th>Statut</th>
                                        <th className="pe-4 text-end">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading && dettes.length === 0 ? (
                                        <tr><td colSpan="4" className="text-center py-5"><Spinner animation="border" /></td></tr>
                                    ) : dettes.length > 0 ? dettes.map(d => {
                                        const montantEnAttente = paiementsEnAttenteMap[d._id] || 0;
                                        const resteAPayerReel = d.dette - montantEnAttente;
                                        
                                        return (
                                            <tr key={d._id}>
                                                <td className="ps-4">
                                                    <div className="fw-bold">{d.nom}</div>
                                                    <small className="text-muted">{d.telephone}</small>
                                                </td>
                                                <td className="text-muted">{d.dette.toLocaleString()} GNF</td>
                                                <td className="text-warning fw-bold">
                                                    {montantEnAttente > 0 ? (
                                                        <span>
                                                            <iconify-icon icon="solar:hourglass-line-bold" className="me-1 align-middle"></iconify-icon>
                                                            -{montantEnAttente.toLocaleString()} GNF
                                                        </span>
                                                    ) : '-'}
                                                </td>
                                                <td className="text-danger fw-bold fs-6">{resteAPayerReel.toLocaleString()} GNF</td>
                                                <td>{d.echeanceDette ? new Date(d.echeanceDette).toLocaleDateString() : '-'}</td>
                                                <td>{getStatusBadge(d.echeanceDette)}</td>
                                                <td className="pe-4 text-end">
                                                    {!isAdmin && resteAPayerReel > 0 && (
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
                                        );
                                    }) : (
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
                                        <th>Dette Actuelle</th>
                                            <th>Montant</th>
                                        <th>Reste à Payer (Est.)</th>
                                            <th>Gérant / Boutique</th>
                                            <th className="text-end">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading ? (
                                            <tr><td colSpan="5" className="text-center py-5"><Spinner animation="border" /></td></tr>
                                        ) : encaissementsAValider.length > 0 ? encaissementsAValider.map(p => {
                                            const datePaiement = p.datePaiement ? new Date(p.datePaiement).toLocaleString('fr-FR') : <span className="text-danger fw-bold">Date Manquante</span>;
                                        const detteActuelle = p.client?.dette || 0;
                                        const restePrevisionnel = detteActuelle - (p.montant || 0);
                                        
                                            return (
                                                <tr key={p._id}>
                                                    <td>{datePaiement}</td>
                                                    <td>{p.client?.nom || 'Client supprimé'}</td>
                                                <td className="text-muted">{detteActuelle.toLocaleString()} GNF</td>
                                                    <td className="fw-bold text-success">{p.montant.toLocaleString()} GNF</td>
                                                <td className="fw-bold text-primary">{restePrevisionnel.toLocaleString()} GNF</td>
                                                    <td>
                                                        <div>{p.gerant?.nom || 'Gérant supprimé'}</div>
                                                        <small className="text-muted">{p.boutique?.nom || 'Boutique supprimée'}</small>
                                                    </td>
                                                    <td className="text-end">
                                                        <Button variant="success" size="sm" onClick={() => openValidateModal(p._id)} className="me-2" title="Valider">
                                                            <iconify-icon icon="solar:check-circle-bold" className="me-1"></iconify-icon>
                                                            Valider
                                                        </Button>
                                                        <Button variant="danger" size="sm" onClick={() => openRejectModal(p._id)} title="Rejeter / Annuler">
                                                            <iconify-icon icon="solar:trash-bin-trash-bold"></iconify-icon>
                                                        </Button>
                                                    </td>
                                                </tr>
                                            );
                                        }) : (
                                        <tr><td colSpan="7" className="text-center text-muted py-5">Aucun encaissement à valider.</td></tr>
                                        )}
                                    </tbody>
                                </Table>
                            </Card.Body>
                        </Card>
                    </Tab>
                )}

                <Tab eventKey="history" title={
                    <span className="d-flex align-items-center">
                        <iconify-icon icon="solar:history-bold" className="me-2"></iconify-icon>
                        Historique des Paiements
                    </span>
                }>
                    <DebtHistoryTab history={history} loading={loading} />
                </Tab>
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

            {/* Modale de Confirmation Moderne (Validation / Rejet) */}
            <Modal show={showConfirmModal} onHide={() => setShowConfirmModal(false)} centered>
                <Modal.Header closeButton className={`bg-${actionConfig.variant}-subtle text-${actionConfig.variant}`}>
                    <Modal.Title className="fw-bold">
                        {actionConfig.title}
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body className="text-center py-4">
                    <iconify-icon icon={actionConfig.icon} style={{ fontSize: '64px' }} className={`text-${actionConfig.variant} mb-3`}></iconify-icon>
                    <p className="fs-5">{actionConfig.message}</p>
                </Modal.Body>
                <Modal.Footer className="justify-content-center">
                    <Button variant="secondary" onClick={() => setShowConfirmModal(false)} className="rounded-pill px-4">
                        Annuler
                    </Button>
                    <Button variant={actionConfig.variant} onClick={handleConfirmAction} className="rounded-pill px-4 shadow-sm">
                        {actionConfig.btnLabel}
                    </Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

const DebtHistoryTab = ({ history, loading }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const itemsPerPage = 10;

    // Revenir à la première page si la liste change ou si on lance une recherche
    useEffect(() => {
        setCurrentPage(1);
    }, [history, searchTerm]);

    const getStatusBadge = (status) => {
        if (status === 'VALIDEE') {
            return <Badge bg="success">Validé</Badge>;
        }
        if (status === 'REJETEE') {
            return <Badge bg="danger">Rejeté</Badge>;
        }
        return <Badge bg="warning" text="dark">En attente</Badge>;
    };

    const exportToPDF = () => {
        const doc = new jsPDF();
        
        // Titre
        doc.setFontSize(18);
        doc.text("Historique des Paiements", 14, 20);
        
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Généré le : ${new Date().toLocaleString('fr-FR')}`, 14, 28);
        
        // En-têtes du tableau manuel
        let y = 40;
        doc.setFontSize(11);
        doc.setTextColor(0);
        doc.setFont("helvetica", "bold");
        
        doc.text("Date", 14, y);
        doc.text("Client", 50, y);
        doc.text("Montant", 110, y);
        doc.text("Statut", 150, y);
        
        // Ligne de séparation
        doc.line(14, y + 2, 196, y + 2);
        y += 10;
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);

        filteredHistory.forEach(p => {
            // Gestion du saut de page
            if (y > 280) {
                doc.addPage();
                y = 20;
            }
            
            const date = p.datePaiement ? new Date(p.datePaiement).toLocaleDateString('fr-FR') : '-';
            const client = p.client?.nom || 'Client inconnu';
            const montant = (p.montant || 0).toLocaleString('fr-FR').replace(/\s/g, ' ') + ' GNF';
            const statut = p.statut === 'VALIDEE' ? 'Validé' : (p.statut === 'REJETEE' ? 'Rejeté' : 'En attente');
            
            doc.text(date, 14, y);
            doc.text(client.substring(0, 25), 50, y); // Tronquer si trop long
            doc.text(montant, 110, y);
            doc.text(statut, 150, y);
            
            y += 8;
        });
        
        doc.save(`historique_paiements_${new Date().toISOString().slice(0,10)}.pdf`);
    };

    // Filtrage dynamique par nom de client
    const filteredHistory = history.filter(p => 
        (p.client?.nom || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Calculs pour la pagination
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentItems = filteredHistory.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);

    return (
        <Card className="border-0 shadow-sm rounded-4">
            <Card.Body>
                <div className="d-flex justify-content-between align-items-center mb-3 gap-3">
                    <Form.Control
                        type="text"
                        placeholder="Rechercher par nom de client..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="flex-grow-1"
                    />
                    <Button variant="outline-danger" onClick={exportToPDF} disabled={loading || filteredHistory.length === 0}>
                        <iconify-icon icon="solar:file-pdf-bold" className="me-2"></iconify-icon>
                        Exporter PDF
                    </Button>
                </div>
                <Table responsive hover>
                    <thead className="bg-light">
                        <tr>
                            <th>Date Versement</th>
                            <th>Client</th>
                            <th>Dette Actuelle</th>
                            <th>Montant</th>
                            <th>Statut</th>
                            <th>Encaissé par</th>
                            <th>Validé le</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="6" className="text-center py-5"><Spinner /></td></tr>
                        ) : currentItems.length > 0 ? currentItems.map(p => {
                            const datePaiement = p.datePaiement ? new Date(p.datePaiement).toLocaleString('fr-FR') : <span className="text-danger fw-bold">Date Manquante</span>;
                            const dateValidation = p.dateValidation ? new Date(p.dateValidation).toLocaleString('fr-FR') : '-';
                            const detteActuelle = p.client?.dette || 0;
                            return (
                                <tr key={p._id}>
                                    <td>{datePaiement}</td>
                                    <td>{p.client?.nom || <span className="text-muted">Client supprimé</span>}</td>
                                    <td className="text-muted">{detteActuelle.toLocaleString()} GNF</td>
                                    <td className="fw-bold">{p.montant.toLocaleString()} GNF</td>
                                    <td>{getStatusBadge(p.statut)}</td>
                                    <td>{p.gerant?.nom || <span className="text-muted">N/A</span>}</td>
                                    <td>{dateValidation}</td>
                                </tr>
                            );
                        }) : (
                            <tr><td colSpan="7" className="text-center text-muted py-5">Aucun paiement trouvé pour cette recherche.</td></tr>
                        )}
                    </tbody>
                </Table>

                {/* Contrôles de Pagination */}
                {!loading && filteredHistory.length > itemsPerPage && (
                    <div className="d-flex justify-content-center mt-3">
                        <Pagination>
                            <Pagination.First onClick={() => setCurrentPage(1)} disabled={currentPage === 1} />
                            <Pagination.Prev onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} />
                            <Pagination.Item active>{currentPage} / {totalPages}</Pagination.Item>
                            <Pagination.Next onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} />
                            <Pagination.Last onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} />
                        </Pagination>
                    </div>
                )}
            </Card.Body>
        </Card>
    );
};

export default DebtManagementView;