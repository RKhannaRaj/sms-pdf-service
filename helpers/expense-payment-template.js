const PDFDocument = require("pdfkit");
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

const CONTENT_BOTTOM_OFFSET = 100;
const ROW_FONT_SIZE = 10;

function drawPaymentStatus(doc, font, payment) {
  if (String(payment.status || "").toUpperCase() !== "CANCELLED") return;
  font.use("bold");
  doc
    .fontSize(10)
    .fillColor("#c00000")
    .text("Payment Status: Cancelled", doc.page.width - 220, 125, {
      width: 180,
      align: "right",
    });
}

function drawVoucherHeader(doc, font, payment, companyDetails, pageNumber) {
  drawTopLine(doc);
  let y = 40;
  font.use("bold");
  doc.fontSize(28).fillColor("#000").text("Payment Voucher", 40, y);
  y += 45;
  y = drawKeyValueRows(doc, {
    startX: 40,
    startY: y,
    labelWidth: 120,
    valueWidth: 180,
    rows: [
      { label: "Payment No", value: payment.receiptNumber },
      { label: "Payment Date", value: payment.paymentDate },
      { label: "Payment Method", value: payment.method },
      { label: "Reference No", value: payment.referenceNo },
    ],
    fontManager: font,
  });
  drawLogo(doc);
  drawPaymentStatus(doc, font, payment);

  y += 50;
  const company = companyDetails || {};
  font.use("bold");
  doc
    .fontSize(12)
    .fillColor("#000")
    .text(company.name || "", 40, y);
  font.use("regular");
  doc.fontSize(10).fillColor(LIGHT_GRAY);
  let companyY = y + 18;
  for (const [key, value] of [
    ["addressLine1", company.addressLine1],
    ["addressLine2", company.addressLine2],
    [
      "postcode",
      company.postcode
        ? `${company.postcode}-${company.addressLine3 || ""}`
        : "",
    ],
    ["country", company.country],
    ["phone", company.phone],
    ["email", company.email],
    ["tax", company.tax1Code ? `${company.tax1Name}-${company.tax1Code}` : ""],
  ]) {
    if (!value) continue;
    doc.text(value, 40, companyY);
    companyY += 14;
  }

  font.use("bold");
  doc.fontSize(12).fillColor("#000").text("Paid To:", 350, y);
  font.use("regular");
  doc.fontSize(10).fillColor(LIGHT_GRAY);
  let payeeY = y + 18;
  for (const value of [
    payment.payerName,
    payment.payerAddress1,
    payment.payerAddress2,
    payment.payerAddress3,
    payment.payerContactNos,
  ]) {
    if (!value) continue;
    doc.text(value, 350, payeeY);
    payeeY += 14;
  }
  y = Math.max(companyY, payeeY) + 64;
  font.use("bold");
  doc
    .fontSize(13)
    .fillColor("#000")
    .text(
      `Paid the sum of ${formatMoney(payment.amount, payment.currencySymbol)}`,
      40,
      y,
    );
  y += 40;
  const cols = drawResponsiveTableHeader(doc, {
    y,
    columns: [
      { label: "Expense No" },
      { label: "Expense Date" },
      { label: "Expense Amount" },
      { label: "Amount Paid" },
    ],
    startX: 40,
    endX: doc.page.width - 40,
    firstColumnPercent: 0.34,
    fontManager: font,
  });
  return { y: y + 28, cols, pageNumber };
}

function allocationValues(allocation, payment) {
  return [
    allocation.expenseNumber || "",
    allocation.expenseDate || "",
    formatMoney(allocation.expenseAmount, allocation.currencySymbol || ""),
    formatMoney(allocation.amountPaid, payment.currencySymbol || ""),
  ];
}

async function generateExpensePaymentVoucherPdf(req, res) {
  try {
    const { payments, companyDetails } = req.body;
    if (!payments?.length)
      return res.status(400).json({ error: "No payments supplied" });
    if (payments.some((payment) => payment.paymentType !== "PAYMENT")) {
      return res.status(400).json({
        error: "Expense payment vouchers accept PAYMENT transactions only.",
      });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "inline; filename=expense-payment-vouchers.pdf",
    );
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    doc.on("error", (err) => {
      console.error("PDFKit Error:", err);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    });
    doc.pipe(res);
    const font = new PdfFontManager(doc);
    let pageNumber = 1;
    const contentBottom = () => doc.page.height - CONTENT_BOTTOM_OFFSET;

    for (let index = 0; index < payments.length; index++) {
      const payment = payments[index];
      if (index > 0) {
        drawFooter(doc, pageNumber);
        doc.addPage();
        pageNumber++;
      }
      let layout = drawVoucherHeader(
        doc,
        font,
        payment,
        companyDetails,
        pageNumber,
      );
      const allocations = Array.isArray(payment.expenseAllocations)
        ? payment.expenseAllocations
        : [];
      const mixedCurrencyAllocations = allocations.filter((allocation) => {
        const paymentCode = String(payment.currencyCode || "")
          .trim()
          .toUpperCase();
        const expenseCode = String(allocation.currencyCode || "")
          .trim()
          .toUpperCase();
        return paymentCode && expenseCode && paymentCode !== expenseCode;
      });
      if (mixedCurrencyAllocations.length) {
        console.warn(
          "Expense payment voucher contains mixed currencies; values are shown in their source currencies without conversion.",
          {
            paymentNumber: payment.receiptNumber,
            paymentCurrency: payment.currencyCode,
            expenseCurrencies: [
              ...new Set(
                mixedCurrencyAllocations.map(
                  (allocation) => allocation.currencyCode,
                ),
              ),
            ],
          },
        );
      }
      let rowIndex = 0;
      while (rowIndex < allocations.length) {
        const values = allocationValues(allocations[rowIndex], payment);
        const heights = values.map((value, colIndex) =>
          doc.heightOfString(String(value), {
            width: layout.cols[colIndex].width - 4,
            fontSize: ROW_FONT_SIZE,
          }),
        );
        const rowHeight = Math.max(20, ...heights) + 4;
        if (layout.y + rowHeight > contentBottom()) {
          drawFooter(doc, pageNumber);
          doc.addPage();
          pageNumber++;
          layout = drawVoucherHeader(
            doc,
            font,
            payment,
            companyDetails,
            pageNumber,
          );
          continue;
        }
        drawResponsiveTableRow(doc, {
          y: layout.y,
          cols: layout.cols,
          values,
          fontSize: ROW_FONT_SIZE,
          fontManager: font,
        });
        layout.y += rowHeight;
        rowIndex++;
      }

      const totalTop = layout.y + 25;
      const note = payment.notes ? String(payment.notes) : "";
      const noteHeight = note
        ? doc.heightOfString(note, {
            width: doc.page.width - 80,
            fontSize: 10,
          }) + 58
        : 0;
      if (totalTop + 30 + noteHeight > contentBottom()) {
        drawFooter(doc, pageNumber);
        doc.addPage();
        pageNumber++;
        layout = drawVoucherHeader(
          doc,
          font,
          payment,
          companyDetails,
          pageNumber,
        );
      }
      let y = layout.y + 25;
      const totalsX = doc.page.width - 40 - 220;
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
            label: "Total Paid:",
            value: formatMoney(payment.amount, payment.currencySymbol),
          },
        ],
        fontManager: font,
      });
      if (note) {
        y += 40;
        font.use("bold");
        doc.fontSize(11).fillColor("#000").text("Notes", 40, y);
        y += 18;
        font.use("regular");
        doc
          .fontSize(10)
          .fillColor("#000")
          .text(note, 40, y, { width: doc.page.width - 80 });
      }
      drawFooter(doc, pageNumber);
    }
    doc.end();
  } catch (err) {
    console.error("PDF ERROR:", err);
    if (!res.headersSent) return res.status(500).json({ error: err.message });
    res.end();
  }
}

module.exports = { generateExpensePaymentVoucherPdf };
