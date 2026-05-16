const express = require("express");

const { generateInvoicePdf } = require("./helpers/invoice-template");

const { generatePaymentReceiptPdf } = require("./helpers/receipt-template");

const app = express();

app.use(express.json({ limit: "10mb" }));

app.post("/generate-invoice-pdf", generateInvoicePdf);

app.post("/generate-receipt-pdf", generatePaymentReceiptPdf);

app.listen(3000, () => {
  console.log("PDF service running");
});
