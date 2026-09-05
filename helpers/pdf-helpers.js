const fs = require("fs");
const path = require("path");

const GREEN = "#59c2a3";
const LIGHT_GRAY = "#666666";

const logoPath = path.join(__dirname, "..", "assets", "logo.png");

// function formatMoney(amount, currencySymbol = "") {
//   return `${currencySymbol}${Number(amount || 0).toFixed(2)}`;
// }

function formatMoney(amount, currencySymbol = "₹") {
  return `${currencySymbol} ${Number(amount || 0).toFixed(2)}`;
}

function drawTopLine(doc) {
  const pageWidth = doc.page.width;

  doc
    .moveTo(0, 0)
    .lineTo(pageWidth, 0)
    .lineWidth(12)
    .strokeColor(GREEN)
    .stroke();
}

function drawFooter(doc, pageNumber) {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;

  const footerY = pageHeight - 65;

  const printTimestamp = new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  // Print timestamp
  doc
    .fontSize(9)
    .fillColor("#666")
    .text(`Printed on: ${printTimestamp}`, pageWidth - 250, footerY - 18, {
      width: 210,
      align: "right",
    });

  // Footer separator line

  doc
    .moveTo(40, footerY)
    .lineTo(pageWidth - 40, footerY)
    .dash(2, { space: 2 })
    .strokeColor("#999")
    .stroke();

  doc.undash();

  doc
    .fontSize(9)
    .fillColor("#666")
    .text(
      `This is a system-generated document and does not require a signature.`,
      0,
      footerY + 10,
      {
        align: "center",
      },
    );

  // .text(`Page ${pageNumber}`, 0, footerY + 10, {
  //   align: "center",
  // });
}

function drawLogo(doc) {
  const pageWidth = doc.page.width;

  const logoWidth = 150;

  const logoStartX = pageWidth - 40 - logoWidth;

  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, logoStartX, 23, {
      width: logoWidth,
    });
  }
}

function drawKeyValueRows(doc, options) {
  const {
    fontManager,

    startX,
    startY,

    labelWidth = 120,
    valueWidth = 120,

    rowHeight = 18,

    rows = [],

    labelAlign = "left",
    valueAlign = "left",

    drawTopBorder = false,
    drawRowBorders = false,

    borderColor = "#999",

    labelFont = "Helvetica-Bold",
    valueFont = "Helvetica",

    labelColor = "#000",
    valueColor = "#000",

    fontSize = 10,
  } = options;

  let currentY = startY;

  const tableWidth = labelWidth + valueWidth;

  if (drawTopBorder) {
    doc
      .moveTo(startX, currentY - 4)
      .lineTo(startX + tableWidth, currentY - 4)
      .dash(2, { space: 2 })
      .strokeColor(borderColor)
      .stroke();

    doc.undash();
  }

  rows.forEach((row, index) => {
    if (!row.value && row.value !== 0) return;

    //    doc
    //    .font(labelFont)
    //if (fontManager) {
    //if (font) {
    fontManager?.use("bold");
    //}

    //    fontManager.use("bold");
    // } else {
    //   doc.font(labelFont);
    // }
    doc
      .fontSize(fontSize)
      .fillColor(labelColor)
      .text(row.label, startX, currentY, {
        width: labelWidth,
        align: labelAlign,
      });

    //if (fontManager) {
    // if (font) {
    //   font.use("regular");
    // }
    fontManager?.use("regular");
    // } else {
    //   doc.font(valueFont);
    // }
    doc
      .fontSize(fontSize)
      .fillColor(valueColor)
      .text(String(row.value), startX + labelWidth, currentY, {
        width: valueWidth,
        align: valueAlign,
      });

    if (drawRowBorders && index < rows.length - 1) {
      doc
        .moveTo(startX, currentY + rowHeight - 3)
        .lineTo(startX + tableWidth, currentY + rowHeight - 3)
        .dash(1, { space: 2 })
        .strokeColor(borderColor)
        .stroke();

      doc.undash();
    }

    currentY += rowHeight;
  });

  return currentY;
}

function buildResponsiveTableColumns(doc, options) {
  const {
    startX = 40,
    endX = doc.page.width - 40,

    columns = [],

    firstColumnPercent = 0.2,
  } = options;

  const tableWidth = endX - startX;

  const firstColWidth = tableWidth * firstColumnPercent;

  const remainingCols = columns.length - 1;

  const remainingWidth = tableWidth - firstColWidth;

  const otherColWidth =
    remainingCols > 0 ? remainingWidth / remainingCols : remainingWidth;

  let currentX = startX;

  return columns.map((col, index) => {
    const width = index === 0 ? firstColWidth : otherColWidth;

    const result = {
      ...col,
      x: currentX,
      width,
    };

    currentX += width;

    return result;
  });
}

function drawResponsiveTableHeader(doc, options) {
  const {
    fontManager,

    y,

    columns = [],

    startX = 40,
    endX = doc.page.width - 40,

    firstColumnPercent = 0.2,

    fontSize = 10,

    borderColor = "#000",
  } = options;

  const cols = buildResponsiveTableColumns(doc, {
    startX,
    endX,
    columns,
    firstColumnPercent,
  });

  //font?.use("bold");

  fontManager?.use("bold");

  doc.fontSize(fontSize).fillColor("#000");

  cols.forEach((col, index) => {
    doc.text(col.label, col.x, y, {
      width: col.width,
      align: index === 0 ? "left" : "right",
    });
  });

  doc
    .moveTo(startX, y + 18)
    .lineTo(endX, y + 18)
    .strokeColor(borderColor)
    .lineWidth(1)
    .stroke();

  return cols;
}

function drawResponsiveTableRow(doc, options) {
  const {
    fontManager,

    y,

    cols = [],

    values = [],

    fontSize = 10,
  } = options;

  fontManager?.use("regular");
  //font?.use("regular");

  doc.fontSize(fontSize).fillColor("#000");

  cols.forEach((col, index) => {
    doc.text(String(values[index] ?? ""), col.x, y, {
      width: col.width,
      align: index === 0 ? "left" : "right",
    });
  });
}

module.exports = {
  GREEN,
  LIGHT_GRAY,
  formatMoney,
  drawTopLine,
  drawFooter,
  drawLogo,
  drawKeyValueRows,

  buildResponsiveTableColumns,
  drawResponsiveTableHeader,
  drawResponsiveTableRow,
};
