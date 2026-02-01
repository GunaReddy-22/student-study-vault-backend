const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const noteRoutes = require("./routes/noteRoutes");
const walletRoutes = require("./routes/walletRoutes");
const referenceBookRoutes = require("./routes/referenceBookRoutes");

const app = express();

/* ======================
   MIDDLEWARE
====================== */
app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));
app.use("/api/wallet",walletRoutes);
app.use("/api/reference-books", referenceBookRoutes);

/* ======================
   DATABASE CONNECTION
====================== */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

/* ======================
   ROUTES
====================== */
app.use("/api/auth", authRoutes);
app.use("/api/notes", noteRoutes);

/* ======================
   HEALTH CHECK
====================== */
app.get("/", (req, res) => {
  res.status(200).send("✅ Student Study Vault Backend Running");
});

/* ======================
   START SERVER
====================== */
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});