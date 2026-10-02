const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const User = require("../models/User");
const SupportTicket = require("../models/SupportTicket");
const {
  broadcastNewTicket,
  broadcastTicketMessage,
  broadcastTicketStatusUpdate,
  broadcastTicketDeleted,
} = require("../utils/supportSocket");

/* ============================================================
 * 🛡️ DEVELOPER / ADMIN MIDDLEWARE FOR CMS SUPPORT CONTROL
 * ============================================================ */
const requireDeveloper = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || user.email !== "dev@studyvault.com" || user.isDeveloper !== true) {
      return res.status(403).json({
        success: false,
        message: "Access Denied: Master Developer authority required for CMS Support Control.",
      });
    }
    req.developerUser = user;
    next();
  } catch (err) {
    console.error("CMS Support Auth Error:", err);
    res.status(500).json({ success: false, message: "Server error verifying developer role." });
  }
};

/* ============================================================
 * 🎫 1. CREATE SUPPORT TICKET (USER)
 * POST /api/support/tickets
 * ============================================================ */
router.post("/tickets", auth, async (req, res) => {
  try {
    const { subject, category, priority = "medium", description, attachments = [] } = req.body;

    if (!subject || !subject.trim() || !description || !description.trim()) {
      return res.status(400).json({
        success: false,
        message: "Subject and detailed description are required.",
      });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const ticketId = await SupportTicket.generateTicketId();

    const ticket = await SupportTicket.create({
      ticketId,
      userId: req.userId,
      subject: subject.trim(),
      category: category || "other",
      priority: ["low", "medium", "high", "urgent"].includes(priority) ? priority : "medium",
      status: "open",
      description: description.trim(),
      attachments: Array.isArray(attachments) ? attachments : [],
      messages: [
        {
          sender: req.userId,
          senderName: user.username,
          role: "user",
          message: description.trim(),
          createdAt: new Date(),
        },
      ],
    });

    // Broadcast new ticket to developer CMS queue in real-time
    const populatedTicket = await SupportTicket.findById(ticket._id).populate("userId", "username email");
    broadcastNewTicket(populatedTicket || ticket);

    res.status(201).json({
      success: true,
      message: `Support ticket ${ticketId} created successfully.`,
      ticket: populatedTicket || ticket,
    });
  } catch (err) {
    console.error("Create Support Ticket Error:", err);
    res.status(500).json({ success: false, message: "Failed to create support ticket." });
  }
});

/* ============================================================
 * 📋 2. GET CURRENT USER'S TICKETS
 * GET /api/support/tickets
 * ============================================================ */
router.get("/tickets", auth, async (req, res) => {
  try {
    const tickets = await SupportTicket.find({ userId: req.userId })
      .populate("userId", "username email")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      tickets,
    });
  } catch (err) {
    console.error("Fetch User Support Tickets Error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch support tickets." });
  }
});

/* ============================================================
 * 🔍 3. GET SINGLE TICKET DETAILS
 * GET /api/support/tickets/:id
 * ============================================================ */
router.get("/tickets/:id", auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const isDev = user && user.email === "dev@studyvault.com" && user.isDeveloper === true;

    const query = isDev ? { _id: req.params.id } : { _id: req.params.id, userId: req.userId };
    const ticket = await SupportTicket.findOne(query).populate("userId", "username email walletBalance");

    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found or access denied." });
    }

    res.json({
      success: true,
      ticket,
    });
  } catch (err) {
    console.error("Fetch Ticket Details Error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch ticket details." });
  }
});

/* ============================================================
 * 💬 4. USER REPLY TO TICKET
 * POST /api/support/tickets/:id/reply
 * ============================================================ */
router.post("/tickets/:id/reply", auth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: "Reply message cannot be empty." });
    }

    const user = await User.findById(req.userId);
    const ticket = await SupportTicket.findOne({ _id: req.params.id, userId: req.userId });

    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found or unauthorized." });
    }

    if (ticket.status === "closed") {
      return res.status(400).json({ success: false, message: "This ticket is closed. Please create a new ticket." });
    }

    const newMessage = {
      sender: req.userId,
      senderName: user.username,
      role: "user",
      message: message.trim(),
      createdAt: new Date(),
    };

    ticket.messages.push(newMessage);

    // If ticket was resolved, reopen it since user responded
    if (ticket.status === "resolved") {
      ticket.status = "open";
    }

    await ticket.save();

    const populatedTicket = await SupportTicket.findById(ticket._id).populate("userId", "username email");
    
    // Broadcast message to live conversation room and admin queue
    broadcastTicketMessage(ticket._id.toString(), newMessage, populatedTicket || ticket);

    res.json({
      success: true,
      message: "Reply sent successfully.",
      ticket: populatedTicket || ticket,
    });
  } catch (err) {
    console.error("User Ticket Reply Error:", err);
    res.status(500).json({ success: false, message: "Failed to send reply." });
  }
});

/* ============================================================
 * 🔒 5. USER CLOSE TICKET
 * PATCH /api/support/tickets/:id/close
 * ============================================================ */
router.patch("/tickets/:id/close", auth, async (req, res) => {
  try {
    const ticket = await SupportTicket.findOne({ _id: req.params.id, userId: req.userId });

    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found or unauthorized." });
    }

    ticket.status = "closed";
    ticket.resolvedAt = new Date();
    await ticket.save();

    const populatedTicket = await SupportTicket.findById(ticket._id).populate("userId", "username email");
    broadcastTicketStatusUpdate(ticket._id.toString(), { status: "closed" }, populatedTicket || ticket);

    res.json({
      success: true,
      message: `Ticket ${ticket.ticketId} marked as closed.`,
      ticket: populatedTicket || ticket,
    });
  } catch (err) {
    console.error("Close Ticket Error:", err);
    res.status(500).json({ success: false, message: "Failed to close ticket." });
  }
});

/* ============================================================
 * 👑 CMS DEVELOPER / ADMIN SUPPORT MANAGEMENT
 * ============================================================ */

/* ============================================================
 * 📊 6. ADMIN SUPPORT STATS
 * GET /api/support/admin/stats
 * ============================================================ */
router.get("/admin/stats", auth, requireDeveloper, async (req, res) => {
  try {
    const [total, open, inProgress, resolved, closed, urgent] = await Promise.all([
      SupportTicket.countDocuments(),
      SupportTicket.countDocuments({ status: "open" }),
      SupportTicket.countDocuments({ status: "in_progress" }),
      SupportTicket.countDocuments({ status: "resolved" }),
      SupportTicket.countDocuments({ status: "closed" }),
      SupportTicket.countDocuments({ priority: "urgent", status: { $in: ["open", "in_progress"] } }),
    ]);

    res.json({
      success: true,
      stats: {
        total,
        open,
        inProgress,
        resolved,
        closed,
        urgent,
      },
    });
  } catch (err) {
    console.error("Admin Support Stats Error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch support statistics." });
  }
});

/* ============================================================
 * 📑 7. ADMIN GET ALL TICKETS WITH FILTERS
 * GET /api/support/admin/tickets
 * ============================================================ */
router.get("/admin/tickets", auth, requireDeveloper, async (req, res) => {
  try {
    const { status, category, priority, search } = req.query;

    const query = {};
    if (status && status !== "ALL") {
      query.status = status.toLowerCase();
    }
    if (category && category !== "ALL") {
      query.category = category.toLowerCase();
    }
    if (priority && priority !== "ALL") {
      query.priority = priority.toLowerCase();
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [
        { ticketId: searchRegex },
        { subject: searchRegex },
        { description: searchRegex },
      ];
    }

    const tickets = await SupportTicket.find(query)
      .populate("userId", "username email walletBalance")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      tickets,
    });
  } catch (err) {
    console.error("Admin Fetch All Tickets Error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch tickets list." });
  }
});

/* ============================================================
 * ✏️ 8. ADMIN UPDATE TICKET STATUS / PRIORITY / NOTES
 * PATCH /api/support/admin/tickets/:id
 * ============================================================ */
router.patch("/admin/tickets/:id", auth, requireDeveloper, async (req, res) => {
  try {
    const { status, priority, resolutionNotes } = req.body;

    const ticket = await SupportTicket.findById(req.params.id).populate("userId", "username email");
    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found." });
    }

    if (status) {
      ticket.status = status;
      if (status === "resolved" || status === "closed") {
        ticket.resolvedAt = new Date();
      }
    }

    if (priority) {
      ticket.priority = priority;
    }

    if (resolutionNotes !== undefined) {
      ticket.resolutionNotes = resolutionNotes;
    }

    await ticket.save();

    broadcastTicketStatusUpdate(ticket._id.toString(), { status: ticket.status, resolutionNotes: ticket.resolutionNotes }, ticket);

    res.json({
      success: true,
      message: `Ticket ${ticket.ticketId} updated successfully.`,
      ticket,
    });
  } catch (err) {
    console.error("Admin Update Ticket Error:", err);
    res.status(500).json({ success: false, message: "Failed to update ticket." });
  }
});

/* ============================================================
 * 💬 9. ADMIN REPLY TO TICKET
 * POST /api/support/admin/tickets/:id/reply
 * ============================================================ */
router.post("/admin/tickets/:id/reply", auth, requireDeveloper, async (req, res) => {
  try {
    const { message, newStatus } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: "Reply message cannot be empty." });
    }

    const ticket = await SupportTicket.findById(req.params.id).populate("userId", "username email");
    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found." });
    }

    const newStaffMessage = {
      sender: req.userId,
      senderName: "StudyVault Support Staff",
      role: "admin",
      message: message.trim(),
      createdAt: new Date(),
    };

    ticket.messages.push(newStaffMessage);

    if (newStatus && ["open", "in_progress", "resolved", "closed"].includes(newStatus)) {
      ticket.status = newStatus;
      if (newStatus === "resolved" || newStatus === "closed") {
        ticket.resolvedAt = new Date();
      }
    } else if (ticket.status === "open") {
      ticket.status = "in_progress";
    }

    await ticket.save();

    // Broadcast staff reply to student's live chat window in real-time
    broadcastTicketMessage(ticket._id.toString(), newStaffMessage, ticket);
    broadcastTicketStatusUpdate(ticket._id.toString(), { status: ticket.status }, ticket);

    res.json({
      success: true,
      message: "Staff reply posted successfully.",
      ticket,
    });
  } catch (err) {
    console.error("Admin Ticket Reply Error:", err);
    res.status(500).json({ success: false, message: "Failed to post staff reply." });
  }
});

/* ============================================================
 * 🗑️ 10. ADMIN DELETE TICKET
 * DELETE /api/support/admin/tickets/:id
 * ============================================================ */
router.delete("/admin/tickets/:id", auth, requireDeveloper, async (req, res) => {
  try {
    const ticket = await SupportTicket.findByIdAndDelete(req.params.id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found." });
    }

    broadcastTicketDeleted(req.params.id);

    res.json({
      success: true,
      message: `Ticket ${ticket.ticketId} deleted from records.`,
    });
  } catch (err) {
    console.error("Admin Delete Ticket Error:", err);
    res.status(500).json({ success: false, message: "Failed to delete ticket." });
  }
});

module.exports = router;
