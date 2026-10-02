const mongoose = require("mongoose");

const customQuizSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      default: "General",
    },
    subject: {
      type: String,
      required: true,
      default: "General",
    },
    topic: {
      type: String,
      required: true,
      default: "Comprehensive",
    },
    difficulty: {
      type: String,
      enum: ["Easy", "Medium", "Hard"],
      default: "Medium",
    },
    timeMinutes: {
      type: Number,
      default: 15,
    },
    questions: [
      {
        id: { type: Number },
        type: { type: String, enum: ["mcq", "blank"], default: "mcq" },
        question: { type: String, required: true },
        imageUrl: { type: String, default: "" },
        imagePublicId: { type: String, default: "" },
        options: [{ type: String }],
        correctAnswer: { type: String, required: true },
        explanation: { type: String, default: "" },
        hint: { type: String, default: "" },
      },
    ],
    isPublished: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CustomQuiz", customQuizSchema);
