/**
 * @file DebtManagementView.js
 * @description Vue de gestion des créances : suivi des dettes clients, paiements.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Badge, Card, Form, Modal, Spinner, Tab, Tabs, Alert, Pagination, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { clientAPI } from '../services/api';
import XLSX from 'xlsx-js-style';
import { safeNum, formatCurrency } from '../utils/formatUtils'; // Import safeNum et formatCurrency
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

            // L'intercepteur Axios unwrap déjà : dettesRes est le tableau ou { data: [...] }
            setDettes(Array.isArray(dettesRes) ? dettesRes : (dettesRes.data || []));

            const historyData = Array.isArray(historyRes) ? historyRes : (historyRes.data || []);
            const sortedHistory = historyData.sort((a, b) => {
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
            console.log("[DEBUG] 1. Envoi du paiement au backend avec montant:", montantPaye);
            // L'intercepteur retourne maintenant directement l'objet de données.
            const responseData = await clientAPI.payDette(selectedDebt._id, { montant: montantPaye, modePaiement, transactionRef });
            console.log("[DEBUG] 2. Données reçues du backend:", responseData);

            const clientInfo = { email: selectedDebt.email, nom: selectedDebt.nom };

            const { nouveauSolde, paiement, soldeAnterieur } = responseData;
            console.log("[DEBUG] 3. Données extraites de la réponse:", { nouveauSolde, paiement, soldeAnterieur });

            // Mettre à jour l'état local pour un feedback visuel instantané
            setDettes(prevDettes => prevDettes.map(d => // Utiliser safeNum pour la cohérence
                d._id === selectedDebt._id ? { ...d, dette: safeNum(nouveauSolde) } : d
            ));
            console.log("[DEBUG] 4. État 'dettes' mis à jour localement.");

            setShowPayModal(false);
            setAmount('');
            setModePaiement('Cash');
            setTransactionRef('');
            const paymentReceipt = {
                id: paiement?._id,
                clientEmail: clientInfo.email,
                clientName: clientInfo.nom,
                amount: montantPaye,
                oldDebt: safeNum(soldeAnterieur),
                modePaiement: modePaiement,
                transactionRef: transactionRef
            };
            console.log("[DEBUG] 5. Données du reçu préparées:", paymentReceipt);

            setLastPayment(paymentReceipt);

            setSuccess("Paiement encaissé avec succès ! Le solde du client et votre caisse ont été mis à jour.");
            loadData();
            console.log("[DEBUG] 6. Opération terminée avec succès !");

        } catch (err) {
            // LOG CRUCIAL : Affiche l'erreur complète dans la console pour l'analyse.
            console.error("--- ERREUR CAPTURÉE DANS handlePayment ---", err);
            setError(err.response?.data?.message || "Erreur lors de l'enregistrement du paiement. (Voir console pour détails)");
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
        // Format professionnel pour imprimante thermique (80mm)
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: [80, 200] // Hauteur augmentée pour plus de détails
        });

        const pageWidth = 80;
        const margin = 5;
        let yPos = 5;

        // --- INFOS BOUTIQUE (Récupérées depuis le localStorage) ---
        const shopName = localStorage.getItem('shopName') || 'MON ENTREPRISE';
        const shopAddress = localStorage.getItem('shopAddress') || 'Adresse';
        const shopPhone = localStorage.getItem('shopPhone') || 'Téléphone';

        // --- LOGO ---
        try {
            doc.addImage(logo, 'PNG', (pageWidth - 25) / 2, yPos, 25, 8);
            yPos += 12;
        } catch (e) {
            console.error("Erreur lors de l'ajout du logo", e);
            yPos += 5;
        }

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.text(shopName, pageWidth / 2, yPos, { align: 'center' });
        yPos += 4;
        doc.text(shopAddress, pageWidth / 2, yPos, { align: 'center' });
        yPos += 4;
        doc.text(`Tel: ${shopPhone}`, pageWidth / 2, yPos, { align: 'center' });
        yPos += 6;

        doc.setLineDashPattern([1, 1], 0);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 6;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text("REÇU DE PAIEMENT", pageWidth / 2, yPos, { align: 'center' }); // Correction: "REÇU"
        yPos += 8;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text(`Date: ${new Date().toLocaleString('fr-FR')}`, margin, yPos);
        yPos += 5;
        doc.text(`Reçu N°: PAY-${payment.id?.slice(-6).toUpperCase() || 'N/A'}`, margin, yPos); // Correction: "Reçu"
        yPos += 8;

        doc.setFont("helvetica", "bold");
        doc.text(`CLIENT: ${payment.clientName.toUpperCase()}`, margin, yPos);
        yPos += 8;

        doc.setLineDashPattern([0], 0); // Ligne pleine
        doc.setLineWidth(0.2);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 8;

        doc.setFontSize(10);
        const addLineItem = (label, value) => {
            doc.setFont("helvetica", "normal");
            doc.text(label, margin, yPos);
            doc.setFont("helvetica", "bold");
            doc.text(value, pageWidth - margin, yPos, { align: 'right' });
            yPos += 7;
        };

        addLineItem("Ancien Solde:", formatCurrency(payment.oldDebt));
        addLineItem("Montant Versé:", formatCurrency(payment.amount));
        if (payment.modePaiement) addLineItem("Mode de Paiement:", payment.modePaiement);
        if (payment.transactionRef) addLineItem("Réf. Transaction:", payment.transactionRef);

        yPos += 2;
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 8;

        doc.setFontSize(12);
        const remaining = Math.max(0, safeNum(payment.oldDebt) - safeNum(payment.amount)); // Utilisation de safeNum
        addLineItem("NOUVEAU SOLDE:", formatCurrency(remaining));

        yPos += 10;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.text("Merci de votre confiance !", pageWidth / 2, yPos, { align: 'center' }); // Centered thank you message
        yPos += 8;
        doc.text("........................................", pageWidth / 2, yPos, { align: 'center' });
        yPos += 4;

        // --- SIGNATURE NUMÉRIQUE ---
        const cashierName = localStorage.getItem('userName') || 'Opérateur';
        doc.setFont("helvetica", "bold");
        doc.text(cashierName, pageWidth / 2, yPos, { align: 'center' });
        yPos += 4;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text(`Reçu généré par StockDash - ID: ${payment.id || 'N/A'}`, pageWidth / 2, yPos, { align: 'center' });

        doc.save(`recu_${payment.clientName.replace(/\s+/g, '_')}_${Date.now()}.pdf`);
    };

const handleExportExcel = () => {
        const workbook = XLSX.utils.book_new();

        // Feuille 1 : Liste des dettes en cours
        const dataToExport = dettes.map(d => ({
            'Client': d.nom,
            'Téléphone': d.telephone || '-',
            'Email': d.email || '-',
            'Dette Totale (GNF)': d.dette,
            'Échéance': d.echeanceDette ? new Date(d.echeanceDette).toLocaleDateString() : '-',
            'Statut': new Date(d.echeanceDette) < new Date() ? 'En retard' : 'OK'
        }));
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        XLSX.utils.book_append_sheet(workbook, worksheet, "Dettes_Clients");

        // Feuille 2 : Historique complet des paiements
        const historyData = (history || []).map(p => ({
            'Date': (p.datePaiement || p.createdAt) ? new Date(p.datePaiement || p.createdAt).toLocaleString('fr-FR') : '-',
            'Client': p.client?.nom || 'Client supprimé',
            'Type': p.type === 'REMBOURSEMENT' ? 'Paiement' : (p.type === 'ANNULATION' ? 'Annulation' : 'Création dette'),
            'Montant (GNF)': p.montant || 0,
            'Mode de Paiement': p.modePaiement || 'Cash',
            'Réf. Transaction': p.transactionRef || '-',
            'Ancien Solde (GNF)': p.soldeAnterieur ?? 0,
            'Nouveau Solde (GNF)': p.nouveauSolde ?? 0,
            'Boutique': p.boutique?.nom || '-',
            'Encaissé par': p.operateur?.nom || p.gerant?.nom || 'N/A'
        }));
        const worksheet2 = XLSX.utils.json_to_sheet(historyData);
        XLSX.utils.book_append_sheet(workbook, worksheet2, "Historique_Paiements");

        // Ajuster la largeur des colonnes
        const wscols = [
            { wch: 20 }, { wch: 25 }, { wch: 20 }, { wch: 15 },
            { wch: 20 }, { wch: 20 }, { wch: 18 }, { wch: 18 },
            { wch: 20 }, { wch: 20 }
        ];
        worksheet2['!cols'] = wscols;

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
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
                <h3 className="fw-bold mb-0">
                    <iconify-icon icon="solar:wallet-money-bold-duotone" className="me-2 text-primary"></iconify-icon>
                    {isAdmin ? "Contrôle des Créances" : "Gestion des Dettes"}
                </h3>
                <div className="d-flex gap-2 flex-wrap justify-content-end">
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
                    <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2">
                        <span>{success}</span>
                        <div className="d-flex gap-2 flex-wrap">
                            {lastPayment && (
                                <Button variant="outline-success" size="sm" onClick={() => generateReceipt(lastPayment)}>
                                    <iconify-icon icon="solar:printer-bold" className="me-1"></iconify-icon>
                                    Générer reçu PDF
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
                                            <td className="pe-4 text-end text-nowrap">
                                                {!isAdmin && d.dette > 0 && (
                                                    <OverlayTrigger placement="top" overlay={<Tooltip>Encaisser un versement</Tooltip>}>
                                                        <Button variant="success" size="sm" className="me-1 me-md-2 table-action-btn d-inline-flex align-items-center" onClick={() => { setSelectedDebt(d); setShowPayModal(true); }}>
                                                            <iconify-icon icon="solar:money-bag-bold" className="me-1"></iconify-icon>
                                                            <span className="d-none d-md-inline">Encaisser</span>
                                                        </Button>
                                                    </OverlayTrigger>
                                                )}
                                                <OverlayTrigger placement="top" overlay={<Tooltip>Envoyer un rappel WhatsApp</Tooltip>}>
                                                    <Button variant="info" size="sm" onClick={() => sendWhatsApp(d)} className="text-white table-action-btn d-inline-flex align-items-center">
                                                        <iconify-icon icon="logos:whatsapp-icon" className="me-1"></iconify-icon>
                                                        <span className="d-none d-md-inline">Rappel</span>
                                                    </Button>
                                                </OverlayTrigger>
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
                    <DebtHistoryTab history={history} loading={loading} onSendEmail={handleSendEmailReceipt} emailLoading={emailLoading} onPrint={generateReceipt} />
                </Tab>
            </Tabs>

            <Modal show={showPayModal} onHide={() => setShowPayModal(false)} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Encaisser un versement</Modal.Title>
                </Modal.Header>
                <Form onSubmit={handlePayment}>
                    <Modal.Body>
                        <p>Client: <strong className="text-primary">{selectedDebt?.nom}</strong></p>
                        <p>Dette actuelle: <strong className="text-danger">{safeNum(selectedDebt?.dette).toLocaleString()} GNF</strong></p>
                        <Form.Group className="mb-3">
                            <Form.Label>Mode de paiement</Form.Label>
                            <Form.Select
                                value={modePaiement}
                                onChange={(e) => setModePaiement(e.target.value)} // Added rounded-pill for consistency
                                className="rounded-pill"
                            >
                                <option value="Cash">💵 Espèces (Cash)</option>
                                <option value="Orange Money">🍊 Orange Money</option>
                                <option value="MobiCash">🟡 Mobile money (MTN)</option>
                                <option value="PayCard">💳 PayCard</option>
                         
                            </Form.Select>
                        </Form.Group>
                        {['Orange Money', 'MobiCash', 'PayCard', 'Virement'].includes(modePaiement) && (
                            <Form.Group className="mb-3">
                                <Form.Label>numero de telephone {modePaiement === 'Orange Money' && <span className="text-danger">*</span>}</Form.Label>
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
                                min="1" // safeNum handles potential object conversion
                                max={safeNum(selectedDebt?.dette)}
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

const DebtHistoryTab = ({ history, loading, onSendEmail, emailLoading, onPrint }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterMode, setFilterMode] = useState('all');
    const itemsPerPage = 10;

// Revenir à la première page si la liste change ou si on lance une recherche
    useEffect(() => { setCurrentPage(1); }, [history, searchTerm, filterMode]);

    // Helper pour le formatage de la devise dans le PDF
    // IMPORTANT : on remplace les espaces insécables (\u00a0 \u202f) par des espaces normaux
    // car jsPDF/Helvetica ne sait pas les afficher → montants illisibles sinon.
    const formatCurrencyPdf = (amount) => (safeNum(amount).toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' ');

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
        doc.text("Client", 45, y);
        doc.text("Type", 90, y);
        doc.text("Mode", 120, y);
        doc.text("Montant", 150, y);
        doc.line(14, y + 2, 196, y + 2);
        y += 10;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);

        filteredHistory.forEach(p => {
            // Gestion du saut de page
            if (y > 250) {
                doc.addPage();
                y = 20;
                doc.setFont("helvetica", "bold");
                doc.text("Date", 14, y);
                doc.text("Client", 45, y);
                doc.text("Type", 90, y);
                doc.text("Mode", 120, y);
                doc.text("Montant", 150, y);
                doc.line(14, y + 2, 196, y + 2);
                y += 10;
                doc.setFont("helvetica", "normal");
            }

            const date = (p.datePaiement || p.createdAt) ? new Date(p.datePaiement || p.createdAt).toLocaleDateString('fr-FR') : '-';
            const client = p.client?.nom || 'Client inconnu';
            const montant = formatCurrencyPdf(p.montant);
            const type = p.type === 'REMBOURSEMENT' ? 'Paiement' : (p.type === 'ANNULATION' ? 'Annulé' : 'Dette');
            const mode = p.modePaiement || 'Cash';

            doc.text(date, 14, y);
            doc.text(client.substring(0, 18), 45, y); // Tronquer si trop long
            doc.text(type, 90, y);
            doc.text(mode, 120, y);
            doc.text(montant, 150, y);

            y += 8;
        });

        // --- Informations détaillées par paiement (tableau détaillé) ---
        y += 12;
        if (y > 270) { doc.addPage(); y = 20; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text("DÉTAIL DES PAIEMENTS", 14, y);
        y += 8;

        filteredHistory.forEach(p => {
            if (y > 240) { doc.addPage(); y = 20; doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("DÉTAIL DES PAIEMENTS (suite)", 14, y); y += 8; }

            const date = (p.datePaiement || p.createdAt) ? new Date(p.datePaiement || p.createdAt).toLocaleString('fr-FR') : '-';
            const client = p.client?.nom || 'Client inconnu';
            const type = p.type === 'REMBOURSEMENT' ? 'Paiement' : (p.type === 'ANNULATION' ? 'Annulé' : 'Dette');
            const mode = p.modePaiement || 'Cash';
            const operateur = p.operateur?.nom || p.gerant?.nom || 'N/A';
            const ref = p.transactionRef || '—';

            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.setTextColor(0);
            doc.text(`${client} — ${type}`, 14, y);
            y += 5;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            doc.setTextColor(80);
            doc.text(`Date : ${date}`, 18, y);
            y += 5;
            doc.text(`Montant : ${formatCurrencyPdf(p.montant)}    Mode : ${mode}    Réf : ${ref}`, 18, y);
            y += 5;
            doc.text(`Ancien solde : ${formatCurrencyPdf(p.soldeAnterieur ?? 0)}    Nouveau solde : ${formatCurrencyPdf(p.nouveauSolde ?? 0)}    Encaissé par : ${operateur}`, 18, y);
            y += 5;
            doc.setDrawColor(200);
            doc.line(14, y, 196, y);
            y += 8;
        });

        doc.save(`historique_paiements_${new Date().toISOString().slice(0, 10)}.pdf`);
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
        <div className="animate__animated animate__fadeIn">
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
                <Form.Group className="flex-grow-1" style={{ maxWidth: '300px' }}>
                    <Form.Control
                        type="text"
                        placeholder="Rechercher par nom de client..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="rounded-pill shadow-sm"
                    />
                </Form.Group>
                <Form.Group>
                    <Form.Select
                        value={filterMode}
                        onChange={(e) => setFilterMode(e.target.value)}
                        className="rounded-pill shadow-sm"
                    >
                        <option value="all">Tous les modes</option>
                        <option value="Cash">💵 Espèces</option>
                        <option value="Orange Money">🍊 Orange Money</option>
                        <option value="MobiCash">🟡 MobiCash</option>
                    </Form.Select>
                </Form.Group>
                <Button variant="outline-danger" onClick={exportToPDF} disabled={loading || filteredHistory.length === 0} className="rounded-pill shadow-sm">
                    <iconify-icon icon="solar:file-pdf-bold" className="me-2"></iconify-icon>
                    Exporter PDF
                </Button>
            </div>

            {loading ? (
                <div className="text-center py-5"><Spinner /></div>
            ) : currentItems.length > 0 ? (
                <div className="d-flex flex-column gap-3">
                    {currentItems.map(p => {
                        const datePaiement = p.datePaiement ? new Date(p.datePaiement) : new Date(p.createdAt);
                        return (
<Card key={p._id} className="border-0 shadow-sm rounded-4 overflow-hidden">
                                <Card.Body className="p-0">
                                    <div className="d-flex flex-column flex-lg-row align-items-stretch">
                                        {/* Bandeau type de mouvement */}
                                        <div className={`d-flex flex-column justify-content-center align-items-center px-4 py-3 ${p.type === 'REMBOURSEMENT' ? 'bg-success-subtle text-success' : p.type === 'ANNULATION' ? 'bg-warning-subtle text-warning' : 'bg-danger-subtle text-danger'}`} style={{ minWidth: '110px' }}>
                                            <iconify-icon icon={p.type === 'REMBOURSEMENT' ? 'solar:money-bag-bold' : p.type === 'ANNULATION' ? 'solar:close-circle-bold' : 'solar:wallet-money-bold'} className="fs-1"></iconify-icon>
                                            <span className="fw-bold small text-uppercase mt-1">
                                                {p.type === 'REMBOURSEMENT' ? 'Paiement' : p.type === 'ANNULATION' ? 'Annulé' : 'Dette'}
                                            </span>
                                        </div>

                                        {/* Contenu principal */}
                                        <div className="flex-grow-1 p-3">
                                            {/* En-tête */}
                                            <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
                                                <div>
                                                    <div className="d-flex align-items-center gap-2">
                                                        <span className="fw-bold fs-6">{p.client?.nom || 'Client supprimé'}</span>
                                                        <Badge bg="light" text="dark" className="border fw-normal">
                                                            <iconify-icon icon="solar:shop-2-bold" className="me-1 align-middle"></iconify-icon>
                                                            {p.boutique?.nom || 'N/A'}
                                                        </Badge>
                                                    </div>
<div className="small text-muted mt-1">
                                                        <iconify-icon icon="solar:calendar-bold-duotone" className="me-1 align-middle"></iconify-icon>
                                                        {datePaiement.toLocaleString('fr-FR')}
                                                    </div>
                                                    {p.type === 'REMBOURSEMENT' && (
                                                        <div className="mt-1">
                                                            {p.modePaiement === 'Orange Money' ? <Badge bg="warning" text="dark"><iconify-icon icon="logos:orange" className="me-1"></iconify-icon>Orange Money</Badge> :
                                                                p.modePaiement === 'MobiCash' ? <Badge bg="info"><iconify-icon icon="logos:mtn" className="me-1"></iconify-icon>MobiCash</Badge> :
                                                                    p.modePaiement === 'PayCard' ? <Badge bg="primary"><iconify-icon icon="solar:card-bold" className="me-1"></iconify-icon>PayCard</Badge> :
                                                                        <Badge bg="success-subtle" text="success">💵 Cash</Badge>}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="d-flex gap-2">
<OverlayTrigger overlay={<Tooltip>Réimprimer le reçu</Tooltip>}>
                                                        <Button variant="outline-secondary" size="sm" className="rounded-circle p-1 d-flex" onClick={() => onPrint({ id: p._id, clientName: p.client?.nom, amount: p.montant, modePaiement: p.modePaiement || 'Cash', transactionRef: p.transactionRef, oldDebt: p.soldeAnterieur ?? ((p.client?.dette || 0) + p.montant) })}>
                                                            <iconify-icon icon="solar:printer-bold" style={{ fontSize: '18px' }}></iconify-icon>
                                                        </Button>
                                                    </OverlayTrigger>
                                                    {p.client?.email && (
                                                        <OverlayTrigger overlay={<Tooltip>Envoyer par email</Tooltip>}>
                                                            <Button variant="outline-primary" size="sm" className="rounded-circle p-1 d-flex" onClick={() => onSendEmail(p._id)} disabled={emailLoading}>
                                                                <iconify-icon icon="solar:letter-bold" style={{ fontSize: '18px' }}></iconify-icon>
                                                            </Button>
                                                        </OverlayTrigger>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Statistiques */}
                                            <div className="row g-2">
                                                <div className="col-sm-6 col-lg-3">
                                                    <div className="bg-light rounded-3 p-2 h-100">
                                                        <div className="small text-muted">Montant versé</div>
                                                        <div className="fw-bold text-success">+{safeNum(p.montant).toLocaleString()} GNF</div>
                                                    </div>
                                                </div>
                                                <div className="col-sm-6 col-lg-3">
                                                    <div className="bg-light rounded-3 p-2 h-100">
                                                        <div className="small text-muted">Ancien solde</div>
                                                        <div className="fw-bold text-dark">{safeNum(p.soldeAnterieur).toLocaleString()} GNF</div>
                                                    </div>
                                                </div>
                                                <div className="col-sm-6 col-lg-3">
                                                    <div className="bg-light rounded-3 p-2 h-100">
                                                        <div className="small text-muted">Solde restant à payer</div>
                                                        <div className={`fw-bold ${p.nouveauSolde > 0 ? 'text-danger' : 'text-success'}`}>
                                                            {safeNum(p.nouveauSolde).toLocaleString()} GNF
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="col-sm-6 col-lg-3">
                                                    <div className="bg-light rounded-3 p-2 h-100">
                                                        <div className="small text-muted">Encaissé par</div>
                                                        <div className="fw-bold text-primary">{p.operateur?.nom || p.gerant?.nom || 'N/A'}</div>
                                                        {p.transactionRef && <div className="small text-muted font-monospace">Réf: {p.transactionRef}</div>}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </Card.Body>
                            </Card>
                        );
                    })}
                </div>
            ) : (
                <Alert variant="info" className="text-center border-0 shadow-sm rounded-4">Aucun paiement trouvé pour cette recherche.</Alert>
            )}

            {!loading && filteredHistory.length > itemsPerPage && (
                <div className="d-flex justify-content-center mt-4">
                    <Pagination>
                        <Pagination.First onClick={() => setCurrentPage(1)} disabled={currentPage === 1} />
                        <Pagination.Prev onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} />
                        <Pagination.Item active>{currentPage} / {totalPages}</Pagination.Item>
                        <Pagination.Next onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} />
                        <Pagination.Last onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} />
                    </Pagination>
                </div>
            )}
        </div>
    );
};

export default DebtManagementView;
