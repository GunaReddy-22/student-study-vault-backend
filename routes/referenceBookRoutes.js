const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const ReferenceBook = require("../models/ReferenceBook");
const User = require("../models/User");
const WalletTransaction = require("../models/WalletTransaction");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

/* =========================
   📁 MULTER CONFIG
========================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "pdf") {
      cb(null, "uploads/pdfs");
    } else if (file.fieldname === "cover") {
      cb(null, "uploads/covers");
    }
  },
  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueName + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (
      file.fieldname === "pdf" &&
      file.mimetype !== "application/pdf"
    ) {
      return cb(new Error("Only PDF files allowed"));
    }
    cb(null, true);
  },
});

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
  } catch (err) {
    res.status(500).json({ message: "Auth check failed" });
  }
};

/* =========================
   📚 CREATE REFERENCE BOOK (DEV)
========================= */
router.post(
  "/",
  auth,
  isDeveloper,
  upload.fields([
    { name: "pdf", maxCount: 1 },
    { name: "cover", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { title, author, subject, description, price } = req.body;

      if (!title || !author || !subject || !description || !price) {
        return res.status(400).json({ message: "Missing fields" });
      }

      if (!req.files?.pdf) {
        return res.status(400).json({ message: "PDF file required" });
      }

      const pdfUrl = `/uploads/pdfs/${req.files.pdf[0].filename}`;
      const coverImage = req.files.cover
        ? `/uploads/covers/${req.files.cover[0].filename}`
        : null;

      const book = await ReferenceBook.create({
        title,
        author,
        subject,
        description,
        price,
        pdfUrl,
        coverImage,
      });

      res.status(201).json(book);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Book creation failed" });
    }
  }
);

/* =========================
   📚 GET ALL BOOKS (PUBLIC)
========================= */
router.get("/", async (req, res) => {
  try {
    const books = await ReferenceBook.find({ isActive: true }).sort({
      createdAt: -1,
    });
    res.json(books);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch books" });
  }
});

/* =========================
   📘 GET SINGLE BOOK (PUBLIC)
========================= */
router.get("/:id", async (req, res) => {
  try {
    const book = await ReferenceBook.findById(req.params.id);

    if (!book || !book.isActive) {
      return res.status(404).json({ message: "Book not found" });
    }

    res.json(book);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch book" });
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

    const developer = await User.findOne({ isDeveloper: true });
    if (!developer) {
      return res.status(500).json({ message: "Developer account missing" });
    }

    user.walletBalance -= book.price;
    developer.walletBalance += book.price;

    user.purchasedBooks.push(book._id);
    book.purchases += 1;

    await user.save();
    await developer.save();
    await book.save();

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
  } catch (err) {
    res.status(500).json({ message: "Access check failed" });
  }
});

/* =========================
   🔐 STREAM PDF (SECURE)
========================= */
router.get("/:id/pdf", auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const book = await ReferenceBook.findById(req.params.id);

    if (!user || !book || !book.isActive) {
      return res.status(404).json({ message: "Book not found" });
    }

    if (!user.purchasedBooks.includes(book._id)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const pdfPath = path.join(__dirname, "..", book.pdfUrl);

    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({ message: "PDF file missing" });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    fs.createReadStream(pdfPath).pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "PDF stream failed" });
  }
});

module.exports = router;