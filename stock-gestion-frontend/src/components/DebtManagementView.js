import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Badge, Card, Form, Modal, Spinner, Tab, Tabs, Alert, Pagination } from 'react-bootstrap';
import { clientAPI } from '../services/api';
import XLSX from 'xlsx-js-style';
import jsPDF from 'jspdf';
import logo from '../assets/logo.png';


const DebtManagementView = () => {
    const [dettes, setDettes] = useState([]);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    
    const [showPayModal, setShowPayModal] = useState(false);
    const [selectedDebt, setSelectedDebt] = useState(null);
    const [amount, setAmount] = useState('');
    const [modePaiement, setModePaiement] = useState('Cash');
    const [transactionRef, setTransactionRef] = useState('');
    const [submitLoading, setSubmitLoading] = useState(false);
    const [lastPayment, setLastPayment] = useState(null);
    const [emailLoading, setEmailLoading] = useState(false);

    const userRole = localStorage.getItem('userRole');
    const isAdmin = userRole === 'Admin';

    const loadData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [dettesRes, historyRes] = await Promise.all([
                clientAPI.getDebts(),
                clientAPI.getDebtHistory().catch(err => {
                    console.error("Erreur chargement historique des paiements:", err);
                    return { data: [] }; // Retourner des données vides en cas d'erreur
                })
            ]);

            setDettes(dettesRes.data);

            const sortedHistory = (historyRes.data || []).sort((a, b) => {
                return new Date(b.datePaiement || b.createdAt) - new Date(a.datePaiement || a.createdAt);
            });
            setHistory(sortedHistory);

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

        // Validation : Référence obligatoire pour Orange Money
        if (modePaiement === 'Orange Money' && !transactionRef.trim()) {
            setError("La référence de transaction est obligatoire pour un paiement Orange Money.");
            setSubmitLoading(false);
            return;
        }

        try {
            const montantPaye = Number(amount);
            const res = await clientAPI.payDette(selectedDebt._id, { montant: montantPaye, modePaiement, transactionRef });
            setShowPayModal(false);
            setAmount('');
            setModePaiement('Cash');
            setTransactionRef('');
            
            setLastPayment({
                id: res.data.paiement?._id,
                clientEmail: selectedDebt.email,
                clientName: selectedDebt.nom,
                amount: amount,
                oldDebt: selectedDebt.dette,
                modePaiement: modePaiement,
                transactionRef: transactionRef
            });
            
            setSuccess("Paiement encaissé avec succès ! Le solde du client et votre caisse ont été mis à jour.");
            loadData(); // Recharger les données
            
            // Note : J'ai retiré le setTimeout ici pour que le bouton "Télécharger" reste visible
            // jusqu'à ce que vous fermiez manuellement l'alerte.
        } catch (err) {
            setError(err.response?.data?.message || "Erreur lors de l'enregistrement du paiement.");
        } finally {
            setSubmitLoading(false);
        }
    };

    const handleSendEmailReceipt = async (paymentId) => {
        if (!paymentId) return;
        setEmailLoading(true);
        try {
            await clientAPI.sendReceiptEmail(paymentId);
            setSuccess("Le reçu a été envoyé par email au client.");
            setTimeout(() => setSuccess(''), 5000);
        } catch (err) {
            setError(err.response?.data?.message || "Erreur lors de l'envoi de l'email.");
        } finally {
            setEmailLoading(false);
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
            format: [80, 140] // Hauteur augmentée pour accommoder les nouvelles infos
        });

        // --- LOGO ---
        try {
            doc.addImage(logo, 'PNG', 25, 5, 30, 10);
        } catch (e) {
            console.error("Erreur lors de l'ajout du logo", e);
        }

        doc.setFontSize(14);
        doc.text("RECU DE PAIEMENT", 40, 22, { align: 'center' });
        
        doc.setFontSize(10);
        doc.text(`Date: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 5, 30);
        doc.text("------------------------------------------------", 5, 35);
        
        doc.text(`Client:`, 5, 42);
        doc.setFontSize(12);
        doc.text(`${payment.clientName}`, 5, 48);

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        
        doc.text(`Montant Versé:`, 5, 58);
        doc.setFont("helvetica", "bold");
        doc.text(`${parseFloat(payment.amount).toLocaleString('fr-FR').replace(/\s/g, ' ')} GNF`, 75, 58, { align: 'right' });
        
        doc.setFont("helvetica", "normal");
        doc.text(`Mode de Paiement:`, 5, 66);
        doc.setFont("helvetica", "bold");
        doc.text(`${payment.modePaiement}`, 75, 66, { align: 'right' });

        if (payment.transactionRef) {
            doc.setFont("helvetica", "normal");
            doc.text(`Réf. Transaction:`, 5, 74);
            doc.setFont("helvetica", "bold");
            doc.text(`${payment.transactionRef}`, 75, 74, { align: 'right' });
        }

        const nextY = payment.transactionRef ? 82 : 74;

        doc.setFont("helvetica", "normal");
        doc.text(`Reste à payer:`, 5, nextY);
        doc.setFont("helvetica", "bold");
        doc.text(`${(payment.oldDebt - parseFloat(payment.amount)).toLocaleString('fr-FR').replace(/\s/g, ' ')} GNF`, 75, nextY, { align: 'right' });

        doc.setFont("helvetica", "normal");
        doc.text("------------------------------------------------", 5, nextY + 10);
        doc.setFontSize(8);
        doc.text("Signature & Cachet", 40, nextY + 16, { align: 'center' });
        
        doc.save(`recu_${payment.clientName.replace(/\s+/g, '_')}_${Date.now()}.pdf`);
    };

    const handleExportExcel = () => {
        const dataToExport = dettes.map(d => ({
            'Client': d.nom,
            'Téléphone': d.telephone || '-',
            'Dette Totale (GNF)': d.dette,
            'Échéance': d.echeanceDette ? new Date(d.echeanceDette).toLocaleDateString() : '-',
            'Statut': new Date(d.echeanceDette) < new Date() ? 'En retard' : 'OK'
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Dettes_Clients");
        XLSX.writeFile(workbook, `etat_creances_${new Date().toISOString().split('T')[0]}.xlsx`);
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
                <div className="d-flex gap-2">
                    <Button variant="outline-success" onClick={handleExportExcel} disabled={loading}>
                        <iconify-icon icon="solar:file-spreadsheet-bold" className="me-2"></iconify-icon>
                        Excel
                    </Button>
                    <Button variant="outline-primary" onClick={loadData} disabled={loading}>
                        <iconify-icon icon="solar:refresh-bold" className="me-2"></iconify-icon>
                        Actualiser
                    </Button>
                </div>
            </div>

            {error && <Alert variant="danger" onClose={() => setError('')} dismissible>{error}</Alert>}
            {success && (
                <Alert variant="success" onClose={() => { setSuccess(''); setLastPayment(null); }} dismissible>
                    <div className="d-flex justify-content-between align-items-center">
                        <span>{success}</span>
                        <div className="d-flex gap-2">
                        {lastPayment && (
                            <Button variant="outline-success" size="sm" onClick={() => generateReceipt(lastPayment)}>
                                <iconify-icon icon="solar:printer-bold" className="me-1"></iconify-icon>
                                Télécharger le Reçu (Gérant)
                            </Button>
                        )}
                        {lastPayment?.id && lastPayment.clientEmail && (
                            <Button variant="outline-primary" size="sm" onClick={() => handleSendEmailReceipt(lastPayment.id)} disabled={emailLoading}>
                                {emailLoading ? <Spinner size="sm" /> : <><iconify-icon icon="solar:letter-bold" className="me-1"></iconify-icon> Envoyer par Email</>}
                            </Button>
                        )}
                        </div>
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
                                        <th>Montant de la Dette</th>
                                        <th>Échéance</th>
                                        <th>Statut</th>
                                        <th className="pe-4 text-end">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading && dettes.length === 0 ? (
                                        <tr><td colSpan="4" className="text-center py-5"><Spinner animation="border" /></td></tr>
                                    ) : dettes.length > 0 ? dettes.map(d => (
                                            <tr key={d._id}>
                                                <td className="ps-4">
                                                    <div className="fw-bold">{d.nom}</div>
                                                    <small className="text-muted">{d.telephone}</small>
                                                </td>
                                                <td className="text-danger fw-bold fs-6">{d.dette.toLocaleString()} GNF</td>
                                                <td>{d.echeanceDette ? new Date(d.echeanceDette).toLocaleDateString() : '-'}</td>
                                                <td>{getStatusBadge(d.echeanceDette)}</td>
                                                <td className="pe-4 text-end">
                                                    {!isAdmin && d.dette > 0 && (
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

                <Tab eventKey="history" title={
                    <span className="d-flex align-items-center">
                        <iconify-icon icon="solar:history-bold" className="me-2"></iconify-icon>
                        Historique des Paiements
                    </span>
                }>
                    <DebtHistoryTab history={history} loading={loading} onSendEmail={handleSendEmailReceipt} emailLoading={emailLoading} />
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
                        <Form.Group className="mb-3">
                            <Form.Label>Mode de paiement</Form.Label>
                            <Form.Select 
                                value={modePaiement} 
                                onChange={(e) => setModePaiement(e.target.value)}
                                className="rounded-pill"
                            >
                                <option value="Cash">💵 Espèces (Cash)</option>
                                <option value="Orange Money">🍊 Orange Money</option>
                                <option value="MobiCash">🟡 MobiCash (MTN)</option>
                                <option value="PayCard">💳 PayCard</option>
                                <option value="Virement">🏦 Virement Bancaire</option>
                            </Form.Select>
                        </Form.Group>
                        {['Orange Money', 'MobiCash', 'PayCard', 'Virement'].includes(modePaiement) && (
                            <Form.Group className="mb-3">
                                <Form.Label>Réf. Transaction {modePaiement === 'Orange Money' && <span className="text-danger">*</span>}</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={transactionRef}
                                    onChange={(e) => setTransactionRef(e.target.value)}
                                    placeholder={`ID transaction ${modePaiement}`}
                                    required={modePaiement === 'Orange Money'}
                                    className="rounded-pill"
                                />
                            </Form.Group>
                        )}
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

const DebtHistoryTab = ({ history, loading, onSendEmail, emailLoading }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterMode, setFilterMode] = useState('all');
    const itemsPerPage = 10;

    // Revenir à la première page si la liste change ou si on lance une recherche
    useEffect(() => {
        setCurrentPage(1);
    }, [history, searchTerm, filterMode]);

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
    const filteredHistory = history.filter(p => {
        const matchName = (p.client?.nom || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchMode = filterMode === 'all' || p.modePaiement === filterMode;
        return matchName && matchMode;
    });

    // Calculs pour la pagination
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentItems = filteredHistory.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);

    return (
        <Card className="border-0 shadow-sm rounded-4">
            <Card.Body>
                <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-3">
                    <Form.Control
                        type="text"
                        placeholder="Rechercher par nom de client..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="flex-grow-1 rounded-pill"
                        style={{ minWidth: '200px' }}
                    />
                    <Form.Select 
                        value={filterMode} 
                        onChange={(e) => setFilterMode(e.target.value)}
                        className="rounded-pill"
                        style={{ width: 'auto' }}
                    >
                        <option value="all">Tous les modes</option>
                        <option value="Cash">💵 Espèces uniquement</option>
                        <option value="Orange Money">🍊 Orange Money</option>
                        <option value="MobiCash">🟡 MobiCash</option>
                    </Form.Select>
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
                            <th>Mode</th>
                            <th>Référence</th>
                            <th>Dette Actuelle</th>
                            <th>Montant</th>
                            <th>Statut</th>
                            <th>Encaissé par</th>
                            <th>Boutique</th>
                            <th>Validé le</th>
                            <th className="text-end">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="10" className="text-center py-5"><Spinner /></td></tr>
                        ) : currentItems.length > 0 ? currentItems.map(p => {
                            const datePaiement = p.datePaiement ? new Date(p.datePaiement).toLocaleString('fr-FR') : <span className="text-danger fw-bold">Date Manquante</span>;
                            const dateValidation = p.dateValidation ? new Date(p.dateValidation).toLocaleString('fr-FR') : '-';
                            const detteActuelle = p.client?.dette || 0;
                            return (
                                <tr key={p._id}>
                                    <td>{datePaiement}</td>
                                    <td>{p.client?.nom || <span className="text-muted">Client supprimé</span>}</td>
                                    <td>
                                        {p.modePaiement === 'Orange Money' ? <Badge style={{backgroundColor: '#FF6600'}}>OM</Badge> :
                                         p.modePaiement === 'MobiCash' ? <Badge style={{backgroundColor: '#FFCC00', color: '#000'}}>Mobi</Badge> :
                                         p.modePaiement === 'PayCard' ? <Badge bg="info">Card</Badge> :
                                         p.modePaiement === 'Virement' ? <Badge bg="secondary">Bank</Badge> :
                                         <Badge bg="success-subtle" text="success">Cash</Badge>}
                                    </td>
                                    <td className="small text-muted">{p.transactionRef || '-'}</td>
                                    <td className="text-muted">{detteActuelle.toLocaleString()} GNF</td>
                                    <td className="fw-bold text-success">+{p.montant.toLocaleString()} GNF</td>
                                    <td>{getStatusBadge(p.statut)}</td>
                                    <td className="fw-bold">{p.gerant?.nom || <span className="text-muted">N/A</span>}</td>
                                    <td>{p.boutique?.nom || <span className="text-muted">N/A</span>}</td>
                                    <td>{dateValidation}</td>
                                    <td className="text-end">
                                        {p.client?.email && (
                                            <Button variant="link" size="sm" className="p-0 text-primary" onClick={() => onSendEmail(p._id)} disabled={emailLoading} title="Envoyer le reçu par email">
                                                <iconify-icon icon="solar:letter-bold" style={{fontSize: '20px'}}></iconify-icon>
                                            </Button>
                                        )}
                                    </td>
                                </tr>
                            );
                        }) : (
                            <tr><td colSpan="10" className="text-center text-muted py-5">Aucun paiement trouvé pour cette recherche.</td></tr>
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