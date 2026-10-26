const PDFDocument = require("pdfkit");

const path = require("path");

const { PdfFontManager } = require("../lib/pdf/font-manager");
const { measureBillTo, drawBillTo } = require("./invoice-bill-to");
const { drawInvoicePageHeader } = require("./invoice-page-header");

const {
  formatMoney,
  drawFooter,
  drawKeyValueRows,
  LIGHT_GRAY,
  drawResponsiveTableHeader,
  drawResponsiveTableRow,
} = require("./pdf-helpers");

const fs = require("fs");

const LINE_TYPES = Object.freeze({
  TAX: "TAX",
  CHARGE: "CHARGE",
  DISCOUNT: "DISCOUNT",
});

function normalizeLineType(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function isLineType(value, expected) {
  return normalizeLineType(value) === normalizeLineType(expected);
}

function isChargeLineType(value) {
  return (
    isLineType(value, LINE_TYPES.CHARGE) || normalizeLineType(value) === ""
  );
}

function toMinorUnits(value) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount)
    ? Math.round((amount + Number.EPSILON) * 100)
    : 0;
}

function fromMinorUnits(value) {
  return value / 100;
}

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

    // =========================================
    // GENERATE
    // =========================================

    let pageNumber = 1;
    // Keep body text above the footer timestamp as well as the separator.
    const contentBottom = pageHeight - 100;
    for (let invIndex = 0; invIndex < invoices.length; invIndex++) {
      const invoice = invoices[invIndex];

      if (invIndex > 0) {
        doc.addPage();
        pageNumber++;
      }

      const pageTop = drawInvoicePageHeader(doc, invoice, font);
      let y = pageTop;

      // These closures belong to this invoice, including all continuation pages.
      const nextPage = () => {
        doc.lineWidth(1);
        drawFooter(doc, pageNumber);
        doc.addPage();
        pageNumber++;
        return drawInvoicePageHeader(doc, invoice, font);
      };
      const ensureSpace = (startY, height) => {
        // An oversized block already at the body start must be split in place.
        if (startY + height <= contentBottom || startY === pageTop)
          return startY;
        return nextPage();
      };

      // COMPANY + BILLER SECTION

      const billToLayout = measureBillTo(doc, font, invoice);
      // Move both columns together when the Bill To block needs a fresh page.
      // Oversized blocks are continued explicitly by drawBillTo.
      y = ensureSpace(y, billToLayout.height);

      // =====================================
      // COMPANY DETAILS
      // =====================================

      const company = companyDetails || {};

      font.use("bold");
      doc
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
      const companyPage = doc.page;
      const billerY = drawBillTo(doc, font, billToLayout, {
        y,
        bottom: contentBottom,
        pageTop,
        nextPage,
      });

      // =====================================
      // DUE AMOUNT
      // =====================================

      y = doc.page === companyPage ? Math.max(companyY, billerY) : billerY;
      y += 65;
      // Keep the due amount, student/BU heading and start of the table clear
      // of the footer, including when Bill To continued onto another page.
      y = ensureSpace(y, 130);

      //doc
      //.font("Helvetica-Bold")
      font.use("bold");
      doc
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
      font.use("bold");
      doc
        .fontSize(12)
        .text(invoice.studentName || invoice.businessUnitName || "", 40, y);

      // =====================================
      // GROUP DATA
      // =====================================

      const grouped = {};

      const taxTypes = new Set();

      for (const line of invoice.lines || []) {
        if (isLineType(line.lineType, LINE_TYPES.TAX)) {
          taxTypes.add(line.chargeType);
        }
      }

      const taxColumns = Array.from(taxTypes);

      // const hasDiscount = invoice.lines.some(
      //   (l) => Number(l.discountAmount || 0) > 0,
      // );

      const hasDiscount = (invoice.lines || []).some(
        (l) =>
          isLineType(l.lineType, LINE_TYPES.DISCOUNT) &&
          Math.abs(Number(l.discountAmount ?? l.finalAmount ?? 0)) > 0 &&
          normalizeLineType(
            l.applicationScope ??
              l.application_scope ??
              l.discountMetadata?.application_scope,
          ) !== "PER_STUDENT_BU" &&
          l.displayOnChargeRow !== false,
      );

      // PER_STUDENT_BU discounts remain separate from charge finalAmount.
      const buDiscountLines = (invoice.lines || []).filter(
        (line) =>
          isLineType(line.lineType, LINE_TYPES.DISCOUNT) &&
          normalizeLineType(
            line.applicationScope ??
              line.application_scope ??
              line.discountMetadata?.application_scope,
          ) === "PER_STUDENT_BU",
      );

      let totalOriginalAmount = 0;

      let totalDiscountAmount = 0;

      let totalTaxAmount = 0;

      const allTaxLines = (invoice.lines || []).filter((line) =>
        isLineType(line.lineType, LINE_TYPES.TAX),
      );
      const matchedAllocationRefs = new Set();
      const taxLineIndexes = new Map(
        allTaxLines.map((line, index) => [line, index]),
      );
      const hasTaxLines = allTaxLines.length > 0;
      const invoiceTaxTotalMinor = allTaxLines.reduce(
        (sum, line) => sum + toMinorUnits(line.finalAmount),
        0,
      );

      let grandTotal = 0;

      // ======================================
      // PROCESS ONLY MAIN CHARGE ROWS
      // ======================================

      const processed = new Set();

      let totalAmountExcludingTaxMinor = 0;

      for (const line of invoice.lines || []) {
        // Skip tax rows
        if (!isChargeLineType(line.lineType)) {
          continue;
        }

        const child = line.studentName || "Unknown";

        if (!grouped[child]) {
          grouped[child] = [];
        }

        // Charge rows with the same persisted scope are intentionally displayed
        // as one row; sum every source line and each matching tax allocation.
        const linePeriodStart = line.billingStart || line.usageStart || "";
        const linePeriodEnd = line.billingEnd || line.usageEnd || "";
        const keyParts = [
          line.studentId || line.studentName || "Unknown",
          line.businessUnitId || "",
          line.chargeTypeId || line.chargeType || "",
          linePeriodStart,
          linePeriodEnd,
        ];
        const key = JSON.stringify(keyParts);

        if (processed.has(key)) {
          continue;
        }

        processed.add(key);

        // ======================================
        // FIND RELATED ROWS
        // ======================================

        const matchesGroup = (r) =>
          JSON.stringify([
            r.studentId || r.studentName || "Unknown",
            r.businessUnitId || "",
            r.chargeTypeId || r.chargeType || "",
            r.billingStart || r.usageStart || "",
            r.billingEnd || r.usageEnd || "",
          ]) === key;
        const relatedRows = invoice.lines.filter(matchesGroup);
        const mainChargeRows = relatedRows.filter((r) =>
          isChargeLineType(r.lineType),
        );

        // Main Amount
        const mainRow =
          relatedRows.find(
            (r) =>
              Number(r.discountAmount || 0) === 0 &&
              isChargeLineType(r.lineType),
          ) || line;

        const matchesTaxScope = (taxLine) =>
          Boolean(mainRow.studentId && taxLine.studentId) &&
          taxLine.studentId === mainRow.studentId &&
          taxLine.businessUnitId === mainRow.businessUnitId &&
          (taxLine.billingStart || taxLine.usageStart || "") ===
            (mainRow.billingStart || mainRow.usageStart || "") &&
          (taxLine.billingEnd || taxLine.usageEnd || "") ===
            (mainRow.billingEnd || mainRow.usageEnd || "");

        // Discount Row
        // const discountRows = relatedRows.filter(
        //   (r) => Number(r.discountAmount || 0) > 0,
        // );

        const discountRows = relatedRows.filter(
          (r) =>
            isLineType(r.lineType, LINE_TYPES.DISCOUNT) &&
            Math.abs(Number(r.discountAmount ?? r.finalAmount ?? 0)) > 0 &&
            normalizeLineType(
              r.applicationScope ??
                r.application_scope ??
                r.discountMetadata?.application_scope,
            ) !== "PER_STUDENT_BU" &&
            r.displayOnChargeRow !== false,
        );
        // ======================================
        // TAXES
        // ======================================

        const rowTaxes = {};
        const chargeTypeId = mainRow.chargeTypeId;
        const matchingTaxLines = allTaxLines.filter(matchesTaxScope);
        for (const taxName of taxColumns) {
          const taxTotalMinor = matchingTaxLines
            .filter((taxLine) => taxLine.chargeType === taxName)
            .flatMap((taxLine) => {
              const taxLineIndex = taxLineIndexes.get(taxLine);
              return (
                Array.isArray(taxLine.taxAllocations)
                  ? taxLine.taxAllocations
                  : []
              ).flatMap((allocation, allocationIndex) => {
                if (allocation.charge_type_id !== chargeTypeId) return [];
                matchedAllocationRefs.add(`${taxLineIndex}:${allocationIndex}`);
                return [toMinorUnits(allocation.tax_amount)];
              });
            })
            .reduce((sum, amount) => sum + amount, 0);
          rowTaxes[taxName] = fromMinorUnits(taxTotalMinor);
        }

        // ======================================
        // VALUES
        // ======================================

        const originalAmount = fromMinorUnits(
          mainChargeRows.reduce(
            (sum, row) => sum + toMinorUnits(row.originalAmount),
            0,
          ),
        );

        // const discountAmount = discountRows.reduce(
        //   (total, row) => total + Number(row.discountAmount || 0),
        //   0,
        // );
        const discountAmount = discountRows.reduce(
          (total, row) =>
            total +
            Math.abs(Number(row.discountAmount ?? row.finalAmount ?? 0)),
          0,
        );

        const discountPercent = [
          ...new Set(
            discountRows
              .map((row) => Number(row.discountPercent || 0))
              .filter((percent) => percent > 0),
          ),
        ]
          .map((percent) => `${percent}%`)
          .join(" + ");

        const totalTaxForRow = Object.values(rowTaxes).reduce(
          (a, b) => a + b,
          0,
        );

        const amountExcludingTaxMinor = mainChargeRows.reduce(
          (sum, row) => sum + toMinorUnits(row.finalAmount ?? row.amount ?? 0),
          0,
        );
        const finalTotal = fromMinorUnits(
          amountExcludingTaxMinor + toMinorUnits(totalTaxForRow),
        );
        totalAmountExcludingTaxMinor += amountExcludingTaxMinor;

        // CHARGE.finalAmount is already net of persisted discount lines. Do not
        // deduct the separately displayed discounts from it a second time.

        // const finalTotal =
        //   Number(mainRow.finalAmount ?? mainRow.amount ?? 0) + totalTaxForRow;

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
          currencySymbol: mainRow.currencySymbol || invoice.currencySymbol,
        });
      }

      const unmatchedAllocations = allTaxLines.flatMap(
        (taxLine, taxLineIndex) => {
          const allocations = Array.isArray(taxLine.taxAllocations)
            ? taxLine.taxAllocations
            : [];
          if (!allocations.length) {
            console.warn(
              "TAX line has no allocation metadata; row tax is omitted while authoritative invoice summary is retained",
              {
                invoiceNumber: invoice.invoiceNumber,
                studentId: taxLine.studentId,
                businessUnitId: taxLine.businessUnitId,
                taxType: taxLine.chargeType,
                finalAmount: taxLine.finalAmount,
              },
            );
          }
          const allocatedTotalMinor = allocations.reduce(
            (sum, allocation) => sum + toMinorUnits(allocation.tax_amount),
            0,
          );
          if (
            allocations.length &&
            allocatedTotalMinor !== toMinorUnits(taxLine.finalAmount)
          ) {
            console.warn(
              "TAX allocation total does not reconcile with persisted TAX amount",
              {
                invoiceNumber: invoice.invoiceNumber,
                taxType: taxLine.chargeType,
                allocatedAmount: fromMinorUnits(allocatedTotalMinor),
                persistedTaxAmount: fromMinorUnits(
                  toMinorUnits(taxLine.finalAmount),
                ),
              },
            );
          }
          return allocations.flatMap((allocation, allocationIndex) =>
            matchedAllocationRefs.has(`${taxLineIndex}:${allocationIndex}`)
              ? []
              : [{ taxLine, allocation }],
          );
        },
      );
      if (unmatchedAllocations.length > 0) {
        console.warn(
          "Invoice contains TAX allocations that could not be matched to a charge group",
          {
            invoiceNumber: invoice.invoiceNumber,
            unmatchedAllocations: unmatchedAllocations.map(
              ({ taxLine, allocation }) => ({
                studentId: taxLine.studentId,
                businessUnitId: taxLine.businessUnitId,
                taxType: taxLine.chargeType,
                chargeTypeId: allocation.charge_type_id,
                chargeKey: allocation.charge_key,
                taxAmount: allocation.tax_amount,
                billingStart: taxLine.billingStart || taxLine.usageStart,
                billingEnd: taxLine.billingEnd || taxLine.usageEnd,
              }),
            ),
          },
        );
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

        fontManager: font,
      });

      y += 28;

      const continueTable = () => {
        y = nextPage();
        const newCols = drawResponsiveTableHeader(doc, {
          y,
          columns: tableColumns,
          startX: 40,
          endX: pageWidth - 40,
          firstColumnPercent: 0.3,
          fontManager: font,
        });
        cols.splice(0, cols.length, ...newCols);
        y += 28;
      };

      for (const child of Object.keys(grouped)) {
        if (y + 38 > contentBottom) continueTable();
        //doc.font("Helvetica-Bold")
        font.use("bold");
        doc.fontSize(10).text(child, 40, y);

        y += 18;

        for (const row of grouped[child]) {
          if (y + 20 > contentBottom) continueTable();
          //drawTableRow(y, row, cols, hasDiscount, taxColumns);
          const values = [];

          values.push(row.chargeName);

          values.push(formatMoney(row.chargeAmount, row.currencySymbol));

          if (hasDiscount) {
            values.push(row.discountPercent || "-");

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
            fontManager: font,
          });

          y += 20;
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

      const totalsTableWidth = 390;

      const totalsStartX = pageWidth - 40 - totalsTableWidth;

      // Financial summary: PER_CHARGE discounts are already reflected in
      // CHARGE.finalAmount; PER_STUDENT_BU discounts are separate deductions.
      const invoiceLines = invoice.lines || [];
      const discountLines = invoiceLines.filter((line) =>
        isLineType(line.lineType, LINE_TYPES.DISCOUNT),
      );
      const discountScope = (line) =>
        normalizeLineType(
          line.applicationScope ??
            line.application_scope ??
            line.discountMetadata?.application_scope,
        );
      const perChargeDiscountLines = discountLines.filter(
        (line) => discountScope(line) === "PER_CHARGE",
      );
      const perStudentBuDiscountLines = discountLines.filter(
        (line) => discountScope(line) === "PER_STUDENT_BU",
      );
      const sumDiscountMinor = (rows) =>
        rows.reduce(
          (sum, line) =>
            sum +
            Math.abs(
              toMinorUnits(
                line.finalAmount ?? line.amount ?? line.discountAmount,
              ),
            ),
          0,
        );
      const perChargeDiscountMinor = sumDiscountMinor(perChargeDiscountLines);
      const buDiscountMinor = sumDiscountMinor(perStudentBuDiscountLines);
      const netChargeMinor = totalAmountExcludingTaxMinor;
      const grossChargeMinor = netChargeMinor + perChargeDiscountMinor;
      const taxMinor = invoiceTaxTotalMinor;
      const calculatedTotalMinor = netChargeMinor - buDiscountMinor + taxMinor;
      const persistedTotalMinor = toMinorUnits(invoice.totalAmount);
      if (calculatedTotalMinor !== persistedTotalMinor) {
        console.warn("Invoice PDF reconciliation mismatch", {
          invoiceNumber: invoice.invoiceNumber,
          calculated: fromMinorUnits(calculatedTotalMinor),
          persisted: fromMinorUnits(persistedTotalMinor),
          perChargeDiscount: fromMinorUnits(perChargeDiscountMinor),
          buDiscount: fromMinorUnits(buDiscountMinor),
        });
      }

      const money = (minor) =>
        formatMoney(fromMinorUnits(minor), invoice.currencySymbol);

      const getBuName = (line) => {
        if (line.businessUnitName) return line.businessUnitName;

        const matchingCharge = invoiceLines.find(
          (charge) =>
            isChargeLineType(charge.lineType) &&
            charge.businessUnitId === line.businessUnitId &&
            charge.studentId === line.studentId &&
            charge.businessUnitName,
        );

        return matchingCharge?.businessUnitName || "Business Unit";
      };

      const buDiscountGroups = new Map();

      for (const line of perStudentBuDiscountLines) {
        const name = getBuName(line);
        const key = `${line.studentId || ""}:${line.businessUnitId || name}`;
        const current = buDiscountGroups.get(key);

        if (current) {
          current.amountMinor += Math.abs(
            toMinorUnits(
              line.finalAmount ?? line.amount ?? line.discountAmount,
            ),
          );
        } else {
          buDiscountGroups.set(key, {
            name,
            amountMinor: Math.abs(
              toMinorUnits(
                line.finalAmount ?? line.amount ?? line.discountAmount,
              ),
            ),
          });
        }
      }

      const hasAnyDiscount = perChargeDiscountMinor > 0 || buDiscountMinor > 0;

      const summaryRows = [];

      if (hasAnyDiscount) {
        summaryRows.push({
          label: "BU Subtotal :",
          value: money(grossChargeMinor),
        });

        if (perChargeDiscountMinor > 0) {
          summaryRows.push({
            label: "Total Charge Discount :",
            value: money(-perChargeDiscountMinor),
          });
        }

        for (const group of buDiscountGroups.values()) {
          summaryRows.push({
            label: `${group.name} Discount :`,
            value: money(-group.amountMinor),
          });
        }

        summaryRows.push(
          {
            label: "Total Discounts :",
            value: money(-(perChargeDiscountMinor + buDiscountMinor)),
          },
          {
            label: "Balance After Discounts :",
            value: money(netChargeMinor - buDiscountMinor),
          },
        );
      }

      if (taxMinor !== 0) {
        summaryRows.push({
          label: "Taxes :",
          value: money(taxMinor),
        });
      }

      summaryRows.push(
        {
          label: "Total Due :",
          value: money(persistedTotalMinor),
        },
        {
          label: "Paid Amount :",
          value: formatMoney(invoice.paidAmount, invoice.currencySymbol),
        },
        {
          label: "Net Due :",
          value: formatMoney(invoice.balanceAmount, invoice.currencySymbol),
        },
      );

      if (summaryRows.length) {
        let summaryIndex = 0;
        while (summaryIndex < summaryRows.length) {
          if (y + 18 > contentBottom) y = nextPage();
          const rowsThatFit = Math.max(1, Math.floor((contentBottom - y) / 18));
          const pageRows = summaryRows.slice(
            summaryIndex,
            summaryIndex + rowsThatFit,
          );
          y = drawKeyValueRows(doc, {
            startX: totalsStartX,
            startY: y,
            labelWidth: totalsTableWidth - 100,
            valueWidth: 100,
            rowHeight: 18,
            labelAlign: "right",
            valueAlign: "right",
            drawTopBorder: true,
            drawRowBorders: true,
            borderColor: "#999",
            rows: pageRows,
            fontManager: font,
          });
          summaryIndex += pageRows.length;
        }
      } else {
        y = ensureSpace(y, summaryRows.length * 18);
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
          rows: summaryRows,
          fontManager: font,
        });
      }

      // =====================================
      // PAYMENT SECTION
      // =====================================

      y += 30;

      const bank = companyBankDetails || {};
      const bankRowCount = [
        bank.name,
        bank.accountNumber,
        bank.accountNumber2,
        bank.branchName,
      ].filter((value) => value || value === 0).length;
      const separatorGap = 8;
      y = ensureSpace(y, separatorGap + 45 + bankRowCount * 16);

      const payX = 40;
      const payText = `Pay ${formatMoney(
        invoice.balanceAmount,
        invoice.currencySymbol,
      )}`;
      font.use("bold");
      doc.fontSize(12).fillColor("#000");
      const separatorWidth = doc.widthOfString(payText) + 150;
      doc
        .save()
        .lineWidth(0.75)
        .strokeColor("#999")
        .dash(4, { space: 3 })
        .moveTo(payX, y)
        .lineTo(payX + separatorWidth, y)
        .stroke()
        .undash()
        .restore();
      y += separatorGap;
      doc.text(payText, payX, y);

      y += 20;

      //doc
      //.font("Helvetica")
      font.use("regular");
      doc.fontSize(10).fillColor("#000").text("via bank transfer", 40, y);

      y += 25;

      // =====================================
      // COMPANY BANK DETAILS
      // =====================================

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
        fontManager: font,
      });

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
  generateInvoicePdf,
};
