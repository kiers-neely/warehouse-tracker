"use client";

import { useState, useEffect } from "react";
import { US_STATE_OPTIONS } from "../../lib/usStates.js";

export default function ModerationPage() {
  const [pending, setPending] = useState([]);
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);

  const startEdit = (fire) => {
    setEditingId(fire.id);
    setDraft({
      title: fire.title || "",
      city: fire.city || "",
      state: fire.state || "",
      facility_type: fire.facility_type || "",
      date_occurred: fire.date_occurred || "",
      url: fire.url || "",
      cause: fire.cause || "unknown",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft({});
  };

  const updateDraft = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const handleSaveEdit = async (id, alsoApprove = false) => {
    if (!draft.city?.trim() || !draft.state?.trim()) {
      alert("City and state are required");
      return;
    }

    setSavingEdit(true);
    try {
      const payload = {
        admin_password: password,
        action: "edit",
        id,
        title: draft.title,
        city: draft.city,
        state: draft.state,
        facility_type: draft.facility_type,
        date_occurred: draft.date_occurred,
        url: draft.url,
        cause: draft.cause,
      };
      if (alsoApprove) payload.status = "approved";

      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");

      alert(alsoApprove ? "Incident updated and approved" : "Incident updated");
      cancelEdit();
      fetchPending();
    } catch (e) {
      alert(e.message);
    } finally {
      setSavingEdit(false);
    }
  };

  // Handle Mobile Detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

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
    <div style={{ ...containerStyle, flexDirection: isMobile ? "column" : "row" , alignItems: isMobile ? "center" : "flex-start", gap: 40 }}>
      <div style={{ marginTop: 40, padding: 20, background: "#121217", borderRadius: 8, border: "1px solid #222", width: "100%", maxWidth: "800px", order: isMobile ? -1 : 1 }}>
        <h2 style={{ color: "#ff4500", marginBottom: 20 }}>Add New Incident</h2>
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
          <select name="cause" required style={inputStyle} defaultValue="unknown">
            <option value="" disabled>Cause</option>
            <option value="unknown">Unknown</option>
            <option value="accident">Accident</option>
            <option value="arson">Arson</option>
          </select>
          <input name="facility_type" placeholder="Type" style={inputStyle} />
          <input name="date_occurred" type="date" required style={inputStyle} />
          <input name="url" placeholder="News Article URL" style={inputStyle} />
          <button type="submit" style={btnStyle}>Add Incident</button>
        </form>
      </div>

      <div style={{ width: "100%", maxWidth: "800px", order: isMobile ? 1 : 0 }}>
        <div style={{ display: "flex", flexDirection: "row", justifyContent: "flex-start", gap: 10, alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ color: "#ff4500" }}>Pending Submissions ({pending.length})</h2>
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
            {pending.map((fire) => {
              const isEditing = editingId === fire.id;

              if (!isEditing) {
                return (
                  <div key={fire.id} style={itemStyle}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: "bold", fontSize: 16 }}>{fire.location}</div>
                      <div style={{ color: "#aaa", fontSize: 13, marginTop: 4 }}>{fire.facility_type} — {fire.date_occurred}</div>
                      <div style={{ color: "#666", fontSize: 12, marginTop: 4 }}>{fire.title}</div>
                      <div style={{ color: "#777", fontSize: 11, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                        Cause: {fire.cause || "unknown"}
                      </div>
                      {fire.url && (
                        <a href={/^https?:\/\//i.test(fire.url) ? fire.url : `https://${fire.url}`} target="_blank" rel="noopener noreferrer" style={{ color: "#ff6a00", fontSize: 11 }}>View Article</a>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <button onClick={() => handleAction(fire.id, "approve")} style={approveBtn}>APPROVE</button>
                      <button onClick={() => startEdit(fire)} style={editBtn}>EDIT</button>
                      <button onClick={() => handleAction(fire.id, "delete")} style={deleteBtn}>DELETE</button>
                    </div>
                  </div>
                );
              }

              return (
                <div key={fire.id} style={{ ...itemStyle, flexDirection: "column", alignItems: "stretch", gap: 12 }}>
                  <div style={{ color: "#ff6a00", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: "bold" }}>
                    Editing submission #{fire.id}
                  </div>
                  <label style={editLabelStyle}>
                    Title
                    <input
                      type="text"
                      value={draft.title}
                      onChange={(e) => updateDraft("title", e.target.value)}
                      style={editInputStyle}
                    />
                  </label>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <label style={{ ...editLabelStyle, flex: "2 1 200px" }}>
                      City
                      <input
                        type="text"
                        value={draft.city}
                        onChange={(e) => updateDraft("city", e.target.value)}
                        style={editInputStyle}
                      />
                    </label>
                    <label style={{ ...editLabelStyle, flex: "1 1 120px" }}>
                      State
                      <select
                        value={draft.state}
                        onChange={(e) => updateDraft("state", e.target.value)}
                        style={editInputStyle}
                      >
                        <option value="" disabled>State</option>
                        {US_STATE_OPTIONS.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <label style={{ ...editLabelStyle, flex: "2 1 200px" }}>
                      Facility Type
                      <input
                        type="text"
                        value={draft.facility_type}
                        onChange={(e) => updateDraft("facility_type", e.target.value)}
                        style={editInputStyle}
                      />
                    </label>
                    <label style={{ ...editLabelStyle, flex: "1 1 140px" }}>
                      Date
                      <input
                        type="date"
                        value={draft.date_occurred || ""}
                        onChange={(e) => updateDraft("date_occurred", e.target.value)}
                        style={editInputStyle}
                      />
                    </label>
                  </div>
                  <label style={editLabelStyle}>
                    Cause
                    <select
                      value={draft.cause}
                      onChange={(e) => updateDraft("cause", e.target.value)}
                      style={editInputStyle}
                    >
                      <option value="unknown">Unknown</option>
                      <option value="accident">Accident</option>
                      <option value="arson">Arson</option>
                    </select>
                  </label>
                  <label style={editLabelStyle}>
                    News Article URL
                    <input
                      type="text"
                      value={draft.url}
                      onChange={(e) => updateDraft("url", e.target.value)}
                      style={editInputStyle}
                    />
                  </label>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                    <button
                      onClick={() => handleSaveEdit(fire.id, true)}
                      disabled={savingEdit}
                      style={approveBtn}
                    >
                      {savingEdit ? "SAVING..." : "SAVE & APPROVE"}
                    </button>
                    <button
                      onClick={() => handleSaveEdit(fire.id, false)}
                      disabled={savingEdit}
                      style={editBtn}
                    >
                      {savingEdit ? "SAVING..." : "SAVE"}
                    </button>
                    <button
                      onClick={cancelEdit}
                      disabled={savingEdit}
                      style={secondaryBtn}
                    >
                      CANCEL
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// --- STYLES ---
const containerStyle = { minHeight: "100vh", background: "#0a0a0f", color: "white", padding: "20px 20px", display: "flex", justifyContent: "center", fontFamily: "monospace" };
const cardStyle = { background: "#121217", padding: 30, borderRadius: 8, border: "1px solid #222", textAlign: "center", width: "100%", maxWidth: "400px" };
const inputStyle = { width: "100%", padding: 12, display: "flex", margin: "10px 0", background: "#000", border: "1px solid #333", color: "white", borderRadius: 4, fontFamily: "monospace", boxSizing: "border-box" };
const btnStyle = { width: "100%", padding: 12, background: "#ff4500", border: "none", color: "white", fontWeight: "bold", cursor: "pointer", borderRadius: 4 };
const itemStyle = { background: "#121217", padding: 20, borderRadius: 8, border: "1px solid #222", display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center" };
const approveBtn = { background: "#2e7d32", color: "white", border: "none", padding: "8px 16px", borderRadius: 4, cursor: "pointer", fontWeight: "bold" };
const deleteBtn = { background: "#c62828", color: "white", border: "none", padding: "8px 16px", borderRadius: 4, cursor: "pointer", fontWeight: "bold" };
const editBtn = { background: "#1565c0", color: "white", border: "none", padding: "8px 16px", borderRadius: 4, cursor: "pointer", fontWeight: "bold" };
const secondaryBtn = { background: "transparent", border: "1px solid #333", color: "#666", padding: "6px 12px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontFamily: "monospace" };
const editLabelStyle = { display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "#888", letterSpacing: "0.08em", textTransform: "uppercase", flex: 1 };
const editInputStyle = { padding: "8px 10px", background: "#000", border: "1px solid #333", color: "white", borderRadius: 4, fontFamily: "monospace", fontSize: 13, marginTop: 2, width: "100%", boxSizing: "border-box" };
