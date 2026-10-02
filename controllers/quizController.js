const QuizAttempt = require("../models/QuizAttempt");
const CustomQuiz = require("../models/CustomQuiz");
const {
  EXAM_PRESETS,
  fetchFromOpenTriviaDB,
  generateExamQuestionsWithAI,
} = require("../services/quizService");

/**
 * 📚 GET CATEGORIES & EXAM PRESETS
 */
exports.getCategories = async (req, res) => {
  try {
    const customQuizzes = await CustomQuiz.find({ isPublished: true })
      .select("title category subject topic difficulty timeMinutes questions")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      categories: EXAM_PRESETS,
      customQuizzes: customQuizzes.map((cq) => ({
        id: cq._id,
        title: cq.title,
        category: cq.category,
        subject: cq.subject,
        topic: cq.topic,
        difficulty: cq.difficulty,
        timeMinutes: cq.timeMinutes,
        questionCount: cq.questions ? cq.questions.length : 0,
      })),
    });
  } catch (err) {
    console.error("Failed to get quiz categories:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * ⚡ GENERATE / FETCH PRACTICE QUIZ
 */
exports.generateQuiz = async (req, res) => {
  try {
    const {
      customQuizId,
      examId = "gate-cs",
      examName = "GATE (Computer Science)",
      subject = "Core Computer Science",
      topic = "Data Structures & Algorithm Complexity",
      difficulty = "Medium",
      count = 5,
    } = req.body;

    // Handle Custom Quiz from CMS
    if (customQuizId) {
      const cq = await CustomQuiz.findById(customQuizId);
      if (cq && cq.questions && cq.questions.length > 0) {
        return res.status(200).json({
          success: true,
          quiz: {
            id: `cq_${cq._id}_${Date.now()}`,
            examId: `custom_${cq._id}`,
            examName: cq.title,
            subject: cq.subject,
            topic: cq.topic,
            difficulty: cq.difficulty,
            timeMinutes: cq.timeMinutes || 15,
            questions: cq.questions,
          },
        });
      }
    }

    const numQuestions = Math.min(20, Math.max(3, parseInt(count, 10) || 5));

    let questions = [];

    if (examId === "opentdb") {
      try {
        questions = await fetchFromOpenTriviaDB({
          topic,
          count: numQuestions,
          difficulty,
        });
      } catch (openErr) {
        console.warn("OpenTDB error, falling back to AI generator:", openErr.message);
        questions = await generateExamQuestionsWithAI({
          examType: examName,
          subject,
          topic,
          count: numQuestions,
          difficulty,
        });
      }
    } else {
      questions = await generateExamQuestionsWithAI({
        examType: examName,
        subject,
        topic,
        count: numQuestions,
        difficulty,
      });
    }

    return res.status(200).json({
      success: true,
      quiz: {
        examId,
        examName,
        subject,
        topic,
        difficulty,
        totalQuestions: questions.length,
        timeLimitMinutes: Math.max(3, Math.ceil(questions.length * 1.5)),
        questions,
      },
    });
  } catch (err) {
    console.error("Quiz generation error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to generate quiz. Please try again.",
    });
  }
};

/**
 * 🏆 SUBMIT QUIZ ATTEMPT & RECORD RESULTS
 */
exports.submitQuiz = async (req, res) => {
  try {
    const {
      examType,
      subject,
      topic,
      difficulty = "Medium",
      totalQuestions,
      questions = [],
      timeSpentSeconds = 0,
    } = req.body;

    let correctCount = 0;
    const evaluatedQuestions = questions.map((q) => {
      const isCorrect = q.selectedAnswer === q.correctAnswer;
      if (isCorrect) correctCount++;
      return {
        question: q.question,
        imageUrl: q.imageUrl || "",
        options: q.options,
        selectedAnswer: q.selectedAnswer,
        correctAnswer: q.correctAnswer,
        isCorrect,
        explanation: q.explanation,
      };
    });

    const total = totalQuestions || questions.length || 1;
    const accuracy = Math.round((correctCount / total) * 100);
    // Score calculation (+4 for correct, -1 for wrong, 0 for unattempted JEE style or simple points)
    const score = correctCount * 4 - (total - correctCount - questions.filter(q => q.selectedAnswer === -1).length) * 1;

    let attempt = null;

    if (req.userId) {
      attempt = await QuizAttempt.create({
        userId: req.userId,
        examType: examType || "Practice Quiz",
        subject: subject || "General",
        topic: topic || "Mixed",
        difficulty,
        totalQuestions: total,
        correctAnswers: correctCount,
        score: Math.max(0, score),
        accuracy,
        timeSpentSeconds,
        questions: evaluatedQuestions,
      });
    }

    return res.status(200).json({
      success: true,
      result: {
        attemptId: attempt ? attempt._id : null,
        totalQuestions: total,
        correctAnswers: correctCount,
        incorrectAnswers: total - correctCount,
        score: Math.max(0, score),
        accuracy,
        timeSpentSeconds,
        performanceGrade:
          accuracy >= 80 ? "Outstanding 🌟" : accuracy >= 60 ? "Good Job 🚀" : accuracy >= 40 ? "Keep Practicing 📈" : "Needs Review 💡",
        questions: evaluatedQuestions,
      },
    });
  } catch (err) {
    console.error("Submit quiz error:", err);
    return res.status(500).json({ success: false, message: "Submission failed" });
  }
};

/**
 * 📈 GET USER ATTEMPT HISTORY & METRICS
 */
exports.getUserHistory = async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const attempts = await QuizAttempt.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    const totalTests = attempts.length;
    const totalQuestions = attempts.reduce((acc, a) => acc + (a.totalQuestions || 0), 0);
    const totalCorrect = attempts.reduce((acc, a) => acc + (a.correctAnswers || 0), 0);
    const avgAccuracy = totalTests > 0 ? Math.round((totalCorrect / (totalQuestions || 1)) * 100) : 0;
    const highestScore = totalTests > 0 ? Math.max(...attempts.map((a) => a.score || 0)) : 0;

    return res.status(200).json({
      success: true,
      stats: {
        totalTests,
        totalQuestions,
        totalCorrect,
        avgAccuracy,
        highestScore,
      },
      history: attempts,
    });
  } catch (err) {
    console.error("Fetch quiz history error:", err);
    return res.status(500).json({ success: false, message: "Failed to load history" });
  }
};
