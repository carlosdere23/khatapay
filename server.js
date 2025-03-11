// server.js
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import crypto from "crypto";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import dotenv from "dotenv";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";

dotenv.config();

// Initialize lowdb database
const adapter = new JSONFile("db.json");
const db = new Low(adapter);
await db.read();
db.data ||= {
  transactions: [],
  paymentLinks: [],
  users: [],
  settings: {}
};

const app = express();

// Allow CORS for your production and local domains
app.use(cors({
  origin: ["https://www.khatapay.me", "http://localhost:3000"],
  credentials: true
}));
app.use(bodyParser.json());
app.use(express.static("public"));

// Force HTTPS if behind a proxy (e.g. Caddy)
app.use((req, res, next) => {
  const proto = req.headers["x-forwarded-proto"];
  if (proto && proto === "http") {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: ["https://www.khatapay.me", "http://localhost:3000"],
    methods: ["GET", "POST"]
  }
});

// Simple Socket.io connection for future use (e.g. OTP notifications)
io.on("connection", (socket) => {
  console.log("New WebSocket connection:", socket.id);
  socket.on("send-otp", (data) => {
    console.log("OTP sent:", data);
    io.emit("receive-otp", data);
  });
});

// Admin authentication middleware for endpoints that require admin access.
// Expects the admin password to be passed in the Authorization header as:
//   Authorization: Bearer <ADMIN_PASSWORD>
const adminAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (token !== process.env.ADMIN_PASSWORD) {
    return res.status(403).json({ error: "Access denied. Invalid admin password." });
  }
  next();
};

// Generate Payment Link Endpoint – returns a link to landing.html
app.post("/api/generatePaymentLink", adminAuth, async (req, res) => {
  try {
    const { amount, description } = req.body;
    if (!amount || isNaN(amount)) throw new Error("Invalid amount");
    if (!description || !description.trim()) throw new Error("Description required");

    // Generate a unique invoice ID
    const invoiceId = crypto.randomBytes(16).toString("hex");
    // Build the payment link URL – note that we point to landing.html
    const paymentLink = `https://${req.get("host")}/landing.html?pid=${invoiceId}&amount=${amount}&description=${encodeURIComponent(description.trim())}`;

    // Store the payment link data in the database
    db.data.paymentLinks.push({
      invoiceId,
      amount: Number(amount),
      description: description.trim(),
      paymentLink,
      createdAt: new Date().toISOString(),
      active: true
    });
    await db.write();

    res.json({ status: "success", paymentLink });
  } catch (err) {
    console.error("Generate Link Error:", err);
    res.status(400).json({ status: "error", message: err.message });
  }
});

// Get Payment Details (used by landing.html)
app.get("/api/getPaymentDetails", (req, res) => {
  const pid = req.query.pid;
  const payment = db.data.paymentLinks.find(link => link.invoiceId === pid);
  if (!payment) {
    return res.status(404).json({ status: "error", message: "Payment details not found" });
  }
  res.json({ status: "success", payment });
});

// Landing page handler – serves landing.html
app.get("/landing.html", (req, res) => {
  const pid = req.query.pid;
  const payment = db.data.paymentLinks.find(link => link.invoiceId === pid);
  if (!payment) return res.status(404).send("Invalid payment link");
  res.sendFile(process.cwd() + "/public/landing.html");
});

// Payment page handler – serves payment.html
app.get("/payment.html", (req, res) => {
  const pid = req.query.pid;
  const payment = db.data.paymentLinks.find(link => link.invoiceId === pid);
  if (!payment) return res.redirect("/404.html");
  res.sendFile(process.cwd() + "/public/payment.html");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

