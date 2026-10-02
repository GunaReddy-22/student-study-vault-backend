const mongoose = require("mongoose");

const quizAttemptSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    examType: {
      type: String,
      required: true,
      index: true,
    },
    subject: {
      type: String,
      default: "General",
    },
    topic: {
      type: String,
      default: "Mixed",
    },
    difficulty: {
      type: String,
      enum: ["Easy", "Medium", "Hard"],
      default: "Medium",
    },
    totalQuestions: {
      type: Number,
      required: true,
    },
    correctAnswers: {
      type: Number,
      required: true,
    },
    score: {
      type: Number,
      required: true,
    },
    accuracy: {
      type: Number,
      required: true,
    },
    timeSpentSeconds: {
      type: Number,
      default: 0,
    },
    questions: [
      {
        question: String,
        imageUrl: String,
        options: [String],
        selectedAnswer: Number, // index selected by student (-1 for unattempted)
        correctAnswer: Number,  // index of correct option
        isCorrect: Boolean,
        explanation: String,
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("QuizAttempt", quizAttemptSchema);
