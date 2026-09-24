const { LIGHT_GRAY } = require("./pdf-helpers");

const FIELD_GAP = 3;
const HEADING_HEIGHT = 18;

function measureBillTo(doc, font, invoice) {
  const options = { width: doc.page.width - doc.page.margins.right - 350 };
  font.use("regular");
  doc.fontSize(10);

  const fields = [
    invoice.payerName,
    invoice.payerAddress1,
    invoice.payerAddress2,
    invoice.payerAddress3,
    invoice.payerContactNos,
  ]
    .filter((value) => value != null && String(value).trim() !== "")
    .map((value) => {
      const text = String(value);
      return { text, height: doc.heightOfString(text, options) };
    });

  return {
    options,
    fields,
    height:
      HEADING_HEIGHT +
      fields.reduce((sum, field) => sum + field.height + FIELD_GAP, 0),
  };
}

// Split only fields that cannot fit on a fresh page. Prefer a word boundary,
// but allow long unbroken contact/address strings to continue without truncation.
function fittingPrefix(doc, text, options, availableHeight) {
  const characters = Array.from(text);
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const height = doc.heightOfString(
      characters.slice(0, middle).join(""),
      options,
    );
    if (height <= availableHeight) low = middle;
    else high = middle - 1;
  }
  if (low === 0) throw new Error("No room for a Bill To text line");
  if (low < characters.length) {
    for (let index = low - 1; index > 0; index--) {
      if (/\s/.test(characters[index])) {
        low = index + 1;
        break;
      }
    }
  }
  return [characters.slice(0, low).join(""), characters.slice(low).join("")];
}

function drawBillTo(doc, font, layout, { y, bottom, pageTop, nextPage }) {
  const bodyStyle = () => {
    font.use("regular");
    doc.fontSize(10).fillColor(LIGHT_GRAY);
  };
  const heading = () => {
    font.use("bold");
    doc.fontSize(12).fillColor("#000").text("Bill To:", 350, y, layout.options);
    y += HEADING_HEIGHT;
    bodyStyle();
  };
  const continuePage = () => {
    pageTop = nextPage();
    y = pageTop;
    heading();
  };

  if (y + layout.height > bottom && y > pageTop) continuePage();
  else heading();
  for (const field of layout.fields) {
    let remaining = field.text;
    let height = field.height;
    if (y + height > bottom && y > pageTop + HEADING_HEIGHT) continuePage();

    while (remaining) {
      let text = remaining;
      let rest = "";
      if (y + height > bottom) {
        [text, rest] = fittingPrefix(
          doc,
          remaining,
          layout.options,
          bottom - y,
        );
      }
      const renderedHeight = doc.heightOfString(text, layout.options);
      doc.text(text, 350, y, layout.options);
      y += renderedHeight;
      remaining = rest;
      if (remaining) {
        continuePage();
        height = doc.heightOfString(remaining, layout.options);
      }
    }
    y += FIELD_GAP;
  }
  return y;
}

module.exports = { measureBillTo, drawBillTo };
