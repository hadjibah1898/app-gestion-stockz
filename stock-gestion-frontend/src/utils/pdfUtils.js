/**
 * @file pdfUtils.js
 * @description Ce fichier regroupe les fonctions utilitaires pour la génération de documents PDF.
 * Il utilise les librairies `jspdf` et `jspdf-autotable` pour créer des PDF stylisés.
 * - `generateReceiptPDF`: Crée un ticket de caisse au format thermique (80mm).
 * - `generateHistoryPDF`: Crée un rapport PDF de l'historique des ventes.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const generateReceiptPDF = (ticketData) => {
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: [80, 250] }); // Increased height
  const { shopName = 'BOUTIQUE KALOUM', address = 'KALOUM', phone = '620240948', transactionId = 'N/A', date = new Date(), clientName = 'Client de passage', cashierName = 'N/A', items = [], subTotal = 0, discount = 0, totalNet = 0, amountPaid = 0, change = 0, } = ticketData;
  const formatCurrency = (value) => (new Intl.NumberFormat('fr-FR').format(value || 0) + ' GNF').replace(/[\u00a0\u202f]/g, ' ');
  let y = 10;
  doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.text(shopName, 40, y, { align: 'center' }); y += 5;
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.text(address, 40, y, { align: 'center' }); y += 4;
  doc.text(`Tél: ${phone}`, 40, y, { align: 'center' }); y += 6;
  doc.setLineDashPattern([0.5, 0.5], 0); doc.line(5, y, 75, y); y += 5;
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text('TICKET DE VENTE', 40, y, { align: 'center' }); y += 5;
  doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  doc.text(`Transaction #: ${transactionId}`, 5, y); y += 4;
  doc.text(`Date: ${new Date(date).toLocaleString('fr-FR')}`, 5, y); y += 4;
  doc.text(`Client: ${clientName}`, 5, y); y += 4;
  doc.text(`Caissier: ${cashierName}`, 5, y); y += 6;
  doc.setLineDashPattern([0.5, 0.5], 0); doc.line(5, y, 75, y);
  autoTable(doc, { 
      head: [["Article", "P.U.", "Qté", "Total"]], 
      body: items.map(item => [item.article.nom, formatCurrency(item.prixUnitaire), `x${item.quantite}`, formatCurrency(item.prixTotal)]), 
      startY: y + 2, 
      theme: 'plain', 
      styles: { fontSize: 8, cellPadding: 0.5 }, 
      headStyles: { fontStyle: 'bold', halign: 'center' }, 
      columnStyles: { 
          0: { halign: 'left' }, 
          1: { halign: 'right' }, 
          2: { halign: 'center' },
          3: { halign: 'right' } 
      }, 
      margin: { left: 5, right: 5 } 
  });
  y = doc.lastAutoTable.finalY + 2;
  doc.setLineDashPattern([0.5, 0.5], 0); doc.line(5, y, 75, y);

  const totalsBody = [
      ['Sous-total:', formatCurrency(subTotal)],
      ['Remise:', `- ${formatCurrency(discount)}`],
      ['TOTAL NET:', formatCurrency(totalNet)],
      ['Montant Payé:', formatCurrency(amountPaid)],
      [change >= 0 ? 'Rendu:' : 'Reste à payer:', formatCurrency(Math.abs(change))]
  ];

  autoTable(doc, {
      body: totalsBody,
      startY: y + 2,
      theme: 'plain',
      styles: { fontSize: 8, cellPadding: 0.8 },
      columnStyles: { 0: { halign: 'left', fontStyle: 'normal' }, 1: { halign: 'right', fontStyle: 'bold' } },
      didParseCell: function (data) { if (data.row.index === 2) { data.cell.styles.fontStyle = 'bold'; data.cell.styles.fontSize = 10; } },
      margin: { left: 5, right: 5 }
  });

  y = doc.lastAutoTable.finalY + 2;
  doc.setLineDashPattern([0.5, 0.5], 0); doc.line(5, y, 75, y); y += 5;
  doc.setFont('helvetica', 'bold'); doc.text("Merci pour votre confiance !", 40, y, { align: 'center' });
  doc.output('dataurlnewwindow');
};

export const generateHistoryPDF = (historique) => {
    const doc = new jsPDF();
    
    doc.setFillColor(41, 128, 185);
    doc.rect(0, 0, 210, 25, 'F');
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text("Historique des Ventes", 14, 16);
    doc.setFontSize(10);
    doc.setTextColor(220, 220, 220);
    doc.text(`Généré le : ${new Date().toLocaleDateString('fr-FR')}`, 14, 22);

    const tableColumn = ["Date", "Article", "Quantité", "Prix Total", "Vendeur", "Client"];
    const tableRows = [];
    let totalGlobal = 0;

    historique.forEach(vente => {
      totalGlobal += vente.prixTotal;
      const venteData = [
        new Date(vente.createdAt).toLocaleDateString() + ' ' + new Date(vente.createdAt).toLocaleTimeString(),
        vente.article?.nom || 'Article supprimé',
        vente.quantite,
        (vente.prixTotal.toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' '),
        vente.gerant?.nom || 'Inconnu',
        vente.client?.nom || 'Passage'
      ];
      tableRows.push(venteData);
    });

    tableRows.push([
      "", 
      "", 
      "TOTAL GLOBAL", 
      (totalGlobal.toLocaleString('fr-FR') + ' GNF').replace(/[\u00a0\u202f]/g, ' '), 
      "",
      ""
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 35,
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185] },
      alternateRowStyles: { fillColor: [248, 249, 250] },
      columnStyles: {
        3: { halign: 'right' }
      },
      didParseCell: (data) => {
        if (data.row.index === tableRows.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [240, 240, 240];
        }
      }
    });

    const pageCount = doc.internal.getNumberOfPages();
    for(let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        const pageSize = doc.internal.pageSize;
        const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
        doc.text(`StockDash - Ventes`, 14, pageHeight - 10);
        doc.text(`Page ${i} sur ${pageCount}`, pageSize.width - 20, pageHeight - 10, { align: 'right' });
    }

    doc.save("historique_ventes.pdf");
};