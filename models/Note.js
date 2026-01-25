const mongoose = require("mongoose");

const noteSchema = new mongoose.Schema(
  {
    subject: {
      type: String,
      required: true,
    },

    title: {
      type: String,
      required: true,
    },

    content: {
      type: String,
      required: true,
    },

    // 👤 Owner
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

  

    // 🌍 VISIBILITY
    isPublic: {
      type: Boolean,
      default: false,
    },

    // 💰 PREMIUM
    isPremium: {
      type: Boolean,
      default: false,
    },

    price: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: function (value) {
          if (this.isPremium) {
            return value > 0;
          }
          return true;
        },
        message: "Premium notes must have a price greater than 0",
      },
    },
    likes: [
  {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default:[],
  },
],

comments: [
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
],

  },
  { timestamps: true }
);

module.exports = mongoose.model("Note", noteSchema);
