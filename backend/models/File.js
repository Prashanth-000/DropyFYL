const mongoose = require("mongoose");

const FileSchema = new mongoose.Schema({
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
  uploadedBy: { type: String, required: true },
  originalName: { type: String, required: true },
  storedName: { type: String, required: true },
  fileUrl: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("File", FileSchema);
