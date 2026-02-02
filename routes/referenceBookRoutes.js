const express = require("express");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const axios = require("axios"); // ✅ REQUIRED

const ReferenceBook = require("../models/ReferenceBook");
const User = require("../models/User");
const WalletTransaction = require("../models/WalletTransaction");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

/* =========================
   ☁️ CLOUDINARY CONFIG
========================= */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* =========================
   📁 MULTER + CLOUDINARY
========================= */
/* =========================
   📁 MULTER + CLOUDINARY
========================= */
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    if (file.fieldname === "pdf") {
      return {
        folder: "reference_books/pdfs",
        resource_type: "raw",    // 🔥 REQUIRED
        public_id: `pdf_${Date.now()}`,
        format: "pdf",
        access_mode: "public",   // 🔥 REQUIRED
      };
    }

    return {
      folder: "reference_books/covers",
      resource_type: "image",
      public_id: `cover_${Date.now()}`,
    };
  },
});

const upload = multer({ storage });

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
    console.error(err);
    res.status(500).json({ message: "Auth check failed" });
  }
};

/* =========================
   📚 CREATE REFERENCE BOOK
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

      const pdfFile = req.files.pdf[0];

const pdfUrl = pdfFile.path;         // optional (for reference)
const pdfPublicId = pdfFile.filename; // 🔥 REQUIRED
      const coverImage = req.files.cover
        ? req.files.cover[0].path
        : null;

      const book = await ReferenceBook.create({
  title: title.trim(),
  author: author.trim(),
  subject: subject.trim(),
  description,
  price: Number(price),

  pdfUrl,          // optional
  pdfPublicId,     // 🔥 THIS FIXES EVERYTHING
  coverImage,
});

      res.status(201).json(book);
    } catch (err) {
      console.error("BOOK CREATE ERROR:", err);
      res.status(500).json({ message: "Book creation failed" });
    }
  }
);

/* =========================
   📚 GET ALL BOOKS
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

    res.json({ message: "Book purchased successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Purchase failed" });
  }
});

/* =========================
   🔍 CHECK BOOK ACCESS
========================= */
router.get("/:id/access", auth, async (req, res) => {
  const user = await User.findById(req.userId);
  res.json({
    hasAccess: user?.purchasedBooks.includes(req.params.id),
  });
});

/* =========================
   🔐 SECURE PDF STREAM
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

    // ✅ ONLY correct way for RAW PDFs
    const signedUrl = cloudinary.utils.private_download_url(
      book.pdfPublicId, // example: reference_books/pdfs/pdf_1770050765605.pdf
      "pdf",
      {
        resource_type: "raw",
        expires_at: Math.floor(Date.now() / 1000) + 300, // 5 minutes
      }
    );

    res.json({ url: signedUrl });
  } catch (err) {
    console.error("PDF SIGN ERROR:", err);
    res.status(500).json({ message: "PDF access failed" });
  }
});

module.exports = router;