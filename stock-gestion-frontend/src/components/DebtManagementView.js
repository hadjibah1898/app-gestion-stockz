import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Badge, Card, Form, Modal, Spinner, Tab, Tabs, Alert, Pagination } from 'react-bootstrap';
import { clientAPI } from '../services/api';
import XLSX from 'xlsx-js-style';
import jsPDF from 'jspdf';


const DebtManagementView = () => {
    const [dettes, setDettes] = useState([]);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    
    const [showPayModal, setShowPayModal] = useState(false);
    const [selectedDebt, setSelectedDebt] = useState(null);
    const [amount, setAmount] = useState('');
    const [submitLoading, setSubmitLoading] = useState(false);
    const [lastPayment, setLastPayment] = useState(null);

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
        try {
            const montantPaye = Number(amount);
            await clientAPI.payDette(selectedDebt._id, { montant: montantPaye });
            setShowPayModal(false);
            setAmount('');
            
            setLastPayment({
                clientName: selectedDebt.nom,
                amount: amount,
                oldDebt: selectedDebt.dette
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
                        {lastPayment && (
                            <Button variant="outline-success" size="sm" onClick={() => generateReceipt(lastPayment)}>
                                <iconify-icon icon="solar:printer-bold" className="me-1"></iconify-icon>
                                Télécharger le Reçu (Gérant)
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
                            <th>Boutique</th>
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
                                    <td className="fw-bold text-success">+{p.montant.toLocaleString()} GNF</td>
                                    <td>{getStatusBadge(p.statut)}</td>
                                    <td className="fw-bold">{p.gerant?.nom || <span className="text-muted">N/A</span>}</td>
                                    <td>{p.boutique?.nom || <span className="text-muted">N/A</span>}</td>
                                    <td>{dateValidation}</td>
                                </tr>
                            );
                        }) : (
                            <tr><td colSpan="8" className="text-center text-muted py-5">Aucun paiement trouvé pour cette recherche.</td></tr>
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