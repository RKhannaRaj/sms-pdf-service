const assert = require("node:assert/strict");
const { test } = require("node:test");
const { Writable } = require("node:stream");
const { finished } = require("node:stream/promises");
const PDFDocument = require("pdfkit");
const { PdfFontManager } = require("../lib/pdf/font-manager");
const { measureBillTo, drawBillTo } = require("../helpers/invoice-bill-to");
const { generateInvoicePdf } = require("../helpers/invoice-template");

const longAddress = "123 Long Residential Road, Example District, Example Town, Example County";
const baseInvoice = {
  invoiceNumber: "INV-TEST",
  invoiceDate: "24 Sep 2026",
  dueDate: "01 Oct 2026",
  payerName: "Example Payer",
  payerAddress1: "10 Example Road",
  payerContactNos: "+44 1234 567890",
  totalAmount: 100,
  paidAmount: 0,
  balanceAmount: 100,
  lines: [{ studentName: "Student", chargeType: "Tuition", originalAmount: 100, finalAmount: 100 }],
};

function renderBill(invoice, startY = 189) {
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  doc.resume();
  const font = new PdfFontManager(doc);
  const calls = [];
  const originalText = doc.text;
  let page = 1;
  doc.on("pageAdded", () => page++);
  doc.text = function (text, x, y, options) {
    const height = this.heightOfString(text, options);
    const entry = { text, x, y, height, page, width: options.width, size: this._fontSize };
    calls.push(entry);
    const result = originalText.call(this, text, x, y, options);
    assert.equal(page, entry.page, "Bill To must not trigger unmanaged PDFKit page breaks");
    assert.ok(Math.abs(this.y - y - height) < 0.001, "measurement must match rendering");
    return result;
  };
  const layout = measureBillTo(doc, font, invoice);
  const bottom = doc.page.height - 100;
  const endY = drawBillTo(doc, font, layout, {
    y: startY, bottom, pageTop: 60, nextPage: () => { doc.addPage(); return 60; },
  });
  doc.end();
  for (const call of calls) {
    assert.ok(call.y + call.height <= bottom + 0.001, "text must clear footer");
    assert.equal(call.x, 350);
    assert.ok(Math.abs(call.width - 205.28) < 0.001);
  }
  const fields = calls.filter((call) => call.text !== "Bill To:");
  for (let index = 1; index < fields.length; index++) {
    const before = fields[index - 1];
    const after = fields[index];
    if (before.page === after.page) {
      assert.ok(after.y >= before.y + before.height + 3 - 0.001, "fields need a 3pt gap");
    }
  }
  return { calls, fields, endY, page };
}

for (const [name, extra] of [
  ["one-line fields", {}],
  ["wrapped address", { payerAddress1: longAddress }],
  ["two consecutive wrapped addresses", { payerAddress1: longAddress, payerAddress2: longAddress }],
  ["three address lines", { payerAddress1: longAddress, payerAddress2: longAddress, payerAddress3: longAddress }],
  ["blank optional addresses", { payerAddress1: "", payerAddress2: null, payerAddress3: "   " }],
  ["long postcode and country", { payerAddress3: "Postal District 12345-6789 " + "Long Country Name ".repeat(6) }],
  ["long contact number", { payerContactNos: "+44 1234 567890 / ".repeat(8) }],
]) {
  test(name, () => {
    const invoice = { ...baseInvoice, ...extra };
    const { fields } = renderBill(invoice);
    const expected = [invoice.payerName, invoice.payerAddress1, invoice.payerAddress2,
      invoice.payerAddress3, invoice.payerContactNos].filter((value) => value != null && String(value).trim());
    assert.deepEqual(fields.map((field) => field.text), expected);
  });
}

test("Bill To near the page bottom moves before rendering", () => {
  const { calls, page } = renderBill(baseInvoice, 725);
  assert.equal(page, 2);
  assert.ok(calls.every((call) => call.page === 2));
  assert.equal(calls[0].y, 60);
});

test("a field longer than a page continues without losing text", () => {
  const invoice = { payerAddress1: longAddress.repeat(90), payerContactNos: "CONTACT-END" };
  const { fields, page } = renderBill(invoice);
  assert.ok(page > 2);
  assert.equal(fields.map((field) => field.text).join(""), invoice.payerAddress1 + invoice.payerContactNos);
});

test("an unbroken multi-page contact number continues without truncation", () => {
  const contact = "1234567890".repeat(300);
  const { fields, page } = renderBill({ payerContactNos: contact });
  assert.ok(page > 2);
  assert.equal(fields.map((field) => field.text).join(""), contact);
});

async function renderInvoice(invoice, invoiceCount = 1) {
  const lines = [];
  const images = [];
  const pages = new Set();
  const originalImage = PDFDocument.prototype.image;
  const originalLine = PDFDocument.prototype._line;
  const originalLineWidth = PDFDocument.prototype.lineWidth;
  const originalMoveTo = PDFDocument.prototype.moveTo;
  const originalStroke = PDFDocument.prototype.stroke;
  const strokes = new WeakMap();
  PDFDocument.prototype.image = function (source, x, y, options) {
    images.push({ source, x, y, options, page: this.page });
    return originalImage.call(this, source, x, y, options);
  };
  PDFDocument.prototype.lineWidth = function (width) {
    strokes.set(this, { ...strokes.get(this), width });
    return originalLineWidth.call(this, width);
  };
  PDFDocument.prototype.moveTo = function (x, y) {
    strokes.set(this, { ...strokes.get(this), y });
    return originalMoveTo.call(this, x, y);
  };
  PDFDocument.prototype.stroke = function (...args) {
    const state = strokes.get(this);
    if (state?.y === this.page.height - 65) {
      assert.equal(state.width, 1, "footer must not inherit the thick header stroke");
    }
    return originalStroke.apply(this, args);
  };
  PDFDocument.prototype._line = function (text, options, wrapper) {
    pages.add(this.page);
    lines.push({ text, x: this.x, y: this.y, height: this.currentLineHeight(true), page: this.page });
    return originalLine.call(this, text, options, wrapper);
  };
  const chunks = [];
  const res = new Writable({ write(chunk, encoding, callback) { chunks.push(chunk); callback(); } });
  res.setHeader = () => {};
  res.status = () => res;
  res.json = (error) => { throw new Error(JSON.stringify(error)); };
  try {
    await generateInvoicePdf({ body: {
      invoices: Array.isArray(invoice) ? invoice : Array.from({ length: invoiceCount }, () => invoice),
      companyDetails: { name: "Example Company", addressLine1: "Company Road" },
      companyBankDetails: { name: "Example Bank", accountNumber: "12345", accountNumber2: "67890", branchName: "Example Branch" },
    } }, res);
    await finished(res);
  } finally {
    PDFDocument.prototype._line = originalLine;
    PDFDocument.prototype.lineWidth = originalLineWidth;
    PDFDocument.prototype.moveTo = originalMoveTo;
    PDFDocument.prototype.stroke = originalStroke;
    PDFDocument.prototype.image = originalImage;
  }
  assert.ok(Buffer.concat(chunks).subarray(0, 5).equals(Buffer.from("%PDF-")));
  const bodyLines = lines.filter((line) => !line.text.startsWith("Printed on:") && !line.text.startsWith("This is a system-generated"));
  for (const line of bodyLines) {
    assert.ok(line.y + line.height <= line.page.height - 100 + 0.001,
      `footer collision: ${line.text} at ${line.y}`);
  }
  for (const page of pages) {
    assert.equal(lines.filter((line) => line.page === page && line.text.startsWith("Printed on:")).length, 1,
      "every page must have exactly one footer");
  }
  return { lines, pages, images };
}

function assertHeaders(result, invoicesByPage) {
  const pages = Array.from(result.pages);
  assert.equal(pages.length, invoicesByPage.length);
  for (const [index, page] of pages.entries()) {
    const invoice = invoicesByPage[index];
    const pageLines = result.lines.filter((line) => line.page === page);
    const expectedHeader = [
      ["Invoice", 40, 40],
      ["Invoice No", 40, 85], [invoice.invoiceNumber, 130, 85],
      ["Date of Issue", 40, 103], [invoice.invoiceDate, 130, 103],
      ["Due Date", 40, 121], [invoice.dueDate, 130, 121],
    ];
    if (["CANCELLED", "Cancelled"].includes(invoice.status)) {
      expectedHeader.push(["Invoice Status: Cancelled", page.width - 220, 125]);
    }
    const headerLines = pageLines.filter((line) => line.y < 189);
    assert.deepEqual(headerLines.map(({ text, x, y }) => [text, x, y]), expectedHeader,
      "each page must repeat only its current invoice's identity at the original positions");
    assert.equal(pageLines.filter((line) => line.text === "Invoice").length, 1);
    const logos = result.images.filter((image) => image.page === page);
    assert.equal(logos.length, 1, "each page must have one logo");
    assert.equal(logos[0].source, result.images[0].source);
    assert.equal(logos[0].x, page.width - 40 - 150);
    assert.equal(logos[0].y, 23);
    assert.deepEqual(logos[0].options, { width: 150 });
    const headerBottom = Math.max(...headerLines.map((line) => line.y + line.height));
    for (const line of pageLines.filter((line) => !headerLines.includes(line))) {
      assert.ok(line.y >= headerBottom + 45, "body must start below the repeated header");
    }
  }
}

function tableInvoice(count, extra = {}) {
  return {
    ...baseInvoice,
    lines: Array.from({ length: count }, (_, index) => ({
      studentName: "Student", chargeType: `Charge ${index}`, originalAmount: 10, finalAmount: 10,
    })),
    ...extra,
  };
}

test("one-page invoice renders its identity and logo exactly once", async () => {
  const result = await renderInvoice(baseInvoice);
  assertHeaders(result, [baseInvoice]);
});

test("two-page table repeats invoice identity, logo and table columns", async () => {
  const invoice = tableInvoice(20);
  const result = await renderInvoice(invoice);
  assertHeaders(result, [invoice, invoice]);
  for (const page of result.pages) {
    assert.equal(result.lines.filter((line) => line.page === page && line.text === "Charge Name").length, 1);
  }
  for (let index = 0; index < 20; index++) {
    assert.equal(result.lines.filter((line) => line.text === `Charge ${index}`).length, 1,
      "rendered table rows must not repeat");
  }
  for (const text of ["Example Company", "Company Road", "Bill To:", "Student", "Total Amount :", "Example Bank"]) {
    assert.equal(result.lines.filter((line) => line.text === text).length, 1, `${text} must not repeat with the header`);
  }
  assert.equal(result.lines.filter((line) => line.text.includes("due by")).length, 1);
});

test("three-or-more-page table repeats the same invoice on every page", async () => {
  const invoice = tableInvoice(65);
  const result = await renderInvoice(invoice);
  assert.ok(result.pages.size >= 3);
  assertHeaders(result, Array(result.pages.size).fill(invoice));
});

test("Bill To continuation starts beneath repeated invoice identity", async () => {
  const invoice = { ...baseInvoice, payerAddress1: longAddress.repeat(65) };
  const result = await renderInvoice(invoice);
  assertHeaders(result, Array(result.pages.size).fill(invoice));
  const billHeadings = result.lines.filter((line) => line.text === "Bill To:");
  assert.ok(billHeadings.length > 1);
  for (const line of billHeadings) assert.equal(line.y, 189);
  assert.equal(result.lines.filter((line) => line.text === "Example Company").length, 1);
});

test("totals and bank page breaks start beneath repeated identity", async () => {
  for (const [count, firstBodyText] of [[15, "Total Amount :"], [11, "Pay ₹ 100.00"]]) {
    const invoice = tableInvoice(count);
    const result = await renderInvoice(invoice);
    assertHeaders(result, [invoice, invoice]);
    const lastPage = Array.from(result.pages).at(-1);
    const firstBody = result.lines.find((line) => line.page === lastPage && line.y >= 189);
    assert.equal(firstBody.text, firstBodyText);
    assert.equal(firstBody.y, 189);
  }
});

test("multiple invoices retain their own identity, dates and cancellation status", async () => {
  const first = tableInvoice(20, { invoiceNumber: "INV-A", status: "CANCELLED" });
  const second = tableInvoice(20, {
    invoiceNumber: "INV-B", invoiceDate: "25 Sep 2026", dueDate: "02 Oct 2026",
  });
  const result = await renderInvoice([first, second]);
  assertHeaders(result, [first, first, second, second]);
});

test("both supported Cancelled spellings repeat consistently", async () => {
  for (const status of ["CANCELLED", "Cancelled"]) {
    const invoice = tableInvoice(20, { status });
    const result = await renderInvoice(invoice);
    assertHeaders(result, [invoice, invoice]);
  }
});

test("following invoice content clears a wrapped Bill To block", async () => {
  const { lines } = await renderInvoice({ ...baseInvoice, payerAddress1: longAddress, payerAddress2: longAddress });
  const contact = lines.find((line) => line.text === baseInvoice.payerContactNos);
  const due = lines.find((line) => line.text.includes("due by"));
  assert.equal(contact.page, due.page);
  assert.ok(due.y >= contact.y + contact.height + 65);
});

test("tall Bill To, table, totals and bank details retain footer clearance", async () => {
  for (const repeats of [8, 14, 22, 35, 65]) {
    const invoice = { ...baseInvoice, payerAddress1: longAddress.repeat(repeats) };
    const { lines } = await renderInvoice(invoice);
    const contact = lines.find((line) => line.text === invoice.payerContactNos);
    const due = lines.find((line) => line.text.includes("due by"));
    if (contact.page === due.page) assert.ok(due.y >= contact.y + contact.height + 65);
    assert.ok(lines.some((line) => line.text === "Total Amount :"));
    assert.ok(lines.some((line) => line.text === "Example Branch"));
  }
});

test("multi-page tables and multiple invoices retain page decorations", async () => {
  await renderInvoice({
    ...baseInvoice,
    payerAddress1: longAddress.repeat(16),
    lines: Array.from({ length: 40 }, (_, index) => ({
      studentName: "Student", chargeType: `Charge ${index}`, originalAmount: 10, finalAmount: 10,
    })),
  }, 2);
});
