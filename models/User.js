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
  purchasedBooks: [
  {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ReferenceBook",
  },
],
  walletBalance:{
    type:Number,
    default:0,

  },
  isDeveloper: {
  type: Boolean,
  default: false
}

});

module.exports = mongoose.model("User", UserSchema);
