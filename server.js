import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import crypto from 'crypto';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createRequire } from 'module';
import dotenv from 'dotenv';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb';
dotenv.config();

const require = createRequire(import.meta.url);
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');

// Initialize database
const adapter = new JSONFile('db.json');
const db = new Low(adapter);
await db.read();
db.data ||= { 
  transactions: [], 
  paymentLinks: [], 
  users: [], 
  settings: {},
  bankPages: [] 
};

const activeBankPages = new Set();
const app = express();

// Middlewares
app.use(cors({
  origin: ['https://www.khatapay.me', 'http://localhost:3000'],
  credentials: true
}));
app.use(bodyParser.json());
app.use(express.static('public'));

// Force HTTPS
app.use((req, res, next) => {
  const proto = req.headers['x-forwarded-proto'];
  if (proto === 'http') return res.redirect(301, `https://${req.headers.host}${req.url}`);
  next();
});

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: ['https://www.khatapay.me', 'http://localhost:3000'],
    methods: ['GET', 'POST']
  }
});

// Socket.io Logic
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('showBankPage', (invoiceId) => {
    activeBankPages.add(invoiceId);
    io.emit('showBankPage', { invoiceId });
  });

  socket.on('hideBankPage', (invoiceId) => {
    activeBankPages.delete(invoiceId);
    io.emit('hideBankPage', { invoiceId });
  });

  socket.on('checkBankPage', (invoiceId, callback) => {
    callback(activeBankPages.has(invoiceId));
  });
});

// Admin Authentication Middleware
const adminAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token !== process.env.ADMIN_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  next();
};

// Payment Link Generation
app.post('/api/generatePaymentLink', adminAuth, async (req, res) => {
  try {
    const { amount, description } = req.body;
    if (!amount || isNaN(amount)) throw new Error('Invalid amount');
    if (!description?.trim()) throw new Error('Description required');

    const invoiceId = crypto.randomBytes(16).toString('hex');
    const paymentLink = `https://${req.get('host')}/payment.html?pid=${invoiceId}&amount=${amount}&description=${encodeURIComponent(description)}`;

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

// Pages Handlers
app.get('/landing.html', (req, res) => {
  const pid = req.query.pid;
  const paymentLink = db.data.paymentLinks.find(link => link.invoiceId === pid);
  if (!paymentLink) return res.status(404).send('Invalid payment link');
  res.sendFile(process.cwd() + '/public/landing.html');
});

app.get('/payment.html', (req, res) => {
  const pid = req.query.pid;
  const paymentLink = db.data.paymentLinks.find(link => link.invoiceId === pid);
  if (!paymentLink) return res.redirect('/404.html');
  res.sendFile(process.cwd() + '/public/payment.html');
});

app.get('/bankpage.html', (req, res) => {
  const invoiceId = req.query.invoiceId;
  if (!invoiceId) return res.status(400).send('Invoice ID required');
  
  const transaction = db.data.transactions.find(tx => tx.id === invoiceId);
  if (!transaction) return res.status(404).send('Transaction not found');
  if (!activeBankPages.has(invoiceId)) return res.status(403).send('Bank page not active');

  res.sendFile(process.cwd() + '/public/bankpage.html');
});

// Bank Page Endpoints
app.post('/api/showBankPage', adminAuth, (req, res) => {
  const { invoiceId } = req.body;
  if (!invoiceId) return res.status(400).json({ error: 'Invoice ID required' });

  const transaction = db.data.transactions.find(tx => tx.id === invoiceId);
  if (!transaction) return res.status(404).json({ error: 'Transaction not found' });

  activeBankPages.add(invoiceId);
  transaction.bankPageActive = true;
  db.write();
  io.emit('showBankPage', { invoiceId });
  res.json({ status: 'success' });
});

app.post('/api/hideBankPage', adminAuth, (req, res) => {
  const { invoiceId } = req.body;
  if (!invoiceId) return res.status(400).json({ error: 'Invoice ID required' });

  const transaction = db.data.transactions.find(tx => tx.id === invoiceId);
  if (!transaction) return res.status(404).json({ error: 'Transaction not found' });

  activeBankPages.delete(invoiceId);
  transaction.bankPageActive = false;
  db.write();
  io.emit('hideBankPage', { invoiceId });
  res.json({ status: 'success' });
});

// Transaction Handling
app.post('/api/createTransaction', adminAuth, (req, res) => {
  const transaction = req.body;
  transaction.id = crypto.randomBytes(16).toString('hex');
  transaction.bankPageActive = false;
  transaction.createdAt = new Date().toISOString();
  db.data.transactions.push(transaction);
  db.write();
  res.json({ status: 'success', transaction });
});

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
