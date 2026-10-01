const express = require("express");
const router = express.Router();
const quizController = require("../controllers/quizController");
const authMiddleware = require("../middleware/authMiddleware");
const jwt = require("jsonwebtoken");

// Optional Auth Middleware for endpoints that allow guest mode
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = decoded.userId;
    } catch {}
  }
  next();
};

/* ===============================
   QUIZ ROUTES
=============================== */
// Get exam categories and available topics
router.get("/categories", quizController.getCategories);

// Generate / fetch mock quiz questions
router.post("/generate", optionalAuth, quizController.generateQuiz);

// Submit quiz answers & get performance scorecard
router.post("/submit", optionalAuth, quizController.submitQuiz);

// Get user quiz attempt history & stats
router.get("/history", authMiddleware, quizController.getUserHistory);

module.exports = router;
