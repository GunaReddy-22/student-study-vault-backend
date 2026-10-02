const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const noteRoutes = require("./routes/noteRoutes");
const walletRoutes = require("./routes/walletRoutes");
const referenceBookRoutes = require("./routes/referenceBookRoutes");
const aiRoutes = require("./routes/aiRoutes");
const quizRoutes = require("./routes/quizRoutes");
const cmsRoutes = require("./routes/cmsRoutes");
const supportRoutes = require("./routes/supportRoutes");

const app = express();

/* ======================
   MIDDLEWARE
====================== */
app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));
app.use("/api/wallet", walletRoutes);
app.use("/api/reference-books", referenceBookRoutes);
app.use("/uploads", express.static("uploads"));
app.use("/api/ai", aiRoutes);
app.use("/api/quizzes", quizRoutes);
app.use("/api/cms", cmsRoutes);
app.use("/api/support", supportRoutes);

/* ======================
   DATABASE CONNECTION
====================== */
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/student-study-vault";

mongoose
  .connect(MONGO_URI)
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

const http = require("http");
const { initSupportSocket } = require("./utils/supportSocket");

const server = http.createServer(app);
initSupportSocket(server);

/* ======================
   START SERVER
====================== */
const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`🚀 Server running with WebSockets on port ${PORT}`);
});