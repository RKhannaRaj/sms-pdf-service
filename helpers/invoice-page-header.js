const { drawTopLine, drawLogo, drawKeyValueRows } = require("./pdf-helpers");

function drawInvoicePageHeader(doc, invoice, font) {
  drawTopLine(doc);
  // Body borders and footers must not inherit the decorative line's 12pt width.
  doc.lineWidth(1);

  font.use("bold");
  doc.fontSize(28).fillColor("#000").text("Invoice", 40, 40);

  font.use("regular");
  doc.fontSize(10).fillColor("#000");
  const rowsEnd = drawKeyValueRows(doc, {
    startX: 40,
    startY: 85,
    labelWidth: 90,
    valueWidth: 180,
    rowHeight: 18,
    rows: [
      { label: "Invoice No", value: invoice.invoiceNumber },
      { label: "Date of Issue", value: invoice.invoiceDate },
      { label: "Due Date", value: invoice.dueDate },
    ],
    fontManager: font,
  });

  let headerBottom = Math.max(rowsEnd, doc.y);
  drawLogo(doc);
  headerBottom = Math.max(headerBottom, doc.y);

  if (invoice.status === "CANCELLED" || invoice.status === "Cancelled") {
    font.use("bold");
    doc
      .fontSize(10)
      .fillColor("#c00000")
      .text("Invoice Status: Cancelled", doc.page.width - 220, 125, {
        width: 180,
        align: "right",
      });
    headerBottom = Math.max(headerBottom, doc.y);
  }

  // Preserve the first page's existing separation below the identity block.
  return headerBottom + 50;
}

module.exports = { drawInvoicePageHeader };
