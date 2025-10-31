require('dotenv').config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const AWS = require("aws-sdk");
const multerS3 = require("multer-s3");

const Room = require("./models/Room");
const User = require("./models/User");
const Message = require("./models/Message");
const File = require("./models/File");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

mongoose.connect(process.env.MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("MongoDB connected"))
.catch(err => console.log("MongoDB connection error:", err));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "_" + file.originalname)
});
const upload = multer({ storage });

const onlineUsers = {};

app.post("/api/rooms", async (req, res) => {
  try {
    const { name, password, creatorName } = req.body;
    if (!name || !password || !creatorName) return res.status(400).send("Missing fields");

    const existing = await Room.findOne({ name });
    if (existing) return res.status(409).send("Room name already exists");

    const hashedPassword = await bcrypt.hash(password, 10);
    const room = new Room({
      name,
      password: hashedPassword,
      creatorName,
      expiresAt: new Date(Date.now() + 24*60*60*1000)
    });
    await room.save();
    res.json({ roomId: room._id, expiresAt: room.expiresAt });
  } catch (err) {
    console.error("Error creating room:", err);
    res.status(500).send("Failed to create room");
  }
});

app.post("/api/rooms/join", async (req, res) => {
  try {
    const { name, password, username } = req.body;
    const room = await Room.findOne({ name });
    if (!room) return res.status(404).send("Room not found");

    const valid = await bcrypt.compare(password, room.password);
    if (!valid) return res.status(401).send("Invalid password");

    const user = new User({ username, roomId: room._id, isCreator: false });
    await user.save();
    res.json({ roomId: room._id, expiresAt: room.expiresAt });
  } catch (err) {
    console.error("Error joining room:", err);
    res.status(500).send("Failed to join room");
  }
});

app.get("/api/rooms/:roomId", async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId);
    if (!room) return res.status(404).send("Room not found");
    res.json({ roomId: room._id, name: room.name, creatorName: room.creatorName, expiresAt: room.expiresAt });
  } catch (err) {
    console.error("Error fetching room:", err);
    res.status(500).send("Failed to fetch room");
  }
});

app.get('/api/users/:username/rooms', async (req, res) => {
  try {
    const username = req.params.username;
    const created = await Room.find({ creatorName: username }).select('name createdAt expiresAt');
    const participations = await User.find({ username }).select('roomId');
    const participantRoomIds = participations.map(p => p.roomId).filter(Boolean);
    const participantRooms = await Room.find({ _id: { $in: participantRoomIds } }).select('name createdAt expiresAt');
    res.json({ created, participantRooms });
  } catch (err) {
    console.error('Error fetching user rooms', err);
    res.status(500).send('Failed to fetch user rooms');
  }
});

app.delete('/api/rooms/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { username } = req.body || {};
    const room = await Room.findById(roomId);
    if (!room) return res.status(404).send('Room not found');
    if (room.creatorName && username && room.creatorName !== username) return res.status(403).send('Only creator can delete room');

    await Message.deleteMany({ roomId: room._id });
    const files = await File.find({ roomId: room._id });
    for (const f of files) {
      const p = path.join(__dirname, 'uploads', f.storedName);
      try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch(e){ console.warn('unlink failed', p, e.message); }
    }
    await File.deleteMany({ roomId: room._id });
    await User.deleteMany({ roomId: room._id });
    await Room.deleteOne({ _id: room._id });
    delete onlineUsers[room._id];
    io.to(roomId).emit('roomDeleted');
    res.sendStatus(200);
  } catch (err) {
    console.error('Error deleting room', err);
    res.status(500).send('Failed to delete room');
  }
});

app.post('/api/rooms/:roomId/remove', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { username: requester, usernameToRemove } = req.body;
    console.log(`[REMOVE] ${new Date().toISOString()} request`, { roomId, requester, usernameToRemove, body: req.body, ip: req.ip });
    if (!requester || !usernameToRemove) {
      console.warn('[REMOVE] Missing fields', { roomId, requester, usernameToRemove });
      return res.status(400).send('Missing fields');
    }
    const room = await Room.findById(roomId);
    if (!room) {
      console.warn('[REMOVE] Room not found', { roomId });
      return res.status(404).send('Room not found');
    }
    if (room.creatorName !== requester) {
      console.warn('[REMOVE] Unauthorized requester', { roomId, requester, creatorName: room.creatorName });
      return res.status(403).send('Only creator can remove participants');
    }

    const user = onlineUsers[roomId]?.find(u => u.username === usernameToRemove);
    if (user) {
      try { io.to(user.socketId).emit('removed'); } catch(e){}
      onlineUsers[roomId] = onlineUsers[roomId].filter(u => u.username !== usernameToRemove);
    }
    await User.deleteMany({ username: usernameToRemove, roomId });
    res.sendStatus(200);
  } catch (err) {
    console.error('Error removing participant', err);
    res.status(500).send('Failed to remove participant');
  }
});

app.post("/api/rooms/:roomId/files", upload.single("file"), async (req, res) => {
  try {
    const { roomId } = req.params;
    const { username } = req.body;
    if (!req.file) return res.status(400).send("No file uploaded");
    const file = new File({
      roomId,
      uploadedBy: username,
      originalName: req.file.originalname,
      storedName: req.file.filename
    });
    await file.save();
    console.log('[FILE SAVED]', { _id: file._id, roomId: file.roomId, originalName: file.originalName, uploadedBy: file.uploadedBy });
    io.to(roomId).emit("newFile", file);
    res.json(file);
  } catch (err) {
    console.error("File upload error:", err);
    res.status(500).send("File upload failed");
  }
});

app.get('/api/rooms/:roomId/files', async (req, res) => {
  try {
    const { roomId } = req.params;
    const files = await File.find({ roomId }).sort({ uploadedAt: 1 });
    console.log('[FILES LIST]', { roomId, count: files.length });
    res.json(files);
  } catch (err) {
    console.error('Error listing files for room', err);
    res.status(500).send('Failed to list files');
  }
});

app.get('/api/rooms/:roomId/messages', async (req, res) => {
  try {
    const { roomId } = req.params;
    const limit = Math.min(parseInt(req.query.limit || '30', 10), 100);
    const before = req.query.before;
    let messages;
    if (before) {
      messages = await Message.find({ roomId, timestamp: { $lt: new Date(before) } }).sort({ timestamp: -1 }).limit(limit);
      messages = messages.reverse();
    } else {
      messages = await Message.find({ roomId }).sort({ timestamp: -1 }).limit(limit);
      messages = messages.reverse();
    }
    console.log('[MESSAGES LIST]', { roomId, count: messages.length, before });
    res.json(messages);
  } catch (err) {
    console.error('Error listing messages for room', err);
    res.status(500).send('Failed to list messages');
  }
});

app.get("/api/rooms/:roomId/files/:fileId/download", async (req, res) => {
  const { fileId } = req.params;
  const file = await File.findById(fileId);
  if (!file) return res.status(404).send("File not found");
  res.download(path.join(__dirname, "uploads", file.storedName), file.originalName);
});

app.delete('/api/rooms/:roomId/files/:fileId', async (req, res) => {
  try {
    const { roomId, fileId } = req.params;
    const file = await File.findById(fileId);
    if (!file) return res.status(404).send('File not found');
    const p = path.join(__dirname, 'uploads', file.storedName);
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch(e){ console.warn('unlink failed', p, e.message); }
    await File.deleteOne({ _id: fileId });
    io.to(roomId).emit('fileDeleted', { fileId });
    res.sendStatus(200);
  } catch (err) {
    console.error('Error deleting file', err);
    res.status(500).send('Failed to delete file');
  }
});

io.on("connection", socket => {
  socket.on("joinRoom", ({ roomId, username, isCreator }) => {
    socket.join(roomId);
    if (!onlineUsers[roomId]) onlineUsers[roomId] = [];
    onlineUsers[roomId].push({ socketId: socket.id, username, isCreator });

    io.to(roomId).emit("updateUsers", onlineUsers[roomId].map(u => u.username));
    io.to(roomId).emit("userJoined", username);
  });

  socket.on("userTyping", ({ roomId, username }) => {
    socket.to(roomId).emit("userTyping", username);
  });

  socket.on("stopTyping", ({ roomId, username }) => {
    socket.to(roomId).emit("userStopTyping", username);
  });

  socket.on("shareFile", (fileData) => {
    if (!fileData || !fileData.roomId) return;
    io.to(fileData.roomId).emit("newFile", fileData);
  });

  socket.on("sendMessage", async ({ roomId, username, text, tempId }) => {
    try {
      const msg = new Message({ roomId, username, text });
      await msg.save();
      const out = msg.toObject ? msg.toObject() : msg;
      if (tempId) out.tempId = tempId;
      console.log('[MSG SAVED]', { _id: out._id, roomId: out.roomId, username: out.username, tempId: out.tempId });
      io.to(roomId).emit("receiveMessage", out);
    } catch (err) {
      console.error('Error saving message', err);
    }
  });

  socket.on("removeUser", ({ roomId, usernameToRemove }) => {
    const emitter = onlineUsers[roomId]?.find(u => u.socketId === socket.id);
    if (!emitter || !emitter.isCreator) {
      socket.emit('error', 'Only creator can remove participants');
      return;
    }
    const user = onlineUsers[roomId]?.find(u => u.username === usernameToRemove);
    if (user) {
      io.to(user.socketId).emit("removed");
      onlineUsers[roomId] = onlineUsers[roomId].filter(u => u.username !== usernameToRemove);
      if (onlineUsers[roomId] && onlineUsers[roomId].length > 0) io.to(roomId).emit("updateUsers", onlineUsers[roomId].map(u => u.username));
      else delete onlineUsers[roomId];
    }
  });

  socket.on("disconnect", () => {
    for (let rId in onlineUsers) {
      onlineUsers[rId] = onlineUsers[rId].filter(u => u.socketId !== socket.id);
      if (onlineUsers[rId].length === 0) delete onlineUsers[rId];
      else io.to(rId).emit("updateUsers", onlineUsers[rId].map(u => u.username));
    }
  });
});

setInterval(async () => {
  const now = new Date();
  const expiredRooms = await Room.find({ expiresAt: { $lte: now } });
  for (const room of expiredRooms) {
    await Message.deleteMany({ roomId: room._id });
    const files = await File.find({ roomId: room._id });
    for (const f of files) fs.unlinkSync(path.join(__dirname, "uploads", f.storedName));
    await File.deleteMany({ roomId: room._id });
    await User.deleteMany({ roomId: room._id });
    await Room.deleteOne({ _id: room._id });
    delete onlineUsers[room._id];
  }
}, 60*1000);

setInterval(async () => {
  const now = new Date();
  const expiredRooms = await Room.find({ expiresAt: { $lte: now } });
  for (const room of expiredRooms) {
    try {
      await Message.deleteMany({ roomId: room._id });
      const files = await File.find({ roomId: room._id });
      for (const f of files) {
        const p = path.join(__dirname, "uploads", f.storedName);
        try {
          if (fs.existsSync(p)) fs.unlinkSync(p);
        } catch (e) {
          console.warn("Failed to unlink file", p, e.message);
        }
      }
      await File.deleteMany({ roomId: room._id });
      await User.deleteMany({ roomId: room._id });
      await Room.deleteOne({ _id: room._id });
      delete onlineUsers[room._id];
    } catch (err) {
      console.error("Error cleaning expired room", room._id, err);
    }
  }
}, 60*1000);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
