// server.js
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import crypto from 'crypto';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';

const app = express();
app.use(bodyParser.json());
app.use(cors());

// Serve static files from the "public" folder
app.use(express.static('public'));

// Optionally, serve index.html when the root URL is requested:
app.get('/', (req, res) => {
  // Use path.resolve to form the absolute path to your index.html file
  res.sendFile(path.resolve('public/index.html'));
});

// --- (Place your existing API endpoints here) ---
// Example: Payment link generation
const paymentLinks = new Map();
app.post('/api/generatePaymentLink', (req, res) => {
  const { amount, description } = req.body;
  const invoiceId = crypto.randomBytes(4).toString('hex').toUpperCase();
  const paymentLink = `${req.protocol}://${req.get('host')}/landing.html?pid=${invoiceId}`;
  paymentLinks.set(invoiceId, { amount, description, paymentLink, createdAt: new Date().toISOString() });
  console.log("Payment link generated:", paymentLink);
  res.json({ status: "success", paymentLink });
});

// (Include your other endpoints from your original code here...)

// Create HTTP server and attach socket.io (if used)
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: '*' }
});

// Example socket.io connection handler
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);
  socket.on('join', (invoiceId) => {
    socket.join(invoiceId);
    console.log(`Socket ${socket.id} joined room ${invoiceId}`);
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
