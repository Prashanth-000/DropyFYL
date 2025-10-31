const mongoose = require("mongoose");

const FileSchema = new mongoose.Schema({
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room" },
  uploadedBy: String,
  originalName: String,
  storedName: String,
  uploadedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("File", FileSchema);
