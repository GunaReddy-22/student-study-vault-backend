const mongoose = require("mongoose");

const FreeStudyResourceSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },
    examId: {
      type: String,
      required: [true, "Exam ID is required"],
      trim: true,
      default: "general",
    },
    subject: {
      type: String,
      required: [true, "Subject name is required"],
      trim: true,
    },
    subjectIcon: {
      type: String,
      default: "📚",
    },
    subjectWeightage: {
      type: String,
      default: "High Importance",
    },
    chapterNo: {
      type: Number,
      default: 1,
    },
    chapterTitle: {
      type: String,
      trim: true,
    },
    importance: {
      type: String,
      enum: ["High Yield", "Essential", "Foundation"],
      default: "High Yield",
    },
    whatToStudy: {
      type: String,
      default: "",
    },
    keyConcepts: {
      type: [String],
      default: [],
    },
    pyqFocus: {
      type: String,
      default: "",
    },
    freeVideoUrl: {
      type: String,
      default: "",
    },
    freeVideoChannel: {
      type: String,
      default: "YouTube Open Course",
    },
    freeBookName: {
      type: String,
      default: "",
    },
    freeBookUrl: {
      type: String,
      default: "",
    },
    freeBookType: {
      type: String,
      default: "100% Free Public Resource",
    },
    officialPortalUrl: {
      type: String,
      default: "",
    },
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

module.exports = mongoose.model("FreeStudyResource", FreeStudyResourceSchema);
