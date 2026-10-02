const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  senderName: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ["user", "admin"],
    default: "user",
  },
  message: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const SupportTicketSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ["billing", "content", "technical", "quiz", "other"],
      default: "other",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "closed"],
      default: "open",
      index: true,
    },
    description: {
      type: String,
      required: true,
    },
    attachments: [
      {
        type: String,
      },
    ],
    messages: [MessageSchema],
    resolutionNotes: {
      type: String,
      default: "",
    },
    resolvedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Helper to generate ticket ID
SupportTicketSchema.statics.generateTicketId = async function () {
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  const ticketId = `SV-${randomSuffix}`;
  const exists = await this.findOne({ ticketId });
  if (exists) {
    return this.generateTicketId();
  }
  return ticketId;
};

module.exports = mongoose.model("SupportTicket", SupportTicketSchema);
