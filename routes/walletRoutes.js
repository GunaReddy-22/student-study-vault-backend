const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const User = require("../models/User");
const WalletTransaction = require("../models/WalletTransaction");
const auth = require("../middleware/authMiddleware");
const razorpay = require("../src/config/razorpay");

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
    const tx = await WalletTransaction.find({ user: req.userId })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(tx);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch transactions" });
  }
});

/* =========================
   CREATE RAZORPAY ORDER
   POST /api/wallet/create-order
========================= */
router.post("/create-order", auth, async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const order = await razorpay.orders.create({
      amount: amount * 100, // paise
      currency: "INR",
      receipt: `wallet_${Date.now()}`,
    });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID, // LIVE KEY
    });
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ message: "Order creation failed" });
  }
});

/* =========================
   VERIFY PAYMENT & CREDIT WALLET
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
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ message: "Invalid payment signature" });
    }

    const user = await User.findById(req.userId);
    const developer = await User.findOne({ isDeveloper: true });

    if (!user || !developer) {
      return res.status(500).json({ message: "Account error" });
    }

    // 💰 90 / 10 split
    const userShare = Math.floor(amount * 0.9);
    const devShare = amount - userShare;

    user.walletBalance += userShare;
    developer.walletBalance += devShare;

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
        amount: devShare,
        reason: "Platform commission",
        relatedUser: user._id,
      },
    ]);

    res.json({
      message: "Payment verified & wallet updated",
      balance: user.walletBalance,
    });
  } catch (err) {
    console.error("Verify payment error:", err);
    res.status(500).json({ message: "Payment verification failed" });
  }
});

/* =========================
   WITHDRAW WALLET (PASSWORD PROTECTED)
   POST /api/wallet/withdraw
========================= */
router.post("/withdraw", auth, async (req, res) => {
  try {
    const { amount, password, upiId } = req.body;
    const withdrawAmount = Number(amount);

    if (!password) {
      return res.status(400).json({ message: "Password is required" });
    }

    if (!withdrawAmount || withdrawAmount < 100) {
      return res
        .status(400)
        .json({ message: "Minimum withdrawal amount is ₹100" });
    }

    if (!upiId) {
      return res.status(400).json({ message: "UPI ID required" });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // 🔐 PASSWORD CHECK
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Incorrect password" });
    }

    if (user.walletBalance < withdrawAmount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    // 💸 Deduct wallet
    user.walletBalance -= withdrawAmount;
    await user.save();

    await WalletTransaction.create({
      user: user._id,
      type: "DEBIT",
      amount: withdrawAmount,
      reason: "Wallet withdrawal request",
    });

    // ⚠️ Real payout can be added later (Razorpay Payouts API)

    res.json({
      message: "Withdrawal request submitted",
      balance: user.walletBalance,
    });
  } catch (err) {
    console.error("Withdraw error:", err);
    res.status(500).json({ message: "Withdrawal failed" });
  }
});

module.exports = router;