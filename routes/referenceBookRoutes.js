const express = require("express");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");

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
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    if (file.fieldname === "pdf") {
      return {
        folder: "reference_books/pdfs",
        resource_type: "raw",
        public_id: `pdf_${Date.now()}`, // ✅ NO .pdf HERE
        access_mode: "public",
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

      // 🔥 IMPORTANT FIX
      const pdfPublicId = pdfFile.filename.replace(".pdf", "");
      const pdfUrl = pdfFile.path; // optional (preview/debug)
      const coverImage = req.files.cover
        ? req.files.cover[0].path
        : null;

      const book = await ReferenceBook.create({
        title: title.trim(),
        author: author.trim(),
        subject: subject.trim(),
        description,
        price: Number(price),

        pdfUrl,
        pdfPublicId,
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
    if (!user) {
      return res.status(401).json({ message: "User not found or session expired. Please log in again." });
    }

    const book = await ReferenceBook.findById(req.params.id);
    if (!book || !book.isActive) {
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
    if (developer) {
      developer.walletBalance = (developer.walletBalance || 0) + book.price;
      await developer.save();
    }
    user.purchasedBooks.push(book._id);
    book.purchases = (book.purchases || 0) + 1;

    await user.save();
    await book.save();

    const txs = [
      {
        user: user._id,
        type: "DEBIT",
        amount: book.price,
        reason: "Purchased reference book",
        relatedBook: book._id,
      },
    ];

    if (developer) {
      txs.push({
        user: developer._id,
        type: "CREDIT",
        amount: book.price,
        reason: "Reference book sale",
        relatedBook: book._id,
      });
    }

    await WalletTransaction.create(txs);

    res.json({ message: "Book purchased successfully" });
  } catch (err) {
    console.error("BUY BOOK ERROR:", err);
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
   🔐 GET SIGNED PDF URL (FINAL)
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

    if (!book.pdfPublicId) {
      return res.status(500).json({ message: "PDF not available" });
    }

    const signedUrl = cloudinary.url(book.pdfPublicId, {
      resource_type: "raw",
      type: "upload",
      secure: true,
      sign_url: true,
      expires_at: Math.floor(Date.now() / 1000) + 300, // 5 min
    });

    res.json({ url: signedUrl });
  } catch (err) {
    console.error("SIGNED PDF URL ERROR:", err);
    res.status(500).json({ message: "PDF access failed" });
  }
});

module.exports = router;