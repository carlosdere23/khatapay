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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
