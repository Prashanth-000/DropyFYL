const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  username: String,
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room" },
  isCreator: Boolean,
  joinedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("User", UserSchema);
