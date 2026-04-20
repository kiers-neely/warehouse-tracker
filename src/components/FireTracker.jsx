"use client";

import { useState, useEffect, useCallback } from "react";

// (Keep your US_STATES_COORDS and FIRE_COLORS constants here...)

export default function FireTracker() {
  const [fires, setFires] = useState([]);
  const [view, setView] = useState("map"); 
  const [status, setStatus] = useState("idle");
  const [highlightedFire, setHighlightedFire] = useState(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const fetchFires = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch("/api/scan");
      const data = await res.json();
      // The API now only sends status === 'approved'
      setFires(data.incidents || []);
    } catch (e) {
      console.error("Fetch error:", e);
    } finally {
      setStatus("idle");
    }
  }, []);

  useEffect(() => { fetchFires(); }, [fetchFires]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = Object.fromEntries(formData.entries());

    setStatus("saving");
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Submission failed");
      
      alert(payload.admin_password ? "Added to map!" : "Sent for approval!");
      setView("map");
      fetchFires();
    } catch (e) {
      alert(e.message);
    } finally {
      setStatus("idle");
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e8e0d5", display: "flex", flexDirection: "column", fontFamily: "monospace" }}>
      <header style={{ padding: 20, display: "flex", justifyContent: "space-between", borderBottom: "1px solid #222" }}>
        <h1 style={{ color: "#ff4500", margin: 0, fontSize: isMobile ? 18 : 24 }}>🔥 WAREHOUSE FIRE TRACKER</h1>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setView(view === "report" ? "map" : "report")} style={btnStyle}>
            {view === "report" ? "✕ CLOSE" : "✚ REPORT"}
          </button>
        </div>
      </header>

      <main style={{ flex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", overflow: "hidden" }}>
        {view === "map" ? (
          <>
            <div style={{ flex: 2, padding: 20, position: "relative" }}>
              <USMap fires={fires} highlightedFire={highlightedFire} />
            </div>
            <div style={{ flex: 1, borderLeft: "1px solid #222", overflowY: "auto", background: "#050508" }}>
               {fires.map(f => (
                 <div key={f.id} onMouseEnter={() => setHighlightedFire(f)} style={{ padding: 15, borderBottom: "1px solid #111" }}>
                   <div style={{ color: "#ff4500", fontSize: 14 }}>{f.location}</div>
                   <div style={{ fontSize: 11, color: "#666" }}>{f.date_occurred} — {f.facility_type}</div>
                 </div>
               ))}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, padding: 40, display: "flex", justifyContent: "center" }}>
            <form onSubmit={handleSubmit} style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 15 }}>
              <input name="admin_password" type="password" placeholder="Admin Password (leave blank for public)" style={inputStyle} />
              <input name="title" placeholder="Title" required style={inputStyle} />
              <input name="location" placeholder="City, ST" required style={inputStyle} />
              <input name="facility_type" placeholder="Facility Type" style={inputStyle} />
              <input name="date_occurred" type="date" required style={inputStyle} />
              <input name="url" placeholder="URL" style={inputStyle} />
              <button type="submit" style={{ ...btnStyle, background: "#ff4500", color: "white" }}>
                {status === "saving" ? "SUBMITTING..." : "SUBMIT"}
              </button>
            </form>
          </div>
        )}
      </main>
      <footer style={{ padding: 10, textAlign: "center", fontSize: 10, color: "#222" }}>
         <span onClick={() => window.location.href='/admin'} style={{ cursor: 'pointer' }}>MODERATION PANEL</span>
      </footer>
    </div>
  );
}

// --- SUB-COMPONENTS ---

function USMap({ fires, hoveredFire, setHoveredFire, highlightedFire, isMobile }) {
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <img src="/us-map.svg" alt="US Map" style={{ width: "100%", opacity: 0.2, filter: "invert(1)" }} />
      {fires.map((fire, i) => {
        if (!fire.coords) return null;
        const [x, y] = fire.coords;
        const active = highlightedFire?.id === fire.id || hoveredFire?.id === fire.id;
        return (
          <div key={fire.id}
            onMouseEnter={() => setHoveredFire(fire)}
            onMouseLeave={() => setHoveredFire(null)}
            style={{
              position: "absolute", left: `${x}%`, top: `${y}%`,
              width: active ? 12 : 8, height: active ? 12 : 8,
              background: FIRE_COLORS[i % 5], borderRadius: "50%",
              transform: "translate(-50%, -50%)", cursor: "pointer",
              boxShadow: active ? `0 0 15px ${FIRE_COLORS[i % 5]}` : "none",
              zIndex: active ? 100 : 1, transition: "all 0.2s"
            }}
          >
            {active && (
              <div style={{
                position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)",
                background: "#000", padding: "4px 8px", borderRadius: 4, fontSize: 9, whiteSpace: "nowrap",
                border: "1px solid #333", marginBottom: 5
              }}>
                {fire.location}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- STYLES ---
const navBtnStyle = {
  background: "#1a1a1f", border: "1px solid #333", color: "#ff6a00",
  padding: "6px 12px", fontSize: 10, cursor: "pointer", borderRadius: 4,
  fontFamily: "inherit"
};

const inputStyle = {
  padding: "12px", background: "#0a0a0f", border: "1px solid #333",
  color: "white", borderRadius: 4, fontSize: 13, fontFamily: "inherit"
};