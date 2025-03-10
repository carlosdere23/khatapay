import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import crypto from 'crypto';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';

// Initialize database
const adapter = new JSONFile('db.json');
const db = new Low(adapter);
await db.read();
db.data ||= { 
  transactions: [], 
  paymentLinks: [],
  users: [], 
  settings: {} 
};

const app = express();
app.use(bodyParser.json());
app.use(cors());
app.use(express.static('public'));

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Security middleware for Admin Panel
app.use('/api/admin/*', (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_TOKEN}`) {
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

    const invoiceId = crypto.randomBytes(12).toString('hex');
    const paymentLink = `${req.protocol}://${req.get('host')}/payment.html?pid=${invoiceId}`;

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

// Admin Login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
    res.json({ 
      status: "success",
      token: process.env.ADMIN_TOKEN 
    });
  } else {
    res.status(401).json({ status: "error", message: "Invalid credentials" });
  }
});

// Get Transactions
app.get('/api/transactions', (req, res) => {
  res.json(db.data.transactions);
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ status: "error", message: "Internal server error" });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


