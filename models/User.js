const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  purchasedNotes: [
  {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Note",
  },
],

});

module.exports = mongoose.model("User", UserSchema);
