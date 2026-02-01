const express = require("express");
const User = require("../models/User");
const WalletTransaction = require("../models/WalletTransaction");
const auth = require("../middleware/authMiddleware");
const razorpay = require("../src/config/razorpay");
const crypto = require("crypto");


const router = express.Router();

/* =========================
   GET WALLET BALANCE
   GET /api/wallet
========================= */
router.get("/", auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("walletBalance");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({ balance: user.walletBalance });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch wallet" });
  }
});

/* =========================
   GET WALLET TRANSACTIONS
   GET /api/wallet/transactions
========================= */
router.get("/transactions", auth, async (req, res) => {
  try {
    const transactions = await WalletTransaction.find({
      user: req.userId,
    })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(transactions);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch transactions" });
  }
});

/* =========================
   ADD DEMO MONEY (DEV ONLY)
   POST /api/wallet/add-demo
========================= */
router.post("/add-demo", auth, async (req, res) => {
  try {
    const { amount } = req.body;
    const demoAmount = Number(amount);

    if (!demoAmount || demoAmount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const user = await User.findById(req.userId);
    if (!user || !user.isDeveloper) {
      return res.status(403).json({ message: "Only developer can add demo money" });
    }

    user.walletBalance += demoAmount;
    await user.save();

    await WalletTransaction.create({
      user: user._id,
      type: "CREDIT",
      amount: demoAmount,
      reason: "Demo money added",
    });

    res.json({
      message: "Demo money added",
      balance: user.walletBalance,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to add demo money" });
  }
});

/* =========================
   USER WALLET TOP-UP (90/10 SPLIT)
   POST /api/wallet/topup
========================= */
router.post("/topup", auth, async (req, res) => {
  try {
    const { amount } = req.body;
    const totalAmount = Number(amount);

    if (!totalAmount || totalAmount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const developer = await User.findOne({ isDeveloper: true });
    if (!developer) {
      return res.status(500).json({ message: "Developer account missing" });
    }

    const userShare = Math.floor(totalAmount * 0.9);
    const developerShare = totalAmount - userShare;

    user.walletBalance += userShare;
    developer.walletBalance += developerShare;

    await user.save();
    await developer.save();

    await WalletTransaction.create([
      {
        user: user._id,
        type: "CREDIT",
        amount: userShare,
        reason: "Wallet top-up",
        relatedUser: developer._id,
      },
      {
        user: developer._id,
        type: "CREDIT",
        amount: developerShare,
        reason: "Platform commission",
        relatedUser: user._id,
      },
    ]);

    res.json({
      message: "Wallet topped up successfully",
      addedToWallet: userShare,
      commission: developerShare,
      balance: user.walletBalance,
    });
  } catch (err) {
    res.status(500).json({ message: "Wallet top-up failed" });
  }
});
/* =========================
   💳 CREATE RAZORPAY ORDER
   POST /api/wallet/create-order
========================= */
router.post("/create-order", auth, async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const order = await razorpay.orders.create({
      amount: amount * 100, // Razorpay uses paise
      currency: "INR",
      receipt: `wallet_${Date.now()}`,
    });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error("Order creation failed:", err);
    res.status(500).json({ message: "Order creation failed" });
  }
});

/* =========================
   ✅ VERIFY RAZORPAY PAYMENT
   POST /api/wallet/verify-payment
========================= */
router.post("/verify-payment", auth, async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      amount,
    } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ message: "Invalid payment signature" });
    }

    // 💰 Wallet credit (90/10 logic reused)
    const user = await User.findById(req.userId);
    const developer = await User.findOne({ isDeveloper: true });

    const userShare = Math.floor(amount * 0.9);
    const developerShare = amount - userShare;

    user.walletBalance += userShare;
    developer.walletBalance += developerShare;

    await user.save();
    await developer.save();

    await WalletTransaction.create([
      {
        user: user._id,
        type: "CREDIT",
        amount: userShare,
        reason: "Wallet top-up (Razorpay)",
      },
      {
        user: developer._id,
        type: "CREDIT",
        amount: developerShare,
        reason: "Platform commission",
      },
    ]);

    res.json({
      message: "Payment verified & wallet updated",
      balance: user.walletBalance,
    });
  } catch (err) {
    console.error("Payment verify failed:", err);
    res.status(500).json({ message: "Payment verification failed" });
  }
});

module.exports = router;