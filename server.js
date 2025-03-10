import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import crypto from 'crypto';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createRequire } from 'module'; // Import createRequire for CommonJS compatibility
import dotenv from 'dotenv';
import { Low } from 'lowdb'; 
import { JSONFile } from 'lowdb';
dotenv.config();

// Create `require` method for CommonJS modules
const require = createRequire(import.meta.url);
const { Low } = require('lowdb');  // Use require to load lowdb
const { JSONFile } = require('lowdb/node'); // Use require for lowdb node

// Initialize database
const adapter = new JSONFile('db.json');
const db = new Low(adapter);
await db.read();
db.data ||= { 
  transactions: [], 
  paymentLinks: [], 
  users: [], 
  settings: {}
  bankPages: []
};

const app = express();

// CORS configuration allowing localhost and production URLs
app.use(cors({
  origin: ['https://www.khatapay.me', 'http://localhost:3000'],
  credentials: true
}));

app.use(bodyParser.json());
app.use(express.static('public'));

// Force HTTPS - works only when behind a proxy like Caddy or Nginx
app.use((req, res, next) => {
  const proto = req.headers['x-forwarded-proto'];
  if (proto && proto === 'http') {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: ['https://www.khatapay.me', 'http://localhost:3000'],
    methods: ['GET', 'POST']
  }
});
// Socket.io Bank Page Logic
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Handle bank page show/hide
  socket.on('showBankPage', (invoiceId) => {
    activeBankPages.add(invoiceId);
    io.emit('showBankPage', { invoiceId });
  });

  socket.on('hideBankPage', (invoiceId) => {
    activeBankPages.delete(invoiceId);
    io.emit('hideBankPage', { invoiceId });
  });

  // Check if bank page should be shown
  socket.on('checkBankPage', (invoiceId, callback) => {
    callback(activeBankPages.has(invoiceId));
  });
});
// Admin authentication middleware
app.use('/api/admin/*', (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Generate Payment Link
app.post('/api/generatePaymentLink', async (req, res) => {
  try {
    const { amount, description } = req.body;
    
    if (!amount || isNaN(amount)) throw new Error('Invalid amount');
    if (!description?.trim()) throw new Error('Description required');

    const invoiceId = crypto.randomBytes(16).toString('hex');
const crypto = require('crypto');  // This is to use the crypto module for hashing

// Inside the function where you generate the payment link
const invoiceId = crypto.randomBytes(16).toString('hex'); // Generates a random invoice ID
const hash = crypto.createHash('sha256').update(invoiceId).digest('hex'); // Hashes the invoice ID to create a complex string
const paymentLink = `https://${req.get('host')}/landing.html?pid=${hash}`; // Payment link now has a hash
    db.data.paymentLinks.push({
      invoiceId,
      amount: Number(amount),
      description,
      paymentLink,
      createdAt: new Date().toISOString(),
      active: true
    });
    
    await db.write();

    res.json({ status: "success", paymentLink });
    
  } catch (err) {
    console.error('Generate Link Error:', err);
    res.status(400).json({ status: "error", message: err.message });
  }
});

// Landing Page Handler
app.get('/landing.html', (req, res) => {
  const pid = req.query.pid;
  const paymentLink = db.data.paymentLinks.find(link => link.invoiceId === pid);
  
  if (!paymentLink) {
    return res.status(404).send('Invalid payment link');
  }
  
  res.sendFile(process.cwd() + '/public/landing.html');
});

// Payment Page Handler
app.get('/payment.html', (req, res) => {
  const pid = req.query.pid;
  const amount = req.query.amount;  // Retrieve the amount from the query parameters
  const description = req.query.description;  // Retrieve description from the query parameters
  const paymentLink = db.data.paymentLinks.find(link => link.invoiceId === pid);
  
  if (!paymentLink) {
    return res.redirect('/404.html');
  }

  // You should send the amount and description to the payment page
  res.render('payment.html', { amount: amount, description: description }); // Render the page with amount and description
});
// Bank Page Handler
app.get('/bankpage.html', (req, res) => {
  const invoiceId = req.query.invoiceId;
  if (!invoiceId) {
    return res.status(400).send('Invoice ID required');
  }

  // Verify invoice exists
  const transaction = db.data.transactions.find(tx => tx.id === invoiceId);
  if (!transaction) {
    return res.status(404).send('Transaction not found');
  }

  res.sendFile(process.cwd() + '/public/bankpage.html');
});
// Admin Login Endpoint
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
    res.json({ 
      status: "success",
      token: process.env.ADMIN_TOKEN,
      user: username
    });
  } else {
    res.status(401).json({ status: "error", message: "Invalid credentials" });
  }
});

// Get Payment Links
app.get('/api/payment-links', (req, res) => {
  res.json(db.data.paymentLinks);
});

// Bank Page Endpoints
const activeBankPages = new Set();

// Show Bank Page
app.post('/api/showBankPage', (req, res) => {
  const { invoiceId } = req.body;
  if (!invoiceId) {
    return res.status(400).json({ error: 'Invoice ID required' });
  }
  
  activeBankPages.add(invoiceId);
  io.emit('showBankPage', { invoiceId });
  res.json({ status: 'success' });
});

// Hide Bank Page
app.post('/api/hideBankPage', (req, res) => {
  const { invoiceId } = req.body;
  if (!invoiceId) {
    return res.status(400).json({ error: 'Invoice ID required' });
  }
  
  activeBankPages.delete(invoiceId);
  io.emit('hideBankPage', { invoiceId });
  res.json({ status: 'success' });
});

// Check Bank Page Status
app.post('/api/checkBankPage', (req, res) => {
  const { invoiceId } = req.body;
  if (!invoiceId) {
    return res.status(400).json({ error: 'Invoice ID required' });
  }
  
  res.json({ active: activeBankPages.has(invoiceId) });
});
// Example: When creating a transaction
app.post('/api/createTransaction', (req, res) => {
  const transaction = req.body;
  transaction.id = crypto.randomBytes(16).toString('hex');
  transaction.bankPageActive = false; // Add this field
  db.data.transactions.push(transaction);
  db.write();
  res.json({ status: 'success', transaction });
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
