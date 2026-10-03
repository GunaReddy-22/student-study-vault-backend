const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const auth = require("../middleware/authMiddleware");
const User = require("../models/User");
const Note = require("../models/Note");
const ReferenceBook = require("../models/ReferenceBook");
const WalletTransaction = require("../models/WalletTransaction");
const CustomQuiz = require("../models/CustomQuiz");
const QuizAttempt = require("../models/QuizAttempt");
const WithdrawalRequest = require("../models/WithdrawalRequest");
const SupportTicket = require("../models/SupportTicket");
const FreeStudyResource = require("../models/FreeStudyResource");
const cloudinaryService = require("../services/cloudinaryService");

/* ============================================================
 * 🛡️ CMS DEVELOPER AUTH MIDDLEWARE
 * ============================================================ */
const requireDeveloper = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || user.email !== "dev@studyvault.com" || user.isDeveloper !== true) {
      return res.status(403).json({
        success: false,
        message: "Access Denied: Only dev@studyvault.com has master CMS Developer authority.",
      });
    }
    req.developerUser = user;
    next();
  } catch (err) {
    console.error("CMS Auth Error:", err);
    res.status(500).json({ success: false, message: "Server error verifying developer role." });
  }
};

// Protect all CMS routes
router.use(auth, requireDeveloper);

/* ============================================================
 * 📊 1. CMS DASHBOARD & SYSTEM OVERVIEW STATS
 * GET /api/cms/stats
 * ============================================================ */
router.get("/stats", async (req, res) => {
  try {
    const [
      totalUsers,
      totalNotes,
      publicNotes,
      premiumNotes,
      totalBooks,
      customQuizzesCount,
      allAttemptsCount,
      allUsers,
      recentTransactions,
      recentUsers,
      pendingWithdrawalsCount,
      openSupportTicketsCount,
      totalFreeResourcesCount,
    ] = await Promise.all([
      User.countDocuments(),
      Note.countDocuments(),
      Note.countDocuments({ isPublic: true, isPremium: false }),
      Note.countDocuments({ isPremium: true }),
      ReferenceBook.countDocuments(),
      CustomQuiz.countDocuments(),
      QuizAttempt.countDocuments(),
      User.find().select("walletBalance"),
      WalletTransaction.find()
        .populate("user", "username email")
        .sort({ createdAt: -1 })
        .limit(12),
      User.find()
        .select("-password")
        .sort({ createdAt: -1 })
        .limit(8),
      WithdrawalRequest.countDocuments({ status: "PENDING" }),
      SupportTicket.countDocuments({ status: { $in: ["open", "in_progress"] } }),
      FreeStudyResource.countDocuments(),
    ]);

    const totalCirculationBalance = allUsers.reduce((acc, u) => acc + (u.walletBalance || 0), 0);

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalNotes,
        publicNotes,
        premiumNotes,
        totalBooks,
        totalQuizzes: customQuizzesCount,
        allAttemptsCount,
        totalCirculationBalance,
        totalFreeResources: totalFreeResourcesCount,
        developerBalance: req.developerUser.walletBalance || 0,
        pendingWithdrawals: pendingWithdrawalsCount,
        openSupportTickets: openSupportTicketsCount,
      },
      storageProvider: {
        name: "Cloudinary",
        isConfigured: cloudinaryService.isConfigured(),
        cloudName: process.env.CLOUDINARY_CLOUD_NAME || "Not Set",
        features: ["Auto-Optimization", "High-Speed CDN", "Zero OAuth Expiration"],
      },
      recentTransactions,
      recentUsers,
    });
  } catch (err) {
    console.error("CMS stats error:", err);
    res.status(500).json({ success: false, message: "Failed to load CMS stats" });
  }
});

/* ============================================================
 * 👥 2. USER MANAGEMENT & WALLET CONTROL
 * ============================================================ */

// GET /api/cms/users - List users with search
router.get("/users", async (req, res) => {
  try {
    const { q } = req.query;
    let filter = {};

    if (q && q.trim()) {
      const queryRegex = new RegExp(q.trim(), "i");
      filter = {
        $or: [{ username: queryRegex }, { email: queryRegex }],
      };
    }

    const users = await User.find(filter)
      .select("-password")
      .sort({ createdAt: -1 });

    // Attach note count to each user
    const userIds = users.map((u) => u._id);
    const noteCounts = await Note.aggregate([
      { $match: { userId: { $in: userIds } } },
      { $group: { _id: "$userId", count: { $sum: 1 } } },
    ]);

    const countMap = {};
    noteCounts.forEach((nc) => {
      countMap[nc._id.toString()] = nc.count;
    });

    const enrichedUsers = users.map((u) => ({
      _id: u._id,
      username: u.username,
      email: u.email,
      walletBalance: u.walletBalance || 0,
      isDeveloper: u.email.toLowerCase() === "dev@studyvault.com" && u.isDeveloper === true,
      isBanned: u.isBanned === true,
      notesCount: countMap[u._id.toString()] || 0,
      purchasedNotesCount: u.purchasedNotes ? u.purchasedNotes.length : 0,
      purchasedBooksCount: u.purchasedBooks ? u.purchasedBooks.length : 0,
      createdAt: u.createdAt,
    }));

    res.json({ success: true, users: enrichedUsers });
  } catch (err) {
    console.error("CMS users fetch error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch users" });
  }
});

// POST /api/cms/users/:id/reset-password - Direct password reset by Developer
router.post("/users/:id/reset-password", async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.trim().length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters long." });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const hashedPassword = await bcrypt.hash(newPassword.trim(), 10);
    user.password = hashedPassword;
    user.resetOTP = undefined;
    user.resetOTPExpire = undefined;
    await user.save();

    res.json({
      success: true,
      message: `Password for ${user.username} (${user.email}) successfully updated!`,
    });
  } catch (err) {
    console.error("CMS Reset Password Error:", err);
    res.status(500).json({ success: false, message: "Failed to reset password" });
  }
});

// PATCH /api/cms/users/:id/toggle-ban - Suspend or reactivate user account
router.patch("/users/:id/toggle-ban", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (user._id.toString() === req.developerUser._id.toString()) {
      return res.status(400).json({ success: false, message: "Cannot suspend your own developer account." });
    }

    user.isBanned = !user.isBanned;
    await user.save();

    res.json({
      success: true,
      message: user.isBanned
        ? `Account for ${user.username} has been SUSPENDED.`
        : `Account for ${user.username} has been REACTIVATED.`,
      isBanned: user.isBanned,
    });
  } catch (err) {
    console.error("CMS Toggle Ban Error:", err);
    res.status(500).json({ success: false, message: "Failed to update user status" });
  }
});

// POST /api/cms/users/:id/wallet/set-balance - Set exact balance directly
router.post("/users/:id/wallet/set-balance", async (req, res) => {
  try {
    const { amount, reason } = req.body;
    const targetBalance = Number(amount);

    if (isNaN(targetBalance) || targetBalance < 0) {
      return res.status(400).json({ success: false, message: "Valid non-negative balance is required." });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const diff = targetBalance - (user.walletBalance || 0);
    user.walletBalance = targetBalance;
    await user.save();

    if (diff !== 0) {
      await WalletTransaction.create({
        user: user._id,
        type: diff > 0 ? "CREDIT" : "DEBIT",
        amount: Math.abs(diff),
        reason: reason ? `[CMS Set Balance] ${reason}` : `[CMS Set Balance] Overridden to ₹${targetBalance} by Developer`,
        relatedUser: req.developerUser._id,
      });
    }

    res.json({
      success: true,
      message: `Balance for ${user.username} set to ₹${targetBalance}`,
      newBalance: user.walletBalance,
    });
  } catch (err) {
    console.error("CMS Set Balance Error:", err);
    res.status(500).json({ success: false, message: "Failed to set balance" });
  }
});

// DELETE /api/cms/users/:id - Delete user account
router.delete("/users/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (user._id.toString() === req.developerUser._id.toString()) {
      return res.status(400).json({ success: false, message: "Cannot delete your own account." });
    }

    await User.findByIdAndDelete(req.params.id);
    await Note.deleteMany({ userId: req.params.id });

    res.json({ success: true, message: `User ${user.username} permanently deleted.` });
  } catch (err) {
    console.error("CMS Delete User Error:", err);
    res.status(500).json({ success: false, message: "Failed to delete user" });
  }
});

// POST /api/cms/users/:id/wallet/credit - Add balance to user
router.post("/users/:id/wallet/credit", async (req, res) => {
  try {
    const { amount, reason } = req.body;
    const creditAmount = Number(amount);

    if (!creditAmount || creditAmount <= 0) {
      return res.status(400).json({ success: false, message: "Valid positive amount is required" });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    user.walletBalance = (user.walletBalance || 0) + creditAmount;
    await user.save();

    const tx = await WalletTransaction.create({
      user: user._id,
      type: "CREDIT",
      amount: creditAmount,
      reason: reason ? `[CMS Credit] ${reason}` : "[CMS Credit] Added by Developer Admin",
      relatedUser: req.developerUser._id,
    });

    res.json({
      success: true,
      message: `Successfully credited ₹${creditAmount} to ${user.username}`,
      newBalance: user.walletBalance,
      transaction: tx,
    });
  } catch (err) {
    console.error("CMS Credit Error:", err);
    res.status(500).json({ success: false, message: "Failed to credit balance" });
  }
});

// POST /api/cms/users/:id/wallet/debit - Deduct balance from user
router.post("/users/:id/wallet/debit", async (req, res) => {
  try {
    const { amount, reason } = req.body;
    const debitAmount = Number(amount);

    if (!debitAmount || debitAmount <= 0) {
      return res.status(400).json({ success: false, message: "Valid positive amount is required" });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if ((user.walletBalance || 0) < debitAmount) {
      return res.status(400).json({
        success: false,
        message: `Cannot deduct ₹${debitAmount}. User only has ₹${user.walletBalance || 0}`,
      });
    }

    user.walletBalance = Math.max(0, (user.walletBalance || 0) - debitAmount);
    await user.save();

    const tx = await WalletTransaction.create({
      user: user._id,
      type: "DEBIT",
      amount: debitAmount,
      reason: reason ? `[CMS Debit] ${reason}` : "[CMS Debit] Deducted by Developer Admin",
      relatedUser: req.developerUser._id,
    });

    res.json({
      success: true,
      message: `Successfully deducted ₹${debitAmount} from ${user.username}`,
      newBalance: user.walletBalance,
      transaction: tx,
    });
  } catch (err) {
    console.error("CMS Debit Error:", err);
    res.status(500).json({ success: false, message: "Failed to deduct balance" });
  }
});

// PATCH /api/cms/users/:id/toggle-developer - Developer role strictly locked
router.patch("/users/:id/toggle-developer", async (req, res) => {
  return res.status(403).json({
    success: false,
    message: "Developer access is strictly restricted to dev@studyvault.com exclusively.",
  });
});

/* ============================================================
 * 📝 3. QUIZ CMS MANAGEMENT (ADD / EDIT / DELETE QUIZZES)
 * ============================================================ */

// GET /api/cms/quizzes - List all custom quizzes
router.get("/quizzes", async (req, res) => {
  try {
    const quizzes = await CustomQuiz.find()
      .populate("createdBy", "username email")
      .sort({ createdAt: -1 });

    res.json({ success: true, quizzes });
  } catch (err) {
    console.error("CMS quiz fetch error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch quizzes" });
  }
});

// POST /api/cms/quizzes - Create new custom quiz
router.post("/quizzes", async (req, res) => {
  try {
    const {
      title,
      category,
      subject,
      topic,
      difficulty = "Medium",
      timeMinutes = 15,
      questions = [],
      isPublished = true,
    } = req.body;

    if (!title || !subject || !topic) {
      return res.status(400).json({ success: false, message: "Title, subject, and topic are required." });
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ success: false, message: "At least one question is required." });
    }

    // Validate and format questions
    const formattedQuestions = questions.map((q, idx) => ({
      id: idx + 1,
      type: q.type || "mcq",
      question: q.question,
      imageUrl: q.imageUrl || "",
      imagePublicId: q.imagePublicId || "",
      options: Array.isArray(q.options) && q.options.length > 0 ? q.options : ["A", "B", "C", "D"],
      correctAnswer: q.correctAnswer,
      explanation: q.explanation || "",
      hint: q.hint || "",
    }));

    const quiz = await CustomQuiz.create({
      title,
      category: category || "General",
      subject,
      topic,
      difficulty,
      timeMinutes: Number(timeMinutes) || 15,
      questions: formattedQuestions,
      isPublished,
      createdBy: req.developerUser._id,
    });

    res.status(201).json({
      success: true,
      message: "Custom quiz created and published successfully!",
      quiz,
    });
  } catch (err) {
    console.error("CMS Quiz Create Error:", err);
    res.status(500).json({ success: false, message: "Failed to create quiz" });
  }
});

// GET /api/cms/quizzes/:id - Fetch single quiz with full questions & images
router.get("/quizzes/:id", async (req, res) => {
  try {
    const quiz = await CustomQuiz.findById(req.params.id).populate("createdBy", "username email");
    if (!quiz) return res.status(404).json({ success: false, message: "Quiz not found" });

    res.json({ success: true, quiz });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load quiz details" });
  }
});

// POST /api/cms/quizzes/:id/clone - Duplicate existing quiz
router.post("/quizzes/:id/clone", async (req, res) => {
  try {
    const original = await CustomQuiz.findById(req.params.id);
    if (!original) return res.status(404).json({ success: false, message: "Original quiz not found" });

    const cloned = await CustomQuiz.create({
      title: `${original.title} (Copy)`,
      category: original.category,
      subject: original.subject,
      topic: original.topic,
      difficulty: original.difficulty,
      timeMinutes: original.timeMinutes,
      questions: original.questions,
      isPublished: false, // Start clone as draft
      createdBy: req.developerUser._id,
    });

    res.json({ success: true, message: "Quiz cloned successfully as draft!", quiz: cloned });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to clone quiz" });
  }
});

// PUT /api/cms/quizzes/:id - Update existing quiz
router.put("/quizzes/:id", async (req, res) => {
  try {
    const quiz = await CustomQuiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ success: false, message: "Quiz not found" });

    const {
      title,
      category,
      subject,
      topic,
      difficulty,
      timeMinutes,
      questions,
      isPublished,
    } = req.body;

    if (title) quiz.title = title;
    if (category) quiz.category = category;
    if (subject) quiz.subject = subject;
    if (topic) quiz.topic = topic;
    if (difficulty) quiz.difficulty = difficulty;
    if (timeMinutes) quiz.timeMinutes = Number(timeMinutes);
    if (typeof isPublished === "boolean") quiz.isPublished = isPublished;

    if (Array.isArray(questions) && questions.length > 0) {
      quiz.questions = questions.map((q, idx) => ({
        id: idx + 1,
        type: q.type || "mcq",
        question: q.question,
        imageUrl: q.imageUrl || "",
        imagePublicId: q.imagePublicId || "",
        options: q.options || [],
        correctAnswer: q.correctAnswer,
        explanation: q.explanation || "",
        hint: q.hint || "",
      }));
    }

    await quiz.save();

    res.json({ success: true, message: "Quiz updated successfully", quiz });
  } catch (err) {
    console.error("CMS Quiz Update Error:", err);
    res.status(500).json({ success: false, message: "Failed to update quiz" });
  }
});

// DELETE /api/cms/quizzes/:id - Delete quiz
router.delete("/quizzes/:id", async (req, res) => {
  try {
    const quiz = await CustomQuiz.findByIdAndDelete(req.params.id);
    if (!quiz) return res.status(404).json({ success: false, message: "Quiz not found" });

    res.json({ success: true, message: "Quiz deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to delete quiz" });
  }
});

// PATCH /api/cms/quizzes/:id/publish - Toggle publish
router.patch("/quizzes/:id/publish", async (req, res) => {
  try {
    const quiz = await CustomQuiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ success: false, message: "Quiz not found" });

    quiz.isPublished = !quiz.isPublished;
    await quiz.save();

    res.json({
      success: true,
      message: `Quiz is now ${quiz.isPublished ? "Published" : "Draft"}`,
      isPublished: quiz.isPublished,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to toggle quiz publish status" });
  }
});

/* ============================================================
 * ☁️ 4. IMAGE STORAGE & CLOUDINARY MANAGEMENT
 * ============================================================ */

// POST /api/cms/upload - Direct Cloudinary upload
router.post("/upload", async (req, res) => {
  try {
    const { image, folder = "studyvault_assets" } = req.body;
    if (!image) {
      return res.status(400).json({ success: false, message: "Image base64 data URI required." });
    }

    const uploadRes = await cloudinaryService.uploadBase64Image(image, folder);
    if (!uploadRes.success) {
      return res.status(500).json({ success: false, message: uploadRes.error || "Upload failed" });
    }

    res.json({
      success: true,
      url: uploadRes.url,
      publicId: uploadRes.publicId,
    });
  } catch (err) {
    console.error("CMS Upload Error:", err);
    res.status(500).json({ success: false, message: "Upload failed" });
  }
});

/* ============================================================
 * 📚 5. NOTES MODERATION & MANAGEMENT
 * ============================================================ */

// GET /api/cms/notes - View all notes
router.get("/notes", async (req, res) => {
  try {
    const { q, type } = req.query;
    let filter = {};

    if (type === "public") filter = { isPublic: true, isPremium: false };
    else if (type === "premium") filter = { isPremium: true };
    else if (type === "private") filter = { isPublic: false, isPremium: false };

    if (q && q.trim()) {
      const regex = new RegExp(q.trim(), "i");
      filter.$or = [{ title: regex }, { subject: regex }];
    }

    const notes = await Note.find(filter)
      .populate("userId", "username email")
      .sort({ createdAt: -1 })
      .limit(60);

    res.json({ success: true, notes });
  } catch (err) {
    console.error("CMS notes fetch error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch notes" });
  }
});

// DELETE /api/cms/notes/:id - Remove note as admin
router.delete("/notes/:id", async (req, res) => {
  try {
    const note = await Note.findByIdAndDelete(req.params.id);
    if (!note) return res.status(404).json({ success: false, message: "Note not found" });

    res.json({ success: true, message: "Note deleted by administrator" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to delete note" });
  }
});

/* ============================================================
 * 💳 6. GLOBAL TRANSACTIONS LOG
 * GET /api/cms/transactions
 * ============================================================ */
router.get("/transactions", async (req, res) => {
  try {
    const transactions = await WalletTransaction.find()
      .populate("user", "username email")
      .populate("relatedUser", "username email")
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({ success: true, transactions });
  } catch (err) {
    console.error("CMS transactions fetch error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch transactions" });
  }
});

/* ============================================================
 * 💸 7. WITHDRAWAL REQUESTS & PAYOUT APPROVALS
 * ============================================================ */

// GET /api/cms/withdrawals - List all withdrawal requests
router.get("/withdrawals", async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status && status !== "ALL" ? { status } : {};

    const requests = await WithdrawalRequest.find(filter)
      .populate("user", "username email walletBalance")
      .populate("approvedBy", "username email")
      .sort({ createdAt: -1 });

    res.json({ success: true, withdrawals: requests });
  } catch (err) {
    console.error("CMS withdrawals error:", err);
    res.status(500).json({ success: false, message: "Failed to load withdrawal requests" });
  }
});

// POST /api/cms/withdrawals/:id/approve - Approve withdrawal & record payout UTR/reference
router.post("/withdrawals/:id/approve", async (req, res) => {
  try {
    const { payoutRef, payoutNotes } = req.body;
    const request = await WithdrawalRequest.findById(req.params.id).populate("user");
    if (!request) return res.status(404).json({ success: false, message: "Withdrawal request not found" });

    if (request.status !== "PENDING") {
      return res.status(400).json({ success: false, message: `Request is already ${request.status}` });
    }

    const ref = payoutRef && payoutRef.trim() ? payoutRef.trim() : `UPI-UTR-${Date.now()}`;

    request.status = "APPROVED";
    request.payoutRef = ref;
    request.payoutNotes = payoutNotes ? payoutNotes.trim() : "Approved and disbursed via UPI/source";
    request.approvedBy = req.developerUser._id;
    request.approvedAt = new Date();
    await request.save();

    // Log definitive settlement transaction
    await WalletTransaction.create({
      user: request.user._id,
      type: "DEBIT",
      amount: request.amount,
      reason: `[Disbursed] ₹${request.amount} credited to ${request.method === "UPI" ? `UPI: ${request.upiId}` : "Bank A/C"} (Ref/UTR: ${ref})`,
      relatedUser: req.developerUser._id,
    });

    res.json({
      success: true,
      message: `Withdrawal of ₹${request.amount} for ${request.user.username} successfully approved and marked as paid!`,
      withdrawal: request,
    });
  } catch (err) {
    console.error("CMS Approve Withdrawal Error:", err);
    res.status(500).json({ success: false, message: "Failed to approve withdrawal" });
  }
});

// POST /api/cms/withdrawals/:id/reject - Reject withdrawal & refund back to student wallet
router.post("/withdrawals/:id/reject", async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    const request = await WithdrawalRequest.findById(req.params.id).populate("user");
    if (!request) return res.status(404).json({ success: false, message: "Withdrawal request not found" });

    if (request.status !== "PENDING") {
      return res.status(400).json({ success: false, message: `Request is already ${request.status}` });
    }

    // Refund held amount back to user's wallet
    const user = await User.findById(request.user._id);
    if (user) {
      user.walletBalance = (user.walletBalance || 0) + request.amount;
      await user.save();
    }

    const reason = rejectionReason && rejectionReason.trim() ? rejectionReason.trim() : "Rejected by Developer Admin";

    request.status = "REJECTED";
    request.rejectionReason = reason;
    request.rejectedAt = new Date();
    request.approvedBy = req.developerUser._id;
    await request.save();

    // Log refund in transaction ledger
    await WalletTransaction.create({
      user: request.user._id,
      type: "CREDIT",
      amount: request.amount,
      reason: `[Withdrawal Refunded] ₹${request.amount} restored to wallet. Reason: ${reason}`,
      relatedUser: req.developerUser._id,
    });

    res.json({
      success: true,
      message: `Withdrawal rejected and ₹${request.amount} successfully refunded back to ${request.user.username}'s wallet.`,
      withdrawal: request,
    });
  } catch (err) {
    console.error("CMS Reject Withdrawal Error:", err);
    res.status(500).json({ success: false, message: "Failed to reject withdrawal" });
  }
});

/* ============================================================
 * 🏛️ 9. CMS FREE STUDY HUB & CHAPTER-WISE RESOURCE MANAGER
 * ============================================================ */

// GET /api/cms/free-resources - List all CMS free study resources with filter
router.get("/free-resources", async (req, res) => {
  try {
    const { examId, subject, search } = req.query;
    const filter = {};

    if (examId && examId !== "all") {
      filter.examId = examId;
    }
    if (subject && subject !== "all") {
      filter.subject = new RegExp(subject, "i");
    }
    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { title: new RegExp(q, "i") },
        { chapterTitle: new RegExp(q, "i") },
        { whatToStudy: new RegExp(q, "i") },
        { keyConcepts: { $elemMatch: { $regex: q, $options: "i" } } },
      ];
    }

    const resources = await FreeStudyResource.find(filter)
      .sort({ createdAt: -1 })
      .populate("createdBy", "username email");

    res.json({
      success: true,
      count: resources.length,
      resources,
    });
  } catch (err) {
    console.error("CMS Get Free Resources Error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch free study resources" });
  }
});

// POST /api/cms/free-resources - Create a new Free Study Resource
router.post("/free-resources", async (req, res) => {
  try {
    const {
      title,
      examId,
      subject,
      subjectIcon,
      subjectWeightage,
      chapterNo,
      chapterTitle,
      importance,
      whatToStudy,
      keyConcepts,
      pyqFocus,
      freeVideoUrl,
      freeVideoChannel,
      freeBookName,
      freeBookUrl,
      freeBookType,
      officialPortalUrl,
      isPublished,
    } = req.body;

    if (!title || !subject) {
      return res.status(400).json({ success: false, message: "Title and Subject are required" });
    }

    const conceptsArray = Array.isArray(keyConcepts)
      ? keyConcepts
      : typeof keyConcepts === "string"
      ? keyConcepts.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    const newResource = await FreeStudyResource.create({
      title: title.trim(),
      examId: examId || "general",
      subject: subject.trim(),
      subjectIcon: subjectIcon || "📚",
      subjectWeightage: subjectWeightage || "Standard Topic",
      chapterNo: Number(chapterNo) || 1,
      chapterTitle: (chapterTitle || title).trim(),
      importance: importance || "High Yield",
      whatToStudy: whatToStudy ? whatToStudy.trim() : "",
      keyConcepts: conceptsArray,
      pyqFocus: pyqFocus ? pyqFocus.trim() : "",
      freeVideoUrl: freeVideoUrl ? freeVideoUrl.trim() : "",
      freeVideoChannel: freeVideoChannel ? freeVideoChannel.trim() : "YouTube Open Course",
      freeBookName: freeBookName ? freeBookName.trim() : "",
      freeBookUrl: freeBookUrl ? freeBookUrl.trim() : "",
      freeBookType: freeBookType ? freeBookType.trim() : "100% Free Public Resource",
      officialPortalUrl: officialPortalUrl ? officialPortalUrl.trim() : "",
      isPublished: isPublished !== false,
      createdBy: req.developerUser._id,
    });

    res.status(201).json({
      success: true,
      message: `✅ Created "${newResource.title}" in Free Study Hub!`,
      resource: newResource,
    });
  } catch (err) {
    console.error("CMS Create Free Resource Error:", err);
    res.status(500).json({ success: false, message: "Failed to create free study resource", error: err.message });
  }
});

// PUT /api/cms/free-resources/:id - Update existing Free Study Resource
router.put("/free-resources/:id", async (req, res) => {
  try {
    const resource = await FreeStudyResource.findById(req.params.id);
    if (!resource) {
      return res.status(404).json({ success: false, message: "Resource not found" });
    }

    const {
      title,
      examId,
      subject,
      subjectIcon,
      subjectWeightage,
      chapterNo,
      chapterTitle,
      importance,
      whatToStudy,
      keyConcepts,
      pyqFocus,
      freeVideoUrl,
      freeVideoChannel,
      freeBookName,
      freeBookUrl,
      freeBookType,
      officialPortalUrl,
      isPublished,
    } = req.body;

    if (title !== undefined) resource.title = title.trim();
    if (examId !== undefined) resource.examId = examId;
    if (subject !== undefined) resource.subject = subject.trim();
    if (subjectIcon !== undefined) resource.subjectIcon = subjectIcon;
    if (subjectWeightage !== undefined) resource.subjectWeightage = subjectWeightage;
    if (chapterNo !== undefined) resource.chapterNo = Number(chapterNo);
    if (chapterTitle !== undefined) resource.chapterTitle = chapterTitle.trim();
    if (importance !== undefined) resource.importance = importance;
    if (whatToStudy !== undefined) resource.whatToStudy = whatToStudy.trim();
    if (keyConcepts !== undefined) {
      resource.keyConcepts = Array.isArray(keyConcepts)
        ? keyConcepts
        : typeof keyConcepts === "string"
        ? keyConcepts.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
    }
    if (pyqFocus !== undefined) resource.pyqFocus = pyqFocus.trim();
    if (freeVideoUrl !== undefined) resource.freeVideoUrl = freeVideoUrl.trim();
    if (freeVideoChannel !== undefined) resource.freeVideoChannel = freeVideoChannel.trim();
    if (freeBookName !== undefined) resource.freeBookName = freeBookName.trim();
    if (freeBookUrl !== undefined) resource.freeBookUrl = freeBookUrl.trim();
    if (freeBookType !== undefined) resource.freeBookType = freeBookType.trim();
    if (officialPortalUrl !== undefined) resource.officialPortalUrl = officialPortalUrl.trim();
    if (isPublished !== undefined) resource.isPublished = Boolean(isPublished);

    await resource.save();

    res.json({
      success: true,
      message: `✅ Updated "${resource.title}" successfully!`,
      resource,
    });
  } catch (err) {
    console.error("CMS Update Free Resource Error:", err);
    res.status(500).json({ success: false, message: "Failed to update resource" });
  }
});

// DELETE /api/cms/free-resources/:id - Delete a free study resource
router.delete("/free-resources/:id", async (req, res) => {
  try {
    const resource = await FreeStudyResource.findByIdAndDelete(req.params.id);
    if (!resource) {
      return res.status(404).json({ success: false, message: "Resource not found" });
    }
    res.json({
      success: true,
      message: `🗑️ Successfully deleted "${resource.title}" from Free Study Hub`,
    });
  } catch (err) {
    console.error("CMS Delete Free Resource Error:", err);
    res.status(500).json({ success: false, message: "Failed to delete resource" });
  }
});

// PATCH /api/cms/free-resources/:id/toggle-publish - Quick toggle publish status
router.patch("/free-resources/:id/toggle-publish", async (req, res) => {
  try {
    const resource = await FreeStudyResource.findById(req.params.id);
    if (!resource) {
      return res.status(404).json({ success: false, message: "Resource not found" });
    }
    resource.isPublished = !resource.isPublished;
    await resource.save();

    res.json({
      success: true,
      message: `Resource is now ${resource.isPublished ? "PUBLISHED (Live for students)" : "UNPUBLISHED (Draft)"}`,
      isPublished: resource.isPublished,
    });
  } catch (err) {
    console.error("CMS Toggle Publish Error:", err);
    res.status(500).json({ success: false, message: "Failed to toggle status" });
  }
});

// POST /api/cms/free-resources/seed-curriculum - Bulk seed standard curated free study guides
router.post("/free-resources/seed-curriculum", async (req, res) => {
  try {
    const { CURRICULUM_SEED_RESOURCES } = require("../services/curriculumSeedData");
    let insertedCount = 0;
    let updatedCount = 0;

    for (const item of CURRICULUM_SEED_RESOURCES) {
      const existing = await FreeStudyResource.findOne({
        examId: item.examId,
        chapterTitle: item.chapterTitle,
      });

      if (!existing) {
        await FreeStudyResource.create({
          ...item,
          createdBy: req.developerUser._id,
        });
        insertedCount++;
      } else {
        Object.assign(existing, item);
        await existing.save();
        updatedCount++;
      }
    }

    res.json({
      success: true,
      message: `🎉 Successfully populated Study Hub with ${insertedCount + updatedCount} verified NCERT & Exam chapter guides! (${insertedCount} new, ${updatedCount} updated)`,
      insertedCount,
      updatedCount,
    });
  } catch (err) {
    console.error("CMS Seed Free Resources Error:", err);
    res.status(500).json({ success: false, message: "Failed to seed curriculum resources", error: err.message });
  }
});

module.exports = router;
