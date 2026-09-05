const PDFDocument = require("pdfkit");

const path = require("path");

// const { PdfFontManager } = require(path.join(
//   process.cwd(),
//   "lib/pdf/font-manager",
// ));

const { PdfFontManager } = require("../lib/pdf/font-manager");

const {
  GREEN,
  formatMoney,
  drawTopLine,
  drawFooter,
  drawLogo,
  drawKeyValueRows,
  LIGHT_GRAY,
  drawResponsiveTableHeader,
  drawResponsiveTableRow,
} = require("./pdf-helpers");

async function generatePaymentReceiptPdf(req, res) {
  try {
    const { payments, companyDetails } = req.body;

    if (!payments?.length) {
      return res.status(400).json({
        error: "No payments supplied",
      });
    }

    res.setHeader("Content-Type", "application/pdf");

    res.setHeader(
      "Content-Disposition",
      "inline; filename=payment-receipts.pdf",
    );
    const doc = new PDFDocument({
      margin: 40,
      size: "A4",
    });

    doc.on("error", (err) => {
      console.error("PDFKit Error:", err);

      if (!res.headersSent) {
        res.status(500).json({
          error: err.message,
        });
      }
    });

    doc.pipe(res);

    const font = new PdfFontManager(doc);

    let pageNumber = 1;

    for (let p = 0; p < payments.length; p++) {
      const payment = payments[p];

      const isRefund = payment.paymentType === "REFUND";

      // console.log("Receipt Payment.PaymentType", payment.paymentType);
      // console.log("Receipt isRefund", isRefund);

      if (p > 0) {
        doc.addPage();
        pageNumber++;
      }

      drawTopLine(doc);

      let y = 40;

      // =====================================
      // HEADER
      // =====================================

      //doc
      //.font("Helvetica-Bold")
      font.use("bold");
      // doc.fontSize(28).fillColor("#000").text("Receipt", 40, y);

      doc
        .fontSize(28)
        .fillColor("#000")
        .text(isRefund ? "Refund Receipt" : "Receipt", 40, y);

      y += 45;

      y = drawKeyValueRows(doc, {
        startX: 40,
        startY: y,
        labelWidth: 120,
        valueWidth: 180,

        rows: [
          {
            label: "Receipt No",
            value: payment.receiptNumber,
          },
          {
            label: "Payment Date",
            value: payment.paymentDate,
          },
          {
            label: "Payment Method",
            value: payment.method,
          },
          {
            label: "Reference No",
            value: payment.referenceNo,
          },
        ],
        fontManager: font,
      });

      // =====================================
      // LOGO
      // =====================================

      drawLogo(doc);

      // =====================================
      // COMPANY
      // =====================================

      y += 50;

      const company = companyDetails || {};

      //doc
      //.font("Helvetica-Bold")
      font.use("bold");
      doc
        .fontSize(12)
        .fillColor("#000")
        .text(company.name || "", 40, y);

      //doc.font("Helvetica")
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

      // =====================================
      // RECEIVED FROM
      // =====================================

      //doc
      //.font("Helvetica-Bold")
      font.use("bold");
      // doc.fontSize(12).fillColor("#000").text("Received From:", 350, y);

      doc
        .fontSize(12)
        .fillColor("#000")
        .text(isRefund ? "Refunded To:" : "Received From:", 350, y);

      //doc.font("Helvetica").fontSize(10).fillColor(LIGHT_GRAY);
      font.use("regular");
      doc.fontSize(10).fillColor(LIGHT_GRAY);

      let payerY = y + 18;

      if (payment.payerName) {
        doc.text(payment.payerName, 350, payerY);
        payerY += 14;
      }

      if (payment.payerAddress1) {
        doc.text(payment.payerAddress1, 350, payerY);
        payerY += 14;
      }

      if (payment.payerAddress2) {
        doc.text(payment.payerAddress2, 350, payerY);
        payerY += 14;
      }

      if (payment.payerAddress3) {
        doc.text(payment.payerAddress3, 350, payerY);
        payerY += 14;
      }

      if (payment.payerContactNos) {
        doc.text(payment.payerContactNos, 350, payerY);
        payerY += 14;
      }

      y = Math.max(companyY, payerY);
      y += 64;

      // =====================================
      // RECEIPT TEXT
      // =====================================

      //doc
      //.font("Helvetica-Bold")
      font.use("bold");
      doc
        .fontSize(13)
        .fillColor("#000")
        .text(
          isRefund
            ? `Refunded the sum of ${formatMoney(
                payment.amount,
                payment.currencySymbol,
              )}`
            : `Received with thanks the sum of ${formatMoney(
                payment.amount,
                payment.currencySymbol,
              )}`,
          40,
          y,
        );

      // .text(
      //   `Received with thanks the sum of ${formatMoney(
      //     payment.amount,
      //     payment.currencySymbol,
      //   )}`,
      //   40,
      //   y,
      // );

      // =====================================
      // ALLOCATION TABLE
      // =====================================

      y += 40;

      const cols = drawResponsiveTableHeader(doc, {
        y,

        columns: [
          {
            label: "Invoice No",
          },

          {
            label: "Invoice Date",
          },

          {
            label: "Allocated Amount",
          },
        ],

        startX: 40,
        endX: doc.page.width - 40,

        firstColumnPercent: 0.4,

        fontManager: font,
      });

      y += 28;

      for (const alloc of payment.allocations || []) {
        drawResponsiveTableRow(doc, {
          y,

          cols,

          values: [
            alloc.invoiceNumber,

            alloc.invoiceDate,

            formatMoney(alloc.amountAllocated, alloc.currencySymbol),
          ],
          fontManager: font,
        });

        y += 20;
      }

      // =====================================
      // TOTAL
      // =====================================

      y += 25;

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;

      const totalsWidth = 220;

      const totalsX = pageWidth - 40 - totalsWidth;

      y = drawKeyValueRows(doc, {
        startX: totalsX,
        startY: y,

        labelWidth: 120,
        valueWidth: 100,

        labelAlign: "right",
        valueAlign: "right",

        drawTopBorder: true,
        drawRowBorders: true,

        rows: [
          {
            // label: "Total Received :",
            label: isRefund ? "Total Refunded :" : "Total Received :",
            value: formatMoney(payment.amount, payment.currencySymbol),
          },
        ],
        fontManager: font,
      });

      // =====================================
      // NOTES
      // =====================================

      if (payment.notes) {
        y += 40;

        //doc.font("Helvetica-Bold")
        font.use("bold");
        doc.fontSize(11).fillColor("#000").text("Notes", 40, y);

        y += 18;

        //doc.font("Helvetica")
        font.use("regular");
        doc.fontSize(10).fillColor("#000").text(payment.notes, 40, y);
      }

      // =====================================
      // FOOTER
      // =====================================

      drawFooter(doc, pageNumber);
    }

    doc.end();
  } catch (err) {
    console.error("PDF ERROR:", err);

    if (!res.headersSent) {
      return res.status(500).json({
        error: err.message,
      });
    }

    res.end();
  }
}

module.exports = {
  generatePaymentReceiptPdf,
};
