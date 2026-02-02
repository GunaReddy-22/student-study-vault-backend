const mongoose = require("mongoose");

const ratingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    value: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
  },
  { _id: false }
);

const referenceBookSchema = new mongoose.Schema(
  {
    /* BASIC INFO */
    title: {
      type: String,
      required: true,
      trim: true,
    },

    author: {
      type: String,
      required: true,
      trim: true,
    },

    subject: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      required: true,
      maxlength: 2000,
    },

    /* MEDIA */
    pdfUrl: {
      type: String,
      required: true, // stored in cloud (S3 / Cloudinary later)
    },

    coverImage: {
      type: String, // optional thumbnail
    },

    /* PRICING */
    price: {
      type: Number,
      required: true,
      min: 0,
    },

    /* STATUS */
    isActive: {
      type: Boolean,
      default: true, // developer can disable book
    },

    /* SOCIAL */
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    ratings: [ratingSchema],

    purchases: {
      type: Number,
      default: 0,
    },
    pdfPublicId: {
  type: String,
  required: true,
},
  },
  { timestamps: true }
);

module.exports = mongoose.model("ReferenceBook", referenceBookSchema);