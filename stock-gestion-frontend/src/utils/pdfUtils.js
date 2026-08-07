/**
 * @file pdfUtils.js
 * @description Composant React.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logo from '../assets/logo.png';
import { safeNum } from './formatUtils'; // Import safeNum

// Helper pour nettoyer le formatage des nombres pour le PDF
const formatPrice = (price) => {
    return safeNum(price).toLocaleString('fr-FR').replace(/[\u00a0\u202f]/g, ' ');
};

/**
 * Génère un ticket de caisse au format PDF (type ticket thermique).
 * @param {Object} ticketData - Données de la vente pour le ticket.
 */
export const generateReceiptPDF = (ticketData) => {
    if (!ticketData) return;

    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [80, 150 + (ticketData.items.length * 8)] // Hauteur dynamique
    });

    const {
        shopName = 'BOUTIQUE',
        address = '',
        phone = '',
        transactionId = 'N/A',
        date = new Date(),
        clientName = 'Client de passage',
        modePaiement = 'Cash',
        cashierName = 'N/A',
        serverName = 'N/A',
        items = [],
        subTotal = 0,
        itemLevelDiscount = 0,
        totalNet = 0,
        amountPaid = 0,
        pourboire = 0,
        echeanceDette = null,
    } = ticketData;

    // --- En-tête ---
    try {
        doc.addImage(logo, 'PNG', 25, 5, 30, 10);
    } catch (e) {
        doc.setFontSize(14);
        doc.text(shopName || 'BOUTIQUE', 40, 10, { align: 'center' });
    }

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(address || '', 40, 20, { align: 'center' });
    if (phone) doc.text(`Tel: ${phone}`, 40, 24, { align: 'center' });
    doc.text("------------------------------------------------", 40, 30, { align: 'center' });

    // --- Infos Transaction ---
    let currentY = 35;
    doc.text(`Ticket: ${transactionId}`, 5, currentY);
    currentY += 4;
    doc.text(`Date: ${new Date(date).toLocaleString('fr-FR')}`, 5, currentY);
    currentY += 4;
    doc.text(`Client: ${clientName}`, 5, currentY);
    currentY += 4;
    // N'afficher "Serveur" que s'il y en a un (pas "N/A")
    if (serverName && serverName !== 'N/A') {
        doc.text(`Serveur: ${serverName}`, 5, currentY);
        currentY += 4;
    }
    // Caissier sur sa ligne
    doc.text(`Caissier: ${cashierName}`, 5, currentY);
    currentY += 4;
    // Mode en bas
    doc.text(`Mode: ${modePaiement}`, 5, currentY);
    currentY += 4;

    // --- Tableau Articles ---
    const tableRows = items.map(item => [
        item.article.nom.substring(0, 20),
        item.quantite,
        formatPrice(item.prixUnitaire),
        formatPrice(item.prixTotal)
    ]);

    autoTable(doc, {
        head: [["Article", "Qté", "P.U.", "Total"]],
        body: tableRows,
        startY: currentY,
        theme: 'plain',
        styles: { fontSize: 7, cellPadding: 1 },
        headStyles: { fontStyle: 'bold', halign: 'center' },
        columnStyles: {
            0: { cellWidth: 25 },
            1: { halign: 'center' },
            2: { halign: 'right' },
            3: { halign: 'right' }
        },
        margin: { left: 2, right: 2 }
    });

    let finalY = doc.lastAutoTable.finalY + 5;

    // --- Totaux ---
    doc.setFontSize(8);
    doc.text('Sous-total:', 5, finalY);
    doc.text(`${formatPrice(subTotal)} GNF`, 75, finalY, { align: 'right' });
    finalY += 4;

    if (itemLevelDiscount > 0) {
        doc.text('Remise (articles):', 5, finalY);
        doc.text(`- ${formatPrice(itemLevelDiscount)} GNF`, 75, finalY, { align: 'right' });
        finalY += 4;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text('TOTAL ARTICLES:', 5, finalY);
    doc.text(`${formatPrice(totalNet)} GNF`, 75, finalY, { align: 'right' });
    finalY += 6;

    if (pourboire > 0) {
        doc.setFont("helvetica", "normal");
        doc.text('Service (Pourboire):', 5, finalY);
        doc.text(`+ ${formatPrice(pourboire)} GNF`, 75, finalY, { align: 'right' });
        finalY += 6;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text('TOTAL À PAYER:', 5, finalY);
        doc.text(`${formatPrice(totalNet + pourboire)} GNF`, 75, finalY, { align: 'right' });
        finalY += 7;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text('Montant versé:', 5, finalY);
    doc.text(`${formatPrice(amountPaid)} GNF`, 75, finalY, { align: 'right' });
    finalY += 5;

    const balance = amountPaid - (totalNet + pourboire);

    if (balance >= 0) {
        // Cas normal : Monnaie à rendre
        doc.text('Monnaie rendue:', 5, finalY);
        doc.text(`${formatPrice(balance)} GNF`, 75, finalY, { align: 'right' });
    } else {
        // Cas dette : Reste à payer
        doc.setFont("helvetica", "bold");
        doc.text('RESTE A PAYER:', 5, finalY);
        doc.text(`${formatPrice(Math.abs(balance))} GNF`, 75, finalY, { align: 'right' });

        if (echeanceDette) {
            finalY += 5;
            doc.setFontSize(7);
            doc.setFont("helvetica", "italic");
            doc.text(`Echeance le : ${new Date(echeanceDette).toLocaleDateString('fr-FR')}`, 40, finalY, { align: 'center' });
        }
    }

    // --- Pied de page ---
    doc.text("------------------------------------------------", 40, finalY + 10, { align: 'center' });
    doc.setFont("helvetica", "bold");
    doc.text("Merci de votre visite !", 40, finalY + 15, { align: 'center' });

    doc.save(`ticket_${transactionId}.pdf`);
};

export const generateMovementsSummary = (movements) => {
    // Implémentation de la génération de PDF pour les mouvements
    // (Non demandé dans cette requête, mais utile pour la cohérence)
    console.log("Génération du résumé des mouvements", movements);
};