const express = require("express");
const Note = require("../models/Note");
const User = require("../models/User");
const WalletTransaction = require("../models/WalletTransaction");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

/* =========================
   CREATE NOTE
========================= */
router.post("/", auth, async (req, res) => {
  try {
    const {
      subject,
      title,
      content,
      isPublic = false,
      isPremium = false,
      price = 0,
    } = req.body;

    if (!subject || !title || !content) {
      return res.status(400).json({ message: "Missing fields" });
    }

    if (isPremium && Number(price) <= 0) {
      return res
        .status(400)
        .json({ message: "Premium notes must have a valid price" });
    }

    const note = await Note.create({
      subject,
      title,
      content,
      isPublic,
      isPremium,
      price: isPremium ? Math.max(Number(price), 1) : 0,
      userId: req.userId,
    });

    res.status(201).json(note);
  } catch (err) {
    console.error("Create failed:", err);
    res.status(500).json({ message: "Create failed" });
  }
});

/* =========================
   🌍 PUBLIC NOTES
========================= */
router.get("/public", async (req, res) => {
  try {
    const notes = await Note.find({
      isPublic: true,
      isPremium: false,
    })
      .populate("userId", "username")
      .sort({ createdAt: -1 });

    res.json(notes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch public notes" });
  }
});

/* =========================
   💰 PREMIUM NOTES
========================= */
router.get("/premium", async (req, res) => {
  try {
    const notes = await Note.find({ isPremium: true })
      .populate("userId", "username")
      .sort({ createdAt: -1 });

    res.json(notes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch premium notes" });
  }
});

/* =========================
   GET USER NOTES
========================= */
router.get("/", auth, async (req, res) => {
  try {
    const notes = await Note.find({ userId: req.userId }).sort({
      createdAt: -1,
    });
    res.json(notes);
  } catch {
    res.status(500).json({ message: "Failed to fetch notes" });
  }
});

/* =========================
   GET SINGLE NOTE
========================= */
router.get("/:id", auth, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id)
      .populate("userId", "username");

    if (!note) return res.status(404).json({ message: "Note not found" });

    res.json(note);
  } catch {
    res.status(500).json({ message: "Fetch failed" });
  }
});

/* =========================
   UPDATE NOTE
========================= */
router.put("/:id", auth, async (req, res) => {
  try {
    const note = await Note.findOne({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!note) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const {
      subject,
      title,
      content,
      isPublic,
      isPremium,
      price,
    } = req.body;

    if (isPremium && Number(price) <= 0) {
      return res
        .status(400)
        .json({ message: "Premium notes must have a valid price" });
    }

    Object.assign(note, {
      subject,
      title,
      content,
      isPublic,
      isPremium,
      price: isPremium ? Math.max(Number(price), 1) : 0,
    });

    await note.save();
    res.json(note);
  } catch (err) {
    console.error("Update failed:", err);
    res.status(500).json({ message: "Update failed" });
  }
});

/* =========================
   DELETE NOTE
========================= */
router.delete("/:id", auth, async (req, res) => {
  try {
    const note = await Note.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!note) {
      return res.status(403).json({ message: "Not authorized" });
    }

    res.json({ message: "Note deleted" });
  } catch {
    res.status(500).json({ message: "Delete failed" });
  }
});

/* =========================
   🔓 UNLOCK PREMIUM NOTE (OLD FLOW – KEPT)
========================= */
router.post("/premium/:id/unlock", auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const note = await Note.findById(req.params.id);

    if (!user || !note || !note.isPremium) {
      return res.status(400).json({ message: "Invalid unlock request" });
    }

    if (!user.purchasedNotes.includes(note._id)) {
      user.purchasedNotes.push(note._id);
      await user.save();
    }

    res.json({ message: "Note unlocked" });
  } catch {
    res.status(500).json({ message: "Unlock failed" });
  }
});

/* =========================
   🔍 CHECK PREMIUM ACCESS
========================= */
router.get("/premium/:id/access", auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const hasAccess = user?.purchasedNotes.includes(req.params.id);
    res.json({ hasAccess });
  } catch {
    res.status(500).json({ message: "Access check failed" });
  }
});

/* =========================
   ❤️ LIKE / UNLIKE NOTE
========================= */
router.post("/:id/like", auth, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ message: "Note not found" });

    const userId = req.userId;
    const index = note.likes.findIndex(
      (id) => id.toString() === userId
    );

    if (index === -1) note.likes.push(userId);
    else note.likes.splice(index, 1);

    await note.save();

    res.json({
      likesCount: note.likes.length,
      likes: note.likes,
    });
  } catch {
    res.status(500).json({ message: "Like failed" });
  }
});

/* =========================
   💬 ADD COMMENT
========================= */
router.post("/:id/comment", auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: "Comment required" });

    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ message: "Note not found" });

    note.comments.push({ user: req.userId, text });
    await note.save();

    const populated = await Note.findById(note._id)
      .populate("comments.user", "username");

    res.json(populated.comments);
  } catch {
    res.status(500).json({ message: "Comment failed" });
  }
});

/* =========================
   📥 GET COMMENTS
========================= */
router.get("/:id/comments", auth, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id)
      .populate("comments.user", "username");

    if (!note) return res.status(404).json({ message: "Note not found" });

    res.json(note.comments);
  } catch {
    res.status(500).json({ message: "Failed to fetch comments" });
  }
});

/* =========================
   💳 BUY PREMIUM NOTE (WALLET FLOW)
========================= */
router.post("/:noteId/buy", auth, async (req, res) => {
  try {
    const buyerId = req.userId;
    const { noteId } = req.params;

    const note = await Note.findById(noteId);
    if (!note) {
      return res.status(404).json({ message: "Note not found" });
    }

    if (!note.isPremium) {
      return res.status(400).json({ message: "This note is not premium" });
    }

    if (note.userId.toString() === buyerId) {
      return res.status(400).json({ message: "You cannot buy your own note" });
    }

    const developer = await User.findOne({ isDeveloper: true });
if (!developer) {
  return res.status(500).json({ message: "Developer account missing" });
}

const sellerShare = Math.floor(note.price * 0.9);
const developerShare = note.price - sellerShare;

buyer.walletBalance -= note.price;
seller.walletBalance += sellerShare;
developer.walletBalance += developerShare;
    if (!buyer || !seller) {
      return res.status(404).json({ message: "User not found" });
    }

    if (buyer.purchasedNotes.includes(noteId)) {
      return res.status(400).json({ message: "Note already purchased" });
    }

    if (buyer.walletBalance < note.price) {
      return res.status(400).json({ message: "Insufficient wallet balance" });
    }

    buyer.walletBalance -= note.price;
    seller.walletBalance += note.price;
    buyer.purchasedNotes.push(noteId);

    await buyer.save();
    await seller.save();

    await WalletTransaction.create([
      {
        user: buyerId,
        type: "DEBIT",
        amount: note.price,
        reason: "Purchased premium note",
        relatedNote: noteId,
        relatedUser: seller._id,
      },
      {
        user: seller._id,
        type: "CREDIT",
        amount: note.price,
        reason: "Sold premium note",
        relatedNote: noteId,
        relatedUser: buyerId,
      },
    ]);

    res.json({
      message: "Note purchased successfully",
      balance: buyer.walletBalance,
    });
  } catch (err) {
    console.error("Purchase failed:", err);
    res.status(500).json({ message: "Purchase failed" });
  }
});

module.exports = router;