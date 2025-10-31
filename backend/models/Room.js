const mongoose = require("mongoose");

const RoomSchema = new mongoose.Schema({
  name: { type: String, unique: true },
  password: { type: String },
  creatorName: { type: String },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date }
});

module.exports = mongoose.model("Room", RoomSchema);
