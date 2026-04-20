"use client";

import { useState, useEffect } from "react";

export default function ModerationPage() {
  const [pending, setPending] = useState([]);
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);

  // Fetch only pending fires
  const fetchPending = async () => {
    setLoading(true);
    try {
      // We pass the password to a specialized GET query or filter on the client
      const res = await fetch("/api/scan");
      const data = await res.json();
      // Filter for pending status only
      const pendingFires = (data.incidents || []).filter(f => f.status === "pending");
      setPending(pendingFires);
    } catch (e) {
      alert("Failed to load pending fires");
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (id, actionType) => {
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admin_password: password,
          action: "moderate",
          id: id,
          status: actionType === "approve" ? "approved" : "deleted"
        }),
      });

      if (!res.ok) throw new Error("Action failed");
      
      alert(`Incident ${actionType === "approve" ? "Approved" : "Deleted"}`);
      fetchPending(); // Refresh list
    } catch (e) {
      alert(e.message);
    }
  };

  if (!isAuthenticated) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h2 style={{ color: "#ff4500" }}>Admin Moderation</h2>
          <input 
            type="password" 
            placeholder="Enter Admin Password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
          <button 
            onClick={() => { setIsAuthenticated(true); fetchPending(); }} 
            style={btnStyle}
          >
            Login to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={{ width: "100%", maxWidth: "800px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h1 style={{ color: "#ff4500" }}>Pending Submissions ({pending.length})</h1>
          <button onClick={() => window.location.href = "/"} style={secondaryBtn}>Back to Map</button>
        </div>

        {loading ? <p>Loading...</p> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
            {pending.length === 0 && <p style={{ color: "#666" }}>No pending submissions to review.</p>}
            {pending.map((fire) => (
              <div key={fire.id} style={itemStyle}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: "bold", fontSize: 16 }}>{fire.location}</div>
                  <div style={{ color: "#aaa", fontSize: 13, marginTop: 4 }}>{fire.facility_type} — {fire.date_occurred}</div>
                  <div style={{ color: "#666", fontSize: 12, marginTop: 4 }}>{fire.title}</div>
                  {fire.url && (
                    <a href={fire.url} target="_blank" style={{ color: "#ff6a00", fontSize: 11 }}>View Article</a>
                  )}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => handleAction(fire.id, "approve")} style={approveBtn}>APPROVE</button>
                  <button onClick={() => handleAction(fire.id, "delete")} style={deleteBtn}>DELETE</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- STYLES ---
const containerStyle = { minHeight: "100vh", background: "#0a0a0f", color: "white", padding: "40px 20px", display: "flex", justifyContent: "center", fontFamily: "monospace" };
const cardStyle = { background: "#121217", padding: 30, borderRadius: 8, border: "1px solid #222", textAlign: "center", width: "100%", maxWidth: "400px" };
const inputStyle = { width: "100%", padding: 12, margin: "20px 0", background: "#000", border: "1px solid #333", color: "white", borderRadius: 4 };
const btnStyle = { width: "100%", padding: 12, background: "#ff4500", border: "none", color: "white", fontWeight: "bold", cursor: "pointer", borderRadius: 4 };
const itemStyle = { background: "#121217", padding: 20, borderRadius: 8, border: "1px solid #222", display: "flex", justifyContent: "space-between", alignItems: "center" };
const approveBtn = { background: "#2e7d32", color: "white", border: "none", padding: "8px 16px", borderRadius: 4, cursor: "pointer", fontWeight: "bold" };
const deleteBtn = { background: "#c62828", color: "white", border: "none", padding: "8px 16px", borderRadius: 4, cursor: "pointer", fontWeight: "bold" };
const secondaryBtn = { background: "transparent", border: "1px solid #333", color: "#666", padding: "6px 12px", borderRadius: 4, cursor: "pointer", fontSize: 12 };