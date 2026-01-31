const express = require("express");
const User = require("../models/User");
const WalletTransaction = require("../models/WalletTransaction");
const auth = require("../middleware/authMiddleware");

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

module.exports = router;