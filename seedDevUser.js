// seedDevUser.js
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/student-study-vault";

async function seedDevUser() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB:", MONGO_URI);

    const devEmail = "dev@studyvault.com";
    const devUsername = "developer";
    const devPassword = "Password@123";

    const hashedPassword = await bcrypt.hash(devPassword, 10);

    let user = await User.findOne({
      $or: [{ email: devEmail }, { username: devUsername }],
    });

    if (user) {
      user.username = devUsername;
      user.email = devEmail;
      user.password = hashedPassword;
      user.isDeveloper = true;
      user.walletBalance = Math.max(user.walletBalance || 0, 5000); // 5000 wallet credits for testing
      await user.save();
      console.log("✅ Updated existing developer credentials successfully!");
    } else {
      user = await User.create({
        username: devUsername,
        email: devEmail,
        password: hashedPassword,
        isDeveloper: true,
        walletBalance: 5000,
        purchasedNotes: [],
        purchasedBooks: [],
      });
      console.log("✅ Created new developer credentials successfully!");
    }

    console.log("==========================================");
    console.log("   DEVELOPER LOGIN CREDENTIALS");
    console.log("==========================================");
    console.log("Email:       " + devEmail);
    console.log("Username:    " + devUsername);
    console.log("Password:    " + devPassword);
    console.log("Wallet:      ₹" + user.walletBalance);
    console.log("Developer:   " + user.isDeveloper);
    console.log("==========================================");

    process.exit(0);
  } catch (err) {
    console.error("❌ Failed to seed dev user:", err);
    process.exit(1);
  }
}

seedDevUser();
