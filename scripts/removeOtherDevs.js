const mongoose = require("mongoose");
require("dotenv").config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/student-study-vault";

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    const User = require("../models/User");

    const before = await User.find({ isDeveloper: true });
    console.log("=== USERS BEFORE CLEANUP WITH isDeveloper: true ===");
    before.forEach((u) => console.log(`• ${u.username} (${u.email}) [ID: ${u._id}]`));

    // Strip developer access from every account except dev@studyvault.com
    const result = await User.updateMany(
      { email: { $ne: "dev@studyvault.com" }, isDeveloper: true },
      { $set: { isDeveloper: false } }
    );
    console.log(`\nDemoted ${result.modifiedCount} account(s) to regular student status.`);

    // Guarantee dev@studyvault.com is developer
    const master = await User.findOneAndUpdate(
      { email: "dev@studyvault.com" },
      { $set: { isDeveloper: true } },
      { new: true }
    );
    if (master) {
      console.log(`Verified master dev: ${master.username} (${master.email}) isDeveloper=${master.isDeveloper}`);
    } else {
      console.log("dev@studyvault.com not found! Need to seed it.");
    }

    const after = await User.find({ isDeveloper: true });
    console.log("\n=== USERS AFTER CLEANUP WITH isDeveloper: true ===");
    after.forEach((u) => console.log(`• ${u.username} (${u.email}) [ID: ${u._id}]`));

    await mongoose.disconnect();
    console.log("\nDone!");
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
