const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const User = require("../models/User");
const SibApiV3Sdk = require('sib-api-v3-sdk');

const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();




const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;



/* ======================
   EMAIL CONFIG
====================== */
/*const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});*/



/*const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,        // 587 = false
  requireTLS: true,     // 🔥 VERY IMPORTANT
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});*/
transporter.verify((error, success) => {
  if (error) {
    console.error("SMTP Error:", error);
  } else {
    console.log("SMTP Server is ready");
  }
});

/* ======================
   REGISTER
====================== */
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: "All fields required" });
    }

    const existingUser = await User.findOne({
      $or: [{ username }, { email }],
    });

    if (existingUser) {
      return res.status(409).json({
        message: "Username or Email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await User.create({
      username,
      email,
      password: hashedPassword,
    });

    res.status(201).json({
      message: "User registered successfully",
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Registration failed" });
  }
});

/* ======================
   LOGIN (EMAIL BASED)
====================== */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password required",
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    const token = jwt.sign(
      {
        userId: user._id,
        isDeveloper: user.isDeveloper === true,
      },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(200).json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Login failed" });
  }
});

/* ======================
   FORGOT PASSWORD
====================== */
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    user.resetOTP = otp;
    user.resetOTPExpire = Date.now() + 5 * 60 * 1000;
    await user.save();

   await apiInstance.sendTransacEmail({
  sender: { email: "studyvault.otp@gmail.com", name: "Student Study Vault" },
  to: [{ email: email }],
  subject: "Password Reset OTP",
  htmlContent: `
    <div style="font-family:sans-serif;">
      <h2>Password Reset</h2>
      <p>Your OTP is:</p>
      <h1 style="letter-spacing:4px;">${otp}</h1>
      <p>This OTP expires in 5 minutes.</p>
    </div>
  `,
});

    res.json({ message: "OTP sent successfully" });

  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ message: "Failed to send OTP" });
  }
});

/* ======================
   VERIFY OTP
====================== */
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });

    if (
      !user ||
      user.resetOTP !== otp ||
      user.resetOTPExpire < Date.now()
    ) {
      return res.status(400).json({
        message: "Invalid or expired OTP",
      });
    }

    // 🔥 Mark OTP as verified
    user.resetOTP = "VERIFIED";
    await user.save();

    res.json({ message: "OTP verified" });
  } catch (err) {
    res.status(500).json({ message: "OTP verification failed" });
  }
});

/* ======================
   RESET PASSWORD
====================== */
/* ======================
   RESET PASSWORD
====================== */
router.post("/reset-password", async (req, res) => {
  try {
    const { email, password } = req.body; // 🔥 changed

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and new password required",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (user.resetOTP !== "VERIFIED"){
      return res.status(400).json({
        message: "OTP expired. Please try again.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    user.password = hashedPassword;
    user.resetOTP = undefined;
    user.resetOTPExpire = undefined;

    await user.save();

    res.json({ message: "Password reset successful" });
  } catch (err) {
    console.error("Reset error:", err);
    res.status(500).json({ message: "Reset failed" });
  }
});

module.exports = router;