import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logo from '../assets/logo.png';

const formatPrice = (price) => (price || 0).toLocaleString('fr-FR').replace(/[\u00a0\u202f]/g, ' ');

/*************  ✨ Windsurf Command 🌟  *************/
/**
 * Génère un Bon d'Entrée en Stock (Approvisionnement Fournisseur)
 */
export const generateSupplyReceipt = (mvt, action = 'download') => {
    const doc = new jsPDF();
    doc.addImage(logo, 'PNG', 14, 10, 40, 15);
    doc.setFontSize(18).setTextColor(41, 128, 185).setFont("helvetica", "bold");
    doc.text("BON D'ENTRÉE EN STOCK", 105, 20, { align: 'center' });
    
    doc.setFontSize(10).setTextColor(100).setFont("helvetica", "normal");
    doc.text(`Référence : #${mvt._id.toString().slice(-6).toUpperCase()}`, 105, 27, { align: 'center' });
    doc.text(`Date : ${new Date(mvt.createdAt).toLocaleString('fr-FR')}`, 196, 20, { align: 'right' });

    const infoY = 45;
    doc.setFontSize(11).setTextColor(0).setFont("helvetica", "bold");
    doc.text("FOURNISSEUR", 14, infoY);
    doc.text("DESTINATION", 105, infoY);
    
    doc.setFont("helvetica", "normal");
    doc.text(mvt.fournisseur?.nom || 'N/A', 14, infoY + 7);
    doc.text(mvt.boutiqueDestination?.nom || 'Dépôt Principal', 105, infoY + 7);
    doc.text(`Opérateur : ${mvt.operateur?.nom || 'Admin'}`, 14, infoY + 15);

    autoTable(doc, {
        startY: infoY + 25,
        head: [['Article', 'Quantité', 'P.U. Achat', 'Total']],
        body: mvt.articles.map(a => [
            a.nomArticle, 
            a.quantite, 
            a.prixAchatUnitaire ? `${formatPrice(a.prixAchatUnitaire)} GNF` : '-',
            a.prixAchatUnitaire ? `${formatPrice(a.prixAchatUnitaire * a.quantite)} GNF` : '-'
        ]),
        theme: 'grid',
        headStyles: { fillColor: [41, 128, 185] }
    });

    const finalY = doc.lastAutoTable.finalY + 30;
    doc.setFontSize(10).setFont("helvetica", "bold");
    doc.text("Signature du Fournisseur", 40, finalY, { align: 'center' });
    doc.text("Signature du Magasinier", 150, finalY, { align: 'center' });
    doc.setDrawColor(200).line(20, finalY + 15, 60, finalY + 15).line(130, finalY + 15, 170, finalY + 15);

    if (action === 'preview') window.open(doc.output('bloburl'), '_blank');
    else doc.save(`bon_entree_${mvt._id.toString().slice(-6)}.pdf`);
};
/*******  14b72679-2b74-4a52-ab95-ff1cbbd640e0  *******/

/**
 * Génère un Bon de Transfert de Stock (Inter-boutiques)
 */
export const generateTransferReceipt = (mvt, action = 'download') => {
    const doc = new jsPDF();
    doc.addImage(logo, 'PNG', 14, 10, 40, 15);
    doc.setFontSize(18).setTextColor(25, 118, 210).setFont("helvetica", "bold");
    doc.text("BON TRANSFERT DE STOCK", 105, 20, { align: 'center' });
    
    doc.setFontSize(10).setTextColor(100).setFont("helvetica", "normal");
    doc.text(`ID Transfert : #TR-${mvt._id.toString().slice(-6).toUpperCase()}`, 105, 27, { align: 'center' });
    doc.text(`Date : ${new Date(mvt.createdAt).toLocaleString('fr-FR')}`, 196, 20, { align: 'right' });

    const infoY = 45;
    doc.setFontSize(11).setTextColor(0).setFont("helvetica", "bold");
    doc.text("BOUTIQUE SOURCE", 14, infoY);
    doc.text("BOUTIQUE CIBLE", 105, infoY);
    
    doc.setFont("helvetica", "normal");
    doc.text(mvt.boutiqueSource?.nom || 'Dépôt Principal', 14, infoY + 7);
    doc.text(mvt.boutiqueDestination?.nom || 'N/A', 105, infoY + 7);

    autoTable(doc, {
        startY: infoY + 25,
        head: [['Référence', 'Désignation Article', 'Quantité']],
        body: mvt.articles.map(a => ['-', a.nomArticle, a.quantite]),
        theme: 'grid',
        headStyles: { fillColor: [25, 118, 210] }
    });

    const finalY = doc.lastAutoTable.finalY + 30;
    doc.text("Visa Expéditeur", 40, finalY, { align: 'center' });
    doc.text("Visa Réceptionnaire", 150, finalY, { align: 'center' });

    if (action === 'preview') window.open(doc.output('bloburl'), '_blank');
    else doc.save(`transfert_${mvt._id.toString().slice(-6)}.pdf`);
};

/**
 * Génère un Ticket de Caisse (Vente client)
 */
export const generateSaleReceipt = (ticketData) => {
    const doc = new jsPDF({
        orientation: 'portrait', unit: 'mm', format: [80, 150 + (ticketData.items.length * 8)]
    });

    try { doc.addImage(logo, 'PNG', 25, 5, 30, 10); } 
    catch (e) { doc.setFontSize(14).text(ticketData.shopName || 'BOUTIQUE', 40, 10, { align: 'center' }); }
    
    doc.setFontSize(8).setFont("helvetica", "normal");
    doc.text(ticketData.address || '', 40, 20, { align: 'center' });
    if (ticketData.phone) doc.text(`Tel: ${ticketData.phone}`, 40, 24, { align: 'center' });
    doc.text("------------------------------------------------", 40, 30, { align: 'center' });

    doc.text(`Ticket: ${ticketData.transactionId}`, 5, 35);
    doc.text(`Date: ${new Date(ticketData.date).toLocaleString('fr-FR')}`, 5, 39);
    doc.text(`Client: ${ticketData.clientName}`, 5, 43);
    doc.text(`Caissier: ${ticketData.cashierName}`, 5, 47);
    
    autoTable(doc, {
        head: [["Article", "Qté", "P.U.", "Total"]],
        body: ticketData.items.map(item => [
            (item.article?.nom || item.nomArticle || 'Article').substring(0, 20),
            item.quantite,
            formatPrice(item.prixUnitaire),
            formatPrice(item.prixTotal)
        ]),
        startY: 50, theme: 'plain', styles: { fontSize: 7, cellPadding: 1 },
        headStyles: { fontStyle: 'bold', halign: 'center' },
        columnStyles: { 0: { cellWidth: 25 }, 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
        margin: { left: 2, right: 2 }
    });

    let finalY = doc.lastAutoTable.finalY + 5;
    doc.text('Sous-total:', 5, finalY);
    doc.text(`${formatPrice(ticketData.subTotal)} GNF`, 75, finalY, { align: 'right' });
    finalY += 4;
    
    if (ticketData.itemLevelDiscount > 0) {
        doc.text('Remise:', 5, finalY);
        doc.text(`- ${formatPrice(ticketData.itemLevelDiscount)} GNF`, 75, finalY, { align: 'right' });
        finalY += 4;
    }

    doc.setFont("helvetica", "bold").setFontSize(10).text('TOTAL NET:', 5, finalY);
    doc.text(`${formatPrice(ticketData.totalNet)} GNF`, 75, finalY, { align: 'right' });
    
    finalY += 10;
    doc.setFont("helvetica", "normal").setFontSize(8).text("------------------------------------------------", 40, finalY, { align: 'center' });
    doc.setFont("helvetica", "bold").text("Merci de votre visite !", 40, finalY + 5, { align: 'center' });

    doc.save(`ticket_${ticketData.transactionId}.pdf`);
};

/**
 * Génère un rapport récapitulatif pour une sélection de mouvements (Ventes)
 */
export const generateSalesSummary = (sales) => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.addImage(logo, 'PNG', 14, 10, 40, 15);
    
    doc.setFontSize(18).setTextColor(44, 62, 80).setFont("helvetica", "bold");
    doc.text("JOURNAL DES MOUVEMENTS DE STOCK (VENTES)", 105, 20, { align: 'center' });

    doc.setFontSize(10).setTextColor(100).setFont("helvetica", "normal");
    doc.text(`Généré le : ${new Date().toLocaleString('fr-FR')}`, 280, 20, { align: 'right' });
    doc.text(`Nombre de transactions sélectionnées : ${sales.length}`, 14, 35);

    const totalAmount = sales.reduce((acc, v) => acc + v.prixTotal, 0);

    autoTable(doc, {
        startY: 40,
        head: [['Date', 'Référence', 'Boutique', 'Désignation Article', 'Client', 'Quantité', 'Total (GNF)', 'Statut']],
        body: sales.map(v => [
            new Date(v.createdAt).toLocaleDateString('fr-FR'),
            v._id.toString().slice(-6).toUpperCase(),
            v.boutique?.nom || '-',
            v.article?.nom || 'Article supprimé',
            v.client?.nom || 'Passage',
            v.quantite,
            formatPrice(v.prixTotal),
            v.isCancelled ? 'ANNULÉ' : 'VALIDÉ'
        ]),
        theme: 'grid',
        headStyles: { fillColor: [44, 62, 80], fontSize: 9 },
        styles: { fontSize: 8 },
        foot: [['', '', '', '', 'TOTAL GÉNÉRAL', '', formatPrice(totalAmount), '']],
        footStyles: { fillColor: [241, 241, 241], textColor: [0, 0, 0], fontStyle: 'bold' }
    });

    doc.save(`journal_mouvements_${new Date().toISOString().slice(0,10)}.pdf`);
};

/**
 * Génère un rapport récapitulatif pour une sélection de mouvements de stock (Entrées/Sorties/Transferts)
 */
export const generateMovementsSummary = (movements) => {
    const doc = new jsPDF({ orientation: 'portrait', format: 'a4' });
    const pageWidth = doc.internal.pageSize.width;

    // --- EN-TÊTE MODERNE ---
    try { doc.addImage(logo, 'PNG', 14, 10, 40, 15); } catch (e) {}
    
    doc.setFontSize(18).setTextColor(41, 128, 185).setFont("helvetica", "bold");
    doc.text("JOURNAL DES MOUVEMENTS", 60, 20);

    doc.setFontSize(10).setTextColor(100).setFont("helvetica", "normal");
    doc.text(`Généré le : ${new Date().toLocaleString('fr-FR')}`, 60, 26);
    doc.text(`Total opérations : ${movements.length}`, 14, 38);

    // Calcul du montant total à l'achat
    const totalAchatGeneral = movements.reduce((acc, m) => {
        const sumMvt = m.articles.reduce((sum, a) => sum + ((a.prixAchatUnitaire || 0) * a.quantite), 0);
        return acc + sumMvt;
    }, 0);

    // Encadré de résumé financier
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(130, 32, 66, 10, 1, 1, 'F');
    doc.setFontSize(10).setTextColor(0).setFont("helvetica", "bold");
    doc.text(`VALEUR TOTAL ACHAT : ${formatPrice(totalAchatGeneral)} GNF`, 192, 38, { align: 'right' });

    autoTable(doc, {
        startY: 45,
        head: [['Date', 'Type', 'Circuit (De > Vers)', 'Articles', 'Valeur Achat', 'Statut']],
        body: movements.map(m => [
            new Date(m.createdAt).toLocaleDateString('fr-FR'),
            m.type,
            `${m.fournisseur?.nom || m.boutiqueSource?.nom || 'N/A'} > ${m.boutiqueDestination?.nom || (m.type === 'Vente' ? 'Client' : 'N/A')}`,
            m.articles.map(a => `${a.nomArticle} (x${a.quantite})`).join(', '),
            `${formatPrice(m.articles.reduce((sum, a) => sum + ((a.prixAchatUnitaire || 0) * a.quantite), 0))} GNF`,
            m.isCancelled ? 'ANNULÉ' : 'VALIDÉ'
        ]),
        theme: 'grid',
        headStyles: { fillColor: [41, 128, 185], fontSize: 9, halign: 'center' },
        styles: { fontSize: 7, cellPadding: 2, valign: 'middle' },
        columnStyles: {
            2: { cellWidth: 40 }, // Circuit
            3: { cellWidth: 50 }, // Articles
            4: { halign: 'right', fontStyle: 'bold', cellWidth: 30 }, // Valeur
            5: { halign: 'center', cellWidth: 20 }  // Statut
        },
        alternateRowStyles: { fillColor: [248, 249, 250] }
    });

    // --- PIED DE PAGE ---
    const pageCount = doc.internal.getNumberOfPages();
    for(let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8).setTextColor(150);
        doc.text(`StockDash - Rapport de Mouvements`, 14, doc.internal.pageSize.height - 10);
        doc.text(`Page ${i} / ${pageCount}`, pageWidth - 14, doc.internal.pageSize.height - 10, { align: 'right' });
    }

    doc.save(`Rapport_Stock_${new Date().toISOString().slice(0,10)}.pdf`);
};