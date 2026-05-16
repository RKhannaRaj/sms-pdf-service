const PDFDocument = require("pdfkit");

const path = require("path");

// const { PdfFontManager } = require(path.join(
//   process.cwd(),
//   "lib/pdf/font-manager",
// ));

const { PdfFontManager } = require("../lib/pdf/font-manager");

const {
  formatMoney,
  drawTopLine,
  drawFooter,
  drawLogo,
  drawKeyValueRows,
  LIGHT_GRAY,
  drawResponsiveTableHeader,
  drawResponsiveTableRow,
} = require("./pdf-helpers");

const fs = require("fs");

async function generateInvoicePdf(req, res) {
  try {
    const { invoices, companyDetails, companyBankDetails } = req.body;

    if (!invoices || !invoices.length) {
      return res.status(400).json({
        error: "No invoices supplied",
      });
    }

    res.setHeader("Content-Type", "application/pdf");

    res.setHeader("Content-Disposition", "inline; filename=invoices.pdf");

    const doc = new PDFDocument({
      margin: 40,
      size: "A4",
    });

    doc.pipe(res);

    const font = new PdfFontManager(doc);

    // =========================================
    // CONFIG
    // =========================================

    const GREEN = "#59c2a3";
    //    const LIGHT_GRAY = "#666666";

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;

    // Optional logo path
    //    const logoPath = path.join(__dirname, "logo.png");
    const logoPath = path.join(__dirname, "assets", "logo.png");

    // =========================================
    // HELPERS
    // =========================================

    // const drawTableHeader = (y, hasDiscount, taxColumns) => {
    //   const cols = [];

    //   let x = 40;

    //   cols.push({
    //     label: "Charge Name",
    //     x,
    //     width: 170,
    //   });

    //   x += 170;

    //   cols.push({
    //     label: "Amount",
    //     x,
    //     width: 70,
    //   });

    //   x += 70;

    //   if (hasDiscount) {
    //     cols.push({
    //       label: "Discount %",
    //       x,
    //       width: 70,
    //     });

    //     x += 70;

    //     cols.push({
    //       label: "Discount",
    //       x,
    //       width: 70,
    //     });

    //     x += 70;
    //   }

    //   // Dynamic Tax Columns
    //   for (const taxName of taxColumns) {
    //     cols.push({
    //       label: taxName,
    //       x,
    //       width: 60,
    //     });

    //     x += 60;
    //   }

    //   cols.push({
    //     label: "Total",
    //     x,
    //     width: 70,
    //   });

    //   doc.font("Helvetica-Bold").fontSize(10);

    //   cols.forEach((c) => {
    //     doc.text(c.label, c.x, y, {
    //       width: c.width,
    //       align: c.label === "Charge Name" ? "left" : "right",
    //     });
    //   });

    //   // underline
    //   doc
    //     .moveTo(40, y + 18)
    //     .lineTo(pageWidth - 40, y + 18)
    //     .strokeColor("#000")
    //     .lineWidth(1)
    //     .stroke();

    //   return cols;
    // };

    // const drawTableRow = (y, row, cols, hasDiscount, taxColumns) => {
    //   doc.font("Helvetica").fontSize(10);

    //   const values = [];

    //   values.push(row.chargeName);

    //   values.push(formatMoney(row.chargeAmount));

    //   if (hasDiscount) {
    //     values.push(row.discountPercent ? `${row.discountPercent}%` : "-");

    //     values.push(row.discountAmount ? formatMoney(row.discountAmount) : "-");
    //   }

    //   // Dynamic tax values
    //   for (const taxName of taxColumns) {
    //     values.push(row.taxes[taxName] ? formatMoney(row.taxes[taxName]) : "-");
    //   }

    //   values.push(formatMoney(row.total));

    //   cols.forEach((c, i) => {
    //     doc.text(values[i], c.x, y, {
    //       width: c.width,
    //       align: i === 0 ? "left" : "right",
    //     });
    //   });
    // };

    // =========================================
    // GENERATE
    // =========================================

    let pageNumber = 1;

    for (let invIndex = 0; invIndex < invoices.length; invIndex++) {
      const invoice = invoices[invIndex];

      if (invIndex > 0) {
        doc.addPage();
        pageNumber++;
      }

      drawTopLine(doc);

      // =====================================
      // HEADER SECTION
      // =====================================

      let y = 40;

      // LEFT

      // doc
      //   //.font("Helvetica-Bold")
      font.use("bold");
      doc.fontSize(28).fillColor("#000").text("Invoice", 40, y);

      y += 45;

      font.use("regular");
      doc.fontSize(10).fillColor("#000");

      y = drawKeyValueRows(doc, {
        startX: 40,
        startY: y,
        labelWidth: 90,
        valueWidth: 180,
        rowHeight: 18,

        rows: [
          {
            label: "Invoice No",
            value: invoice.invoiceNumber,
          },
          {
            label: "Date of Issue",
            value: invoice.invoiceDate,
          },
          {
            label: "Due Date",
            value: invoice.dueDate,
          },
        ],
      });
      // RIGHT LOGO
      drawLogo(doc);
      // const logoWidth = 150;

      // const logoStartX = pageWidth - 40 - logoWidth;

      // if (fs.existsSync(logoPath)) {
      //   doc.image(logoPath, logoStartX, 25, {
      //     width: logoWidth,
      //   });
      // }

      // =====================================
      // COMPANY + BILLER SECTION
      // =====================================

      y += 50;

      // =====================================
      // COMPANY DETAILS
      // =====================================

      const company = companyDetails || {};

      //      doc
      //      .font("Helvetica-Bold")
      font
        .use("bold")
        .fontSize(12)
        .fillColor("#000")
        .text(company.name || "Company Name", 40, y);

      //doc.font("Helvetica").
      font.use("regular");
      doc.fontSize(10).fillColor(LIGHT_GRAY);

      let companyY = y + 18;

      if (company.addressLine1) {
        doc.text(company.addressLine1, 40, companyY);
        companyY += 14;
      }

      if (company.addressLine2) {
        doc.text(company.addressLine2, 40, companyY);
        companyY += 14;
      }

      if (company.postcode) {
        doc.text(`${company.postcode}-${company.addressLine3}`, 40, companyY);
        companyY += 14;
      }

      if (company.country) {
        doc.text(company.country, 40, companyY);
        companyY += 14;
      }

      if (company.phone) {
        doc.text(company.phone, 40, companyY);
        companyY += 14;
      }

      if (company.email) {
        doc.text(company.email, 40, companyY);
        companyY += 14;
      }

      if (company.tax1Code) {
        doc.text(`${company.tax1Name}-${company.tax1Code}`, 40, companyY);
        companyY += 14;
      }

      // Biller Right

      //doc
      //.font("Helvetica-Bold")
      font.use("bold");
      doc.fontSize(12).fillColor("#000").text("Bill To:", 350, y);

      //doc.font("Helvetica").fontSize(10).fillColor(LIGHT_GRAY);
      font.use("regular");
      doc.fontSize(10).fillColor(LIGHT_GRAY);

      let billerY = y + 18;

      if (invoice.payerName) {
        doc.text(invoice.payerName, 350, billerY);
        billerY += 14;
      }

      if (invoice.payerAddress1) {
        doc.text(invoice.payerAddress1, 350, billerY);
        billerY += 14;
      }

      if (invoice.payerAddress2) {
        doc.text(invoice.payerAddress2, 350, billerY);
        billerY += 14;
      }

      if (invoice.payerAddress3) {
        doc.text(`${invoice.payerAddress3}`, 350, billerY);
        billerY += 14;
      }

      if (invoice.payerContactNos) {
        doc.text(invoice.payerContactNos, 350, billerY);
        billerY += 14;
      }

      // =====================================
      // DUE AMOUNT
      // =====================================

      y = Math.max(companyY, billerY);
      y += 65;

      //doc
      //.font("Helvetica-Bold")
      font
        .use("bold")
        .fontSize(13)
        .fillColor("#000")
        .text(
          `${
            formatMoney(invoice.balanceAmount, invoice.currencySymbol) || 0
          } due by ${invoice.dueDate || "N/A"}`,
          40,
          y,
        );

      // =====================================
      // STUDENT / BUSINESS UNIT
      // =====================================

      y += 20;

      //doc
      //.font("Helvetica-Bold")
      font
        .use("bold")
        .fontSize(12)
        .text(invoice.studentName || invoice.businessUnitName || "", 40, y);

      // =====================================
      // GROUP DATA
      // =====================================

      const grouped = {};

      const taxTypes = new Set();

      for (const line of invoice.lines || []) {
        if (line.lineType === "Tax") {
          taxTypes.add(line.chargeType);
        }
      }

      const taxColumns = Array.from(taxTypes);

      const hasDiscount = invoice.lines.some(
        (l) => Number(l.discountAmount || 0) > 0,
      );

      let totalOriginalAmount = 0;

      let totalDiscountAmount = 0;

      let totalTaxAmount = 0;

      let grandTotal = 0;

      // ======================================
      // PROCESS ONLY MAIN CHARGE ROWS
      // ======================================

      const processed = new Set();

      for (const line of invoice.lines || []) {
        // Skip tax rows
        if (line.lineType === "Tax") {
          continue;
        }

        const child = line.studentName || "Unknown";

        if (!grouped[child]) {
          grouped[child] = [];
        }

        // unique grouping key
        const key = `${child}-${line.chargeType}`;

        if (processed.has(key)) {
          continue;
        }

        processed.add(key);

        // ======================================
        // FIND RELATED ROWS
        // ======================================

        const relatedRows = invoice.lines.filter(
          (r) =>
            r.studentName === line.studentName &&
            r.chargeType === line.chargeType,
        );

        // Main Amount
        const mainRow =
          relatedRows.find(
            (r) => Number(r.discountAmount || 0) === 0 && r.lineType !== "Tax",
          ) || line;

        // Discount Row
        const discountRow = relatedRows.find(
          (r) => Number(r.discountAmount || 0) > 0,
        );

        // ======================================
        // TAXES
        // ======================================

        const rowTaxes = {};

        for (const taxName of taxColumns) {
          const taxRow = invoice.lines.find(
            (t) =>
              t.lineType === "Tax" &&
              t.chargeType === taxName &&
              t.studentName === line.studentName &&
              Number(t.originalAmount || 0) ===
                Number(mainRow.originalAmount || 0),
          );

          rowTaxes[taxName] = Number(taxRow?.finalAmount || 0);
        }

        // ======================================
        // VALUES
        // ======================================

        const originalAmount = Number(mainRow.originalAmount || 0);

        const discountAmount = Number(discountRow?.discountAmount || 0);

        const discountPercent = Number(discountRow?.discountPercent || 0);

        const totalTaxForRow = Object.values(rowTaxes).reduce(
          (a, b) => a + b,
          0,
        );

        const finalTotal = originalAmount - discountAmount + totalTaxForRow;

        // ======================================
        // TOTALS
        // ======================================

        totalOriginalAmount += originalAmount;

        totalDiscountAmount += discountAmount;

        totalTaxAmount += totalTaxForRow;

        grandTotal += finalTotal;

        // ======================================
        // PUSH FINAL ROW
        // ======================================

        grouped[child].push({
          chargeName: mainRow.chargeType,

          chargeAmount: originalAmount,

          discountPercent,

          discountAmount,

          taxes: rowTaxes,

          total: finalTotal,
        });
      }
      //   const hasDiscount = invoice.lines.some(
      //     (l) => Number(l.discountAmount || 0) > 0,
      //   );

      // =====================================
      // TABLE cols
      // =====================================

      y += 30;

      //const cols = drawTableHeader(y, hasDiscount, taxColumns);
      const tableColumns = [
        {
          label: "Charge Name",
        },

        {
          label: "Amount",
        },
      ];

      if (hasDiscount) {
        tableColumns.push(
          {
            label: "Discount %",
          },

          {
            label: "Discount",
          },
        );
      }

      for (const taxName of taxColumns) {
        tableColumns.push({
          label: taxName,
        });
      }

      tableColumns.push({
        label: "Total",
      });

      const cols = drawResponsiveTableHeader(doc, {
        y,

        columns: tableColumns,

        startX: 40,
        endX: pageWidth - 40,

        firstColumnPercent: 0.3,
      });

      y += 28;

      for (const child of Object.keys(grouped)) {
        //doc.font("Helvetica-Bold")
        font.use("bold");
        doc.fontSize(10).text(child, 40, y);

        y += 18;

        for (const row of grouped[child]) {
          //drawTableRow(y, row, cols, hasDiscount, taxColumns);
          const values = [];

          values.push(row.chargeName);

          values.push(formatMoney(row.chargeAmount, row.currencySymbol));

          if (hasDiscount) {
            values.push(row.discountPercent ? `${row.discountPercent}%` : "-");

            values.push(
              row.discountAmount
                ? formatMoney(row.discountAmount, row.currencySymbol)
                : "-",
            );
          }

          for (const taxName of taxColumns) {
            values.push(
              row.taxes[taxName]
                ? formatMoney(row.taxes[taxName], row.currencySymbol)
                : "-",
            );
          }

          values.push(formatMoney(row.total, row.currencySymbol));

          drawResponsiveTableRow(doc, {
            y,
            cols,
            values,
          });

          y += 20;

          if (y > 700) {
            drawFooter(doc, pageNumber);

            doc.addPage();

            pageNumber++;

            drawTopLine(doc);

            y = 60;
            // page break - redraw header

            //const newCols = drawTableHeader(y, hasDiscount, taxColumns);
            const newCols = drawResponsiveTableHeader(doc, {
              y,

              columns: tableColumns,

              startX: 40,
              endX: pageWidth - 40,

              firstColumnPercent: 0.3,
            });

            y += 28;

            cols.splice(0, cols.length, ...newCols);
          }
        }

        y += 12;
      }

      // =====================================
      // TOTALS
      // =====================================

      y += 20;

      //   doc
      //     .font("Helvetica-Bold")
      //     .fontSize(11)
      //     .text(`Total Amount: ${formatMoney(invoice.totalAmount)}`, 400, y, {
      //       width: 150,
      //       align: "right",
      //     });

      //   y += 20;

      //   doc.text(`Paid Amount: ${formatMoney(invoice.paidAmount)}`, 400, y, {
      //     width: 150,
      //     align: "right",
      //   });

      //   y += 20;

      //   doc.text(`Balance Due: ${formatMoney(invoice.balanceAmount)}`, 400, y, {
      //     width: 150,
      //     align: "right",
      //   });

      const totalsTableWidth = 210;

      const totalsStartX = pageWidth - 40 - totalsTableWidth;

      y = drawKeyValueRows(doc, {
        startX: totalsStartX,

        startY: y,

        labelWidth: 110,

        valueWidth: 100,

        rowHeight: 18,

        labelAlign: "right",

        valueAlign: "right",

        drawTopBorder: true,

        drawRowBorders: true,

        borderColor: "#999",

        rows: [
          {
            label: "Total Amount :",
            value: formatMoney(invoice.totalAmount, invoice.currencySymbol),
          },

          {
            label: "Paid Amount :",
            value: formatMoney(invoice.paidAmount, invoice.currencySymbol),
          },

          {
            label: "Balance Due :",
            value: formatMoney(invoice.balanceAmount, invoice.currencySymbol),
          },
        ],
      });

      // =====================================
      // PAYMENT SECTION
      // =====================================

      y += 30;

      //doc
      //.font("Helvetica-Bold")
      font
        .use("bold")
        .fontSize(12)
        .fillColor("#000")
        .text(
          `Pay ${formatMoney(invoice.balanceAmount, invoice.currencySymbol)}`,
          40,
          y,
        );

      y += 20;

      //doc
      //.font("Helvetica")
      font
        .use("regular")
        .fontSize(10)
        .fillColor("#000")
        .text("via bank transfer", 40, y);

      y += 25;

      // =====================================
      // COMPANY BANK DETAILS
      // =====================================

      const bank = companyBankDetails || {};

      y = drawKeyValueRows(doc, {
        startX: 40,
        startY: y,
        labelWidth: 100,
        valueWidth: 250,
        rowHeight: 16,

        rows: [
          {
            label: "Bank Name",
            value: bank.name,
          },
          {
            label: "Account Number",
            value: bank.accountNumber,
          },
          {
            label: bank.accountNumber2Name || "Alt Account",
            value: bank.accountNumber2,
          },
          {
            label: "Branch",
            value: bank.branchName,
          },
        ],
      });

      // =====================================
      // FOOTER
      // =====================================

      drawFooter(doc, pageNumber);
    }

    doc.end();
  } catch (err) {
    console.error("PDF ERROR:", err);

    return res.status(500).json({
      error: err.message,
    });
  }
}

module.exports = {
  generateInvoicePdf,
};
