"use client";

import { useState, useEffect } from "react";
import { US_STATE_OPTIONS } from "../../lib/usStates.js";

export default function ModerationPage() {
  const [pending, setPending] = useState([]);
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);

  // Fetch pending fires through admin-authenticated API route
  const fetchPending = async (passwordToCheck = password) => {
    setLoading(true);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admin_password: passwordToCheck,
          action: "list_pending",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load pending fires");
      }
      setPending(data.incidents || []);
      return true;
    } catch (e) {
      setIsAuthenticated(false);
      setPending([]);
      alert(e.message === "Unauthorized" ? "Incorrect admin password" : e.message || "Failed to load pending fires");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    const ok = await fetchPending(password);
    if (ok) {
      setIsAuthenticated(true);
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

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Action failed");
      }
      
      alert(`Incident ${actionType === "approve" ? "Approved" : "Deleted"}`);
      fetchPending(); // Refresh list
    } catch (e) {
      alert(e.message);
    }
  };

  const handleAdminAdd = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = Object.fromEntries(formData.entries());
    payload.city = payload.city.trim();
    payload.state = payload.state.toUpperCase();
    payload.location = `${payload.city}, ${payload.state}`;
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Add failed");
      }
      alert("Incident Added Successfully!");
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
            onClick={handleLogin}
            disabled={loading}
            style={btnStyle}
          >
            {loading ? "Checking..." : "Login to Dashboard"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={{ width: "100%", maxWidth: "800px" }}>
        <div style={{ display: "flex", flexDirection: "row", justifyContent: "flex-start", gap: 10, alignItems: "center", marginBottom: 20 }}>
          <h1 style={{ color: "#ff4500" }}>Pending Submissions ({pending.length})</h1>
          <button onClick={() => window.location.href = "/"} style={secondaryBtn}>Back to Map</button>
          <button
            onClick={async () => {
                const res = await fetch("/api/scan", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        admin_password: password,
                        action: "backfill_geocodes",
                    }),
                });

                const data = await res.json();

                if (!res.ok) {
                    alert(data.error || "Backfill failed");
                    return;
                }

                console.log(data);
                alert(data.message);
            }}
            style={secondaryBtn}
          >
            Backfill Geocodes
          </button>

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

      <div style={{ marginTop: 40, padding: 20, background: "#121217", borderRadius: 8, border: "1px solid #222", width: "100%", maxWidth: "800px" }}>
        <h2 style={{ color: "#ff4500", marginBottom: 20 }}>Add New Incident (Approved Directly)</h2>
        <form onSubmit={handleAdminAdd} style={{ display: "flex", flexDirection: "column", gap: 15 }}>
          <input name="admin_password" type="password" placeholder="Confirm Admin Password" required style={inputStyle} />
          <input name="title" placeholder="Short Headline" required style={inputStyle} />
          <input
            name="city"
            placeholder="City"
            required
            style={inputStyle}
          />

          <select name="state" required style={inputStyle} defaultValue="">
            <option value="" disabled>State</option>
            {US_STATE_OPTIONS.map((state) => (
                <option key={state.value} value={state.value}>
                    {state.label}
                </option>
            ))}
          </select>
          <input name="facility_type" placeholder="Type" style={inputStyle} />
          <input name="date_occurred" type="date" required style={inputStyle} />
          <input name="url" placeholder="News Article URL" style={inputStyle} />
          <button type="submit" style={btnStyle}>Add Incident</button>
        </form>
      </div>
    </div>
  );
}

// --- STYLES ---
const containerStyle = { minHeight: "100vh", background: "#0a0a0f", color: "white", padding: "40px 20px", display: "flex", justifyContent: "center", fontFamily: "monospace" };
const cardStyle = { background: "#121217", padding: 30, borderRadius: 8, border: "1px solid #222", textAlign: "center", width: "100%", maxWidth: "400px" };
const inputStyle = { width: "100%", padding: 12, margin: "20px 0", background: "#000", border: "1px solid #333", color: "white", borderRadius: 4, fontFamily: "monospace" };
const btnStyle = { width: "100%", padding: 12, background: "#ff4500", border: "none", color: "white", fontWeight: "bold", cursor: "pointer", borderRadius: 4 };
const itemStyle = { background: "#121217", padding: 20, borderRadius: 8, border: "1px solid #222", display: "flex", width: "80%", justifyContent: "space-between", alignItems: "center" };
const approveBtn = { background: "#2e7d32", color: "white", border: "none", padding: "8px 16px", borderRadius: 4, cursor: "pointer", fontWeight: "bold" };
const deleteBtn = { background: "#c62828", color: "white", border: "none", padding: "8px 16px", borderRadius: 4, cursor: "pointer", fontWeight: "bold" };
const secondaryBtn = { background: "transparent", border: "1px solid #333", color: "#666", padding: "6px 12px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontFamily: "monospace" };
