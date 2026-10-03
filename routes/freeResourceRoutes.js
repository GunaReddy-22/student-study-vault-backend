const express = require("express");
const router = express.Router();
const FreeStudyResource = require("../models/FreeStudyResource");

/* ============================================================
 * 🌐 PUBLIC FREE STUDY RESOURCES API (STUDENT ACCESS)
 * GET /api/study-resources
 * ============================================================ */
router.get("/", async (req, res) => {
  try {
    const { examId, subject, search } = req.query;
    const filter = { isPublished: true };

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
      .sort({ examId: 1, subject: 1, chapterNo: 1, createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: resources.length,
      resources,
    });
  } catch (err) {
    console.error("Fetch Public Study Resources Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error fetching free study resources.",
      error: err.message,
    });
  }
});

/* ============================================================
 * GET /api/study-resources/:id
 * ============================================================ */
router.get("/:id", async (req, res) => {
  try {
    const resource = await FreeStudyResource.findById(req.params.id);
    if (!resource || !resource.isPublished) {
      return res.status(404).json({ success: false, message: "Study resource not found" });
    }
    res.status(200).json({ success: true, resource });
  } catch (err) {
    console.error("Fetch Study Resource by ID Error:", err);
    res.status(500).json({ success: false, message: "Error fetching resource details." });
  }
});

module.exports = router;
