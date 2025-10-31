# 🌐 DropyFYL — Real-Time File & Chat Collaboration Platform

### 🚀 Share files, chat instantly, and collaborate securely — all within temporary encrypted rooms.

![Node.js](https://img.shields.io/badge/Node.js-18.x-green?logo=node.js)
![MongoDB](https://img.shields.io/badge/MongoDB-NoSQL-brightgreen?logo=mongodb)
![AWS-S3](https://img.shields.io/badge/AWS%20S3-Cloud%20Storage-orange?logo=amazonaws)
![Socket.io](https://img.shields.io/badge/Socket.io-Real--time%20communication-black?logo=socket.io)
![License](https://img.shields.io/badge/License-MIT-blue.svg)

---

## 🧩 Overview

**DropyFYL** is a **real-time, secure collaboration system** that allows users to create or join temporary rooms, exchange files, and chat live.  
Each room automatically expires after 24 hours — ensuring **privacy, simplicity, and instant collaboration**.

Built with **Node.js**, **Socket.IO**, **MongoDB**, and **AWS S3**, this project demonstrates an advanced multi-user synchronization model with real-time updates, cloud storage integration, and auto-expiry logic.

---

## ✨ Features

### 🗂 Room Management
- Create password-protected collaboration rooms.  
- Auto-expiry after 24 hours to ensure security.  
- The creator can remove participants or delete rooms.

### 💬 Real-time Chat
- Instant messaging powered by **Socket.IO**.  
- “User typing” indicators and live participant updates.  
- Persistent message storage using **MongoDB**.

### 📁 File Sharing
- Upload files directly to **AWS S3** with `multer-s3`.  
- Automatic room-wide broadcast when new files are uploaded.  
- Secure pre-signed URLs for download.  
- Deletion syncs across all clients.

### 👥 User Handling
- Users join with a custom username.  
- Creator control to remove users dynamically.  
- Real-time user list updates across all clients.

### 🧹 Automatic Cleanup
- Cron-style cleanup runs every minute to delete expired rooms and associated data (messages, files, users).  
- Ensures optimal storage hygiene.

---

## 🏗️ Tech Stack

| Category | Technology |
|-----------|-------------|
| **Backend Framework** | Node.js (Express.js) |
| **Database** | MongoDB (via Mongoose) |
| **Real-time Engine** | Socket.IO |
| **File Storage** | AWS S3 |
| **Authentication** | bcrypt.js (for room passwords) |
| **Environment Management** | dotenv |
| **File Upload Handling** | multer, multer-s3 |
| **Hosting Ready** | Easily deployable to Render / AWS EC2 / Railway / Vercel backend |

---

## 🧠 Project Architecture


- **Real-time Layer:** Socket.IO handles chat & live updates.  
- **Storage Layer:** MongoDB for persistent data, AWS S3 for files.  
- **Logic Layer:** Express.js routes + scheduled cleanup maintain synchronization.

---

## ⚙️ Installation & Setup
Client (Browser)
↓
Socket.IO / REST API (Express.js)
↓
MongoDB (Data)
AWS S3 (File Storage)

### 1️⃣ Clone the Repository
```bash
git clone https://github.com/Prashanth-000/DropyFYL.git

PORT=5000
MONGO_URL=your_mongodb_connection_string
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_REGION=your_aws_region
S3_BUCKET_NAME=your_bucket_name

npm start
```
open frontend in 2 separate browser tabs to test real-time features.


made with ❤️ by P-000
