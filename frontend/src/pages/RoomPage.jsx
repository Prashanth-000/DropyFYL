import React, { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import io from "socket.io-client";
import { BACKEND_URL } from "../config";
import axios from "axios";

const socket = io(BACKEND_URL, { transports: ["websocket"] });

export default function RoomPage() {
  const { roomId } = useParams();
  const [username, setUsername] = useState(
    localStorage.getItem("tempChatUser")
      ? JSON.parse(localStorage.getItem("tempChatUser")).username
      : ""
  );
  const [isCreator, setIsCreator] = useState(false);
  const [files, setFiles] = useState([]);
  const [file, setFile] = useState(null);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [roomName, setRoomName] = useState("");
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const messagesEndRef = useRef(null);
  const filesEndRef = useRef(null);
  const pendingTempIds = useRef(new Set());
  const chatWindowRef = useRef(null);

  const [darkMode, setDarkMode] = useState(
    localStorage.getItem("darkMode") === "true"
  );

  useEffect(() => {
    document.body.classList.toggle("dark-mode", darkMode);
    localStorage.setItem("darkMode", darkMode);
  }, [darkMode]);

  const scrollToMessagesEnd = () =>
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  const scrollToFilesEnd = () =>
    filesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  useEffect(() => {
    const currentUser =
      username ||
      (localStorage.getItem("tempChatUser")
        ? JSON.parse(localStorage.getItem("tempChatUser")).username
        : "");

    if (!currentUser) {
      alert("Username not found! Please rejoin with a username.");
      window.location.href = "/";
      return;
    }
    socket.emit("joinRoom", { roomId, username: currentUser });

    fetch(`${BACKEND_URL}/api/rooms/${roomId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.creatorName === currentUser) setIsCreator(true);
        setRoomName(data.name || `Room ${roomId}`);
      })
      .catch(() => {
        setRoomName(`Room ${roomId}`);
      });

    (async () => {
      try {
        const [msgRes, filesRes] = await Promise.all([
          fetch(`${BACKEND_URL}/api/rooms/${roomId}/messages?limit=30`),
          fetch(`${BACKEND_URL}/api/rooms/${roomId}/files`),
        ]);

        if (msgRes.ok) {
          const all = await msgRes.json();
          setMessages(all);
          setHasMoreHistory(all.length >= 30);
        }

        if (filesRes.ok) {
          const f = await filesRes.json();
          setFiles(f);
        }
      } catch (e) {
        console.warn("Failed to fetch persisted room data", e);
      }
    })();

    const handleReceiveMessage = (msg) => {
      if (msg.tempId && pendingTempIds.current.has(msg.tempId)) {
        pendingTempIds.current.delete(msg.tempId);
        setMessages((prev) =>
          prev.map((m) => (m.tempId === msg.tempId ? msg : m))
        );
      } else {
        setMessages((prev) => {
          if (prev.find((p) => p._id === msg._id)) return prev;
          return [...prev, msg];
        });
      }
      scrollToMessagesEnd();
    };

    const handleNewFile = (fileData) => {
      setFiles((prev) => {
        const fileExists = prev.some(f => f._id === fileData._id);
        if (fileExists) return prev;
        return [...prev, fileData];
      });
      scrollToFilesEnd();
    };

    const handleFileDeleted = ({ fileId }) => {
      setFiles((prev) => prev.filter((f) => f._id !== fileId));
    };

    const handleUpdateUsers = (userList) => {
      const uniqueUsers = [...new Set(userList)];
      setUsers(uniqueUsers);
    };

    const handleUserTyping = (typingUser) => {
      setTypingUsers((prev) =>
        prev.includes(typingUser) ? prev : [...prev, typingUser]
      );
    };

    const handleUserStopTyping = (stoppedUser) => {
      setTypingUsers((prev) => prev.filter((u) => u !== stoppedUser));
    };

    const handleRemoved = () => {
      alert("You were removed from the room");
      window.location.href = "/";
    };

    socket.on("receiveMessage", handleReceiveMessage);
    socket.on("newFile", handleNewFile);
    socket.on("fileDeleted", handleFileDeleted);
    socket.on("updateUsers", handleUpdateUsers);
    socket.on("userTyping", handleUserTyping);
    socket.on("userStopTyping", handleUserStopTyping);
    socket.on("removed", handleRemoved);

    const chatEl = chatWindowRef.current;
    const onScroll = async () => {
      if (!chatEl || !hasMoreHistory || messages.length === 0) return;
      if (chatEl.scrollTop < 120) {
        const first = messages[0];
        const before =
          first?.timestamp || first?.createdAt || new Date().toISOString();
        try {
          const res = await fetch(
            `${BACKEND_URL}/api/rooms/${roomId}/messages?limit=30&before=${encodeURIComponent(
              before
            )}`
          );
          if (res.ok) {
            const older = await res.json();
            if (older.length === 0) setHasMoreHistory(false);
            else setMessages((prev) => [...older, ...prev]);
          }
        } catch (e) {
          console.warn("Failed to load older messages", e);
        }
      }
    };
    chatEl?.addEventListener("scroll", onScroll);

    return () => {
      socket.off("receiveMessage", handleReceiveMessage);
      socket.off("newFile", handleNewFile);
      socket.off("fileDeleted", handleFileDeleted);
      socket.off("updateUsers", handleUpdateUsers);
      socket.off("userTyping", handleUserTyping);
      socket.off("userStopTyping", handleUserStopTyping);
      socket.off("removed", handleRemoved);
      chatEl?.removeEventListener("scroll", onScroll);
    };
  }, [roomId, username, hasMoreHistory]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    const tempId = `t_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const optimistic = { tempId, roomId, username, text };
    pendingTempIds.current.add(tempId);
    socket.emit("sendMessage", optimistic);
    setMessages((prev) => [...prev, optimistic]);
    setText("");
    socket.emit("stopTyping", { roomId, username });
    scrollToMessagesEnd();
  };

  const handleTyping = (e) => {
    const value = e.target.value;
    setText(value);
    socket.emit("userTyping", { roomId, username });
    if (value === "") socket.emit("stopTyping", { roomId, username });
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("username", username);

    try {
      const res = await axios.post(
        `${BACKEND_URL}/api/rooms/${roomId}/files`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      
      setFiles((prev) => {
        const fileExists = prev.some(f => f._id === res.data._id);
        if (fileExists) return prev;
        return [...prev, res.data];
      });

      socket.emit("shareFile", res.data);
      setFile(null);
      scrollToFilesEnd();
    } catch (err) {
      console.error(err);
      alert("File upload failed!");
    }
  };

  const deleteFile = async (fileId) => {
    try {
      await axios.delete(`${BACKEND_URL}/api/rooms/${roomId}/files/${fileId}`);
      setFiles((prev) => prev.filter((f) => f._id !== fileId));
    } catch (err) {
      console.error(err);
      alert("Failed to delete file");
    }
  };

  const removeUser = async (userToRemove) => {
    try {
      const currentUser =
        username ||
        (localStorage.getItem("tempChatUser")
          ? JSON.parse(localStorage.getItem("tempChatUser")).username
          : "");
      if (!currentUser) {
        alert("Your username is not set. Please set it before removing users.");
        return;
      }
      const res = await fetch(`${BACKEND_URL}/api/rooms/${roomId}/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: currentUser,
          usernameToRemove: userToRemove,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        alert("Failed to remove participant: " + text);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to remove participant");
    }
  };

  const leaveRoom = () => {
    const currentUser =
      username ||
      (localStorage.getItem("tempChatUser")
        ? JSON.parse(localStorage.getItem("tempChatUser")).username
        : "");
    if (!currentUser) {
      window.location.href = "/";
      return;
    }
    if (!confirm("Leave this room?")) return;
    try {
      socket.emit("leaveRoom", { roomId, username: currentUser });
    } catch (e) {
    }
    window.location.href = "/";
  };

  return (
    <div className="app-root">
      <div className="container">
        <div className="room-header">
          <button 
            onClick={() => window.location.href = '/'}
            className="back-button"
            aria-label="Go back"
          >
            ← Back
          </button>
          <h2 className="text-center room-title">
            {roomName}
          </h2>
          {!isCreator && (
            <button
              onClick={leaveRoom}
              className="btn btn-ghost exit-button"
              aria-label="Leave room"
              title="Leave room"
            >
              Exit
            </button>
          )}
        </div>

        <div className="room-wrap">
          <div className="users card">
            <h3>Users in Room:</h3>
            <ul>
              {users.map((u, i) => {
                const isCurrentUser = u === username;
                return (
                  <li key={u} className="user-item">
                    <div className="user-info">
                      <span>{u}</span>
                      {isCurrentUser && isCreator && <span className="user-badge">Creator</span>}
                      {isCurrentUser && !isCreator && <span className="user-badge">You</span>}
                    </div>
                    {isCreator && !isCurrentUser && (
                      <button
                        onClick={() => removeUser(u)}
                        className="btn btn-danger"
                      >
                        Remove
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="messages card chat">
            <h3>Messages:</h3>
            <div className="chat-window" ref={chatWindowRef}>
              {messages.map((m, i) => {
                const isMe = m.username === username;
                const initials = (m.username || "?")
                  .split(" ")
                  .map((s) => s[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase();

                return (
                  <div key={m._id || m.tempId || i} className="bubble-row">
                    {!isMe && <div className="avatar">{initials}</div>}
                    <div className={`bubble ${isMe ? "me" : "them"}`}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>
                          {m.username}
                        </div>
                        <button
                          title="Copy message"
                          onClick={() => navigator.clipboard.writeText(m.text || "")}
                          className="copy-btn"
                          aria-label="Copy message"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                          </svg>
                        </button>
                      </div>
                      <div>{m.text}</div>
                    </div>
                    {isMe && <div className="avatar">{initials}</div>}
                  </div>
                );
              })}

              {typingUsers.length > 0 && (
                <p className="typing">
                  {typingUsers.join(", ")}
                  {typingUsers.length === 1 ? " is" : " are"} typing...
                </p>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form className="chat-input-row" onSubmit={sendMessage}>
              <input
                type="text"
                placeholder="Type a message..."
                value={text}
                onChange={handleTyping}
                className="chat-input"
              />
              <button type="submit" className="btn btn-primary">
                Send
              </button>
            </form>
          </div>

          <form onSubmit={handleUpload} className="form-row">
            <input
              type="file"
              onChange={(e) => setFile(e.target.files[0])}
              className="file-input"
            />
            <button type="submit" className="btn btn-ghost">
              Upload
            </button>
          </form>

          <div className="files card">
            <h3>Files:</h3>
            {files.length === 0 && (
              <p className="small-muted">No files shared yet.</p>
            )}
            {[...new Map(files.map(file => [file._id, file])).values()].map((f) => (
              <div
                key={f._id}
                className="message"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>
                  <a
                    href={`${BACKEND_URL}/api/rooms/${roomId}/files/${f._id}/download`}
                    download={f.originalName}
                    style={{ color: "var(--accent-2)" }}
                  >
                    {f.originalName}
                  </a>
                  <span className="small-muted" style={{ marginLeft: 8 }}>
                    (by {f.uploadedBy})
                  </span>
                </span>
                {isCreator && (
                  <button
                    onClick={() => deleteFile(f._id)}
                    className="btn btn-danger"
                  >
                    Delete
                  </button>
                )}
              </div>
            ))}
            <div ref={filesEndRef} />
          </div>
        </div>
      </div>
    </div>
  );                        
}
