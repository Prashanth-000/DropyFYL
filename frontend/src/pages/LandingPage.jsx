import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { BACKEND_URL } from "../config";

export default function LandingPage() {
  const navigate = useNavigate();

  const [username, setUsername] = useState(
    localStorage.getItem("tempChatUser")
      ? JSON.parse(localStorage.getItem("tempChatUser")).username
      : ""
  );
  const [createUsername, setCreateUsername] = useState("");
  const [joinUsername, setJoinUsername] = useState("");
  const [createRoomName, setCreateRoomName] = useState("");
  const [createRoomPassword, setCreateRoomPassword] = useState("");
  const [joinRoomId, setJoinRoomId] = useState("");
  const [joinRoomPassword, setJoinRoomPassword] = useState("");
  const [userRooms, setUserRooms] = useState({ created: [], participantRooms: [] });

  const [darkMode, setDarkMode] = useState(
    localStorage.getItem("darkMode") === "true"
  );

  useEffect(() => {
    document.body.classList.toggle("dark-mode", darkMode);
    localStorage.setItem("darkMode", darkMode);
  }, [darkMode]);

  useEffect(() => {
    const saved = localStorage.getItem("tempChatUser");
    if (saved) {
      const { username, password } = JSON.parse(saved);
      setUsername(username);
      setCreateUsername(username);
      setJoinUsername(username);
      setCreateRoomPassword(password);
      setJoinRoomPassword(password);

      fetch(`${BACKEND_URL}/api/users/${encodeURIComponent(username)}/rooms`)
        .then((r) => r.json())
        .then((data) => setUserRooms(data))
        .catch(() => {});
    }
  }, []);

  const saveUser = (u) => {
    const finalUser = u || username;
    localStorage.setItem(
      "tempChatUser",
      JSON.stringify({ username: finalUser, password: createRoomPassword })
    );
    setUsername(finalUser);
  };

  const createRoom = async () => {
    if (!createUsername || !createRoomName || !createRoomPassword) {
      alert("Please fill all fields");
      return;
    }
    try {
      saveUser(createUsername);
      const res = await axios.post(`${BACKEND_URL}/api/rooms`, {
        name: createRoomName,
        password: createRoomPassword,
        creatorName: createUsername,
      });
      navigate(`/room/${res.data.roomId}`);
    } catch (err) {
      console.error(err);
      alert("Failed to create room");
    }
  };

  const joinRoom = async () => {
    if (!joinUsername || !joinRoomId || !joinRoomPassword) {
      alert("Please fill all fields");
      return;
    }
    try {
      saveUser(joinUsername);
      const res = await axios.post(`${BACKEND_URL}/api/rooms/join`, {
        name: joinRoomId,
        password: joinRoomPassword,
        username: joinUsername,
      });
      navigate(`/room/${res.data.roomId}`);
    } catch (err) {
      console.error(err);
      alert("Failed to join room: " + (err.response?.data || ""));
    }
  };

  return (
    <div className="app-root fade-in">
      <div className="container">
        <div className="grid-2">
          <div className="card">
            <h2>Create Room</h2>
            <input
              type="text"
              placeholder="Username"
              value={createUsername}
              onChange={(e) => setCreateUsername(e.target.value)}
              className="input"
            />
            <input
              type="text"
              placeholder="Room Name"
              value={createRoomName}
              onChange={(e) => setCreateRoomName(e.target.value)}
              className="input"
            />
            <input
              type="password"
              placeholder="Room Password"
              value={createRoomPassword}
              onChange={(e) => setCreateRoomPassword(e.target.value)}
              className="input"
            />
            <button
              onClick={createRoom}
              className="btn btn-primary"
              aria-label="Create Room"
            >
              Create Room
            </button>
          </div>

          <div className="card">
            <h2>Join Room</h2>
            <input
              type="text"
              placeholder="Username"
              value={joinUsername}
              onChange={(e) => setJoinUsername(e.target.value)}
              className="input"
            />
            <input
              type="text"
              placeholder="Room ID"
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value)}
              className="input"
            />
            <input
              type="password"
              placeholder="Room Password"
              value={joinRoomPassword}
              onChange={(e) => setJoinRoomPassword(e.target.value)}
              className="input"
            />
            <button
              onClick={joinRoom}
              className="btn btn-ghost"
              aria-label="Join Room"
            >
              Join Room
            </button>
          </div>
        </div>
        <div style={{ marginTop: 20 }}>
          <h3>Your rooms</h3>
          <div
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            {userRooms.created.map((r) => (
              <div key={r._id} className="card">
                <div style={{ fontWeight: 700 }}>{r.name}</div>
                <div className="small-muted">
                  Created {new Date(r.createdAt).toLocaleString()}
                </div>
                <div style={{ marginTop: 8 }}>
                  <button
                    className="btn btn-ghost"
                    onClick={() => navigate(`/room/${r._id}`)}
                  >
                    Open
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={async () => {
                      await fetch(`${BACKEND_URL}/api/rooms/${r._id}`, {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ username }),
                      });
                      const resp = await fetch(
                        `${BACKEND_URL}/api/users/${encodeURIComponent(
                          username
                        )}/rooms`
                      );
                      setUserRooms(await resp.json());
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {userRooms.participantRooms.map((r) => (
              <div key={r._id} className="card">
                <div style={{ fontWeight: 700 }}>{r.name}</div>
                <div className="small-muted">
                  Joined {new Date(r.createdAt).toLocaleString()}
                </div>
                <div style={{ marginTop: 8 }}>
                  <button
                    className="btn btn-ghost"
                    onClick={() => navigate(`/room/${r._id}`)}
                  >
                    Open
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="footer">
          Powered by❤️ P000• No login required • Rooms auto-deleted
        </div>
      </div>
    </div>
  );
}
