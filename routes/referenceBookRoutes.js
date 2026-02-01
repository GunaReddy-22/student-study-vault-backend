const express = require("express");
const ReferenceBook = require("../models/ReferenceBook");
const User = require("../models/User");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

/* =========================
   🔐 DEV-ONLY MIDDLEWARE
========================= */
const isDeveloper = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || !user.isDeveloper) {
      return res.status(403).json({ message: "Developer access only" });
    }
    next();
  } catch {
    res.status(500).json({ message: "Auth check failed" });
  }
};

/* =========================
   📚 CREATE REFERENCE BOOK (DEV)
========================= */
router.post("/", auth, isDeveloper, async (req, res) => {
  try {
    const {
      title,
      author,
      subject,
      description,
      pdfUrl,
      coverImage,
      price,
    } = req.body;

    if (!title || !author || !subject || !description || !pdfUrl) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const book = await ReferenceBook.create({
      title,
      author,
      subject,
      description,
      pdfUrl,
      coverImage,
      price,
    });

    res.status(201).json(book);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Book creation failed" });
  }
});

/* =========================
   📚 GET ALL BOOKS (PUBLIC)
========================= */
router.get("/", async (req, res) => {
  try {
    const books = await ReferenceBook.find({ isActive: true }).sort({
      createdAt: -1,
    });

    res.json(books);
  } catch {
    res.status(500).json({ message: "Failed to fetch books" });
  }
});

/* =========================
   📘 GET SINGLE BOOK
========================= */
router.get("/:id", async (req, res) => {
  try {
    const book = await ReferenceBook.findById(req.params.id);

    if (!book || !book.isActive) {
      return res.status(404).json({ message: "Book not found" });
    }

    res.json(book);
  } catch {
    res.status(500).json({ message: "Failed to fetch book" });
  }
});

/* =========================
   ❌ DISABLE BOOK (DEV)
========================= */
router.patch("/:id/disable", auth, isDeveloper, async (req, res) => {
  try {
    const book = await ReferenceBook.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }

    res.json({ message: "Book disabled" });
  } catch {
    res.status(500).json({ message: "Failed to disable book" });
  }
});

/* =========================
   🗑️ DELETE BOOK (DEV)
========================= */
router.delete("/:id", auth, isDeveloper, async (req, res) => {
  try {
    const book = await ReferenceBook.findByIdAndDelete(req.params.id);

    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }

    res.json({ message: "Book deleted permanently" });
  } catch {
    res.status(500).json({ message: "Delete failed" });
  }
});

/* =========================
   💳 BUY REFERENCE BOOK
========================= */
router.post("/:id/buy", auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const book = await ReferenceBook.findById(req.params.id);

    if (!user || !book || !book.isActive) {
      return res.status(404).json({ message: "Book not found" });
    }

    if (user.purchasedBooks.includes(book._id)) {
      return res.status(400).json({ message: "Book already purchased" });
    }

    if (user.walletBalance < book.price) {
      return res.status(400).json({ message: "Insufficient wallet balance" });
    }

    // 🔍 Developer
    const developer = await User.findOne({ isDeveloper: true });
    if (!developer) {
      return res.status(500).json({ message: "Developer account missing" });
    }

    // 💰 Transfer money
    user.walletBalance -= book.price;
    developer.walletBalance += book.price;

    user.purchasedBooks.push(book._id);
    book.purchaseCount += 1;

    await user.save();
    await developer.save();
    await book.save();

    // 🧾 Transaction logs
    await WalletTransaction.create([
      {
        user: user._id,
        type: "DEBIT",
        amount: book.price,
        reason: "Purchased reference book",
        relatedBook: book._id,
      },
      {
        user: developer._id,
        type: "CREDIT",
        amount: book.price,
        reason: "Reference book sale",
        relatedBook: book._id,
      },
    ]);

    res.json({
      message: "Book purchased successfully",
      balance: user.walletBalance,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Purchase failed" });
  }
});

/* =========================
   🔍 CHECK BOOK ACCESS
========================= */
router.get("/:id/access", auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const hasAccess = user?.purchasedBooks.includes(req.params.id);

    res.json({ hasAccess });
  } catch {
    res.status(500).json({ message: "Access check failed" });
  }
});

module.exports = router;