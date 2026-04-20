"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// --- CONSTANTS ---
const US_STATES_COORDS = {
  AL: [68.2, 70.1], AK: [12.1, 90.2], AZ: [20.3, 61.7], AR: [57.2, 63.1],
  CA: [9.5,  46.5], CO: [33.1, 46.0], CT: [89.6, 30.3], DE: [86.3, 40.8],
  FL: [75.1, 86.2], GA: [74.5, 68.3], HI: [30.9, 92.2], ID: [20.1, 18.8],
  IL: [61.6, 44.0], IN: [67.2, 43.3], IA: [54.6, 36.3], KS: [45.8, 49.1],
  KY: [68.8, 50.7], LA: [59.0, 76.9], ME: [93.4, 14.8], MD: [83.0, 42.2],
  MA: [91.1, 26.7], MI: [64.2, 24.4], MN: [54.2, 19.9], MS: [61.9, 70.7],
  MO: [56.6, 49.8], MT: [28.5, 14.7], NE: [43.8, 37.7], NV: [13.9, 42.5],
  NH: [90.4, 20.6], NJ: [87.0, 36.7], NM: [31.0, 63.1], NY: [84.2, 26.4],
  NC: [80.0, 56.3], ND: [43.2, 15.6], OH: [73.0, 40.0], OK: [45.2, 60.9],
  OR: [10.1, 20.0], PA: [81.6, 35.7], RI: [91.5, 29.5], SC: [78.4, 64.1],
  SD: [43.0, 27.6], TN: [68.5, 57.7], TX: [42.2, 76.3], UT: [22.6, 42.1],
  VT: [88.1, 21.5], VA: [80.0, 47.7], WA: [12.1, 12.0], WV: [78.1, 44.5],
  WI: [60.2, 25.4], WY: [30.7, 30.5], DC: [83.6, 42.6],
};

const FIRE_COLORS = ["#ff4500", "#ff6a00", "#ff8c00", "#ffa500", "#ffcc00"];

function getCoords(state, index) {
  const base = US_STATES_COORDS[state];
  if (!base) return null;
  const jitter = Math.sin(index * 137.5) * 1.2;
  const jitter2 = Math.cos(index * 137.5) * 1.2;
  return [base[0] + jitter, base[1] + jitter2];
}

export default function FireTracker() {
  const [fires, setFires] = useState([]);
  const [view, setView] = useState("map"); // "map", "report", or "admin"
  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState(null);
  const [highlightedFire, setHighlightedFire] = useState(null);
  const [hoveredFire, setHoveredFire] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");

  // Handle Mobile Detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Fetch approved fires for the map
  const fetchApprovedFires = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch("/api/scan"); 
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      console.log('All incidents:', data.incidents);
      const filtered = data.incidents.filter(incident => incident.status === 'approved') || [];
      console.log('Filtered fires:', filtered);
      setFires(filtered);
      setStatus("idle");
    } catch (e) {
      setErrorMsg(e.message);
      setStatus("error");
    }
  }, []);

  useEffect(() => { fetchApprovedFires(); }, [fetchApprovedFires]);

  // Submission Handler (Public or Admin)
  const handleSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = Object.fromEntries(formData.entries());
    
    // Extract state from location string "City, ST" if needed
    const stateMatch = payload.location.match(/,\s*([A-Z]{2})$/);
    if (stateMatch) payload.state = stateMatch[1];

    setStatus("saving");
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Save failed");
      }
      alert(view === "admin" ? "Fire Added Successfully!" : "Thank you! Submission sent for review.");
      setView("map");
      fetchApprovedFires();
    } catch (e) {
      alert(e.message);
    } finally {
      setStatus("idle");
    }
  };

  return (
    <div style={{
      minHeight: "100vh", height: isMobile ? "auto" : "100vh",
      overflow: isMobile ? "auto" : "hidden", background: "#0a0a0f",
      color: "#e8e0d5", fontFamily: "'DM Mono', monospace",
      display: "flex", flexDirection: "column",
    }}>

      {/* Header */}
      <header style={{
        borderBottom: "1px solid #2a1a0f", padding: isMobile ? "14px 16px" : "20px 32px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "linear-gradient(180deg,#120a05 0%,transparent 100%)",
      }}>
        <div onClick={() => setView("map")} style={{ cursor: "pointer" }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(20px,4vw,32px)", color: "#ff4500", letterSpacing: "0.1em" }}>
            🔥 US WAREHOUSE FIRE TRACKER
          </div>
          <div style={{ fontSize: "9px", color: "#a07868", letterSpacing: "0.2em" }}>CROWDSOURCED INDUSTRIAL INCIDENT MAP</div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setView(view === "report" ? "map" : "report")} style={navBtnStyle}>
            {view === "report" ? "✕ CLOSE" : "✚ REPORT FIRE"}
          </button>
          {!isMobile && (
             <button onClick={fetchApprovedFires} style={navBtnStyle}>↺ REFRESH</button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", overflow: "hidden" }}>
        
        {view === "map" ? (
          <>
            {/* Map Column */}
            <div style={{ flex: isMobile ? "none" : "0 0 60%", borderRight: "1px solid #1a0f08", position: "relative", padding: 20 }}>
               <USMap 
                fires={fires.map((f, i) => ({ ...f, coords: getCoords(f.location.split(', ')[1], i) }))} 
                hoveredFire={hoveredFire} setHoveredFire={setHoveredFire}
                highlightedFire={highlightedFire} isMobile={isMobile} 
               />
            </div>

            {/* Log Column */}
            <div style={{ flex: isMobile ? "none" : "0 0 40%", overflowY: "auto", background: "#050508" }}>
              <div style={{ padding: 15, fontSize: 10, color: "#8a6a55", borderBottom: "1px solid #1a1a1f" }}>INCIDENT LOG ({fires.length})</div>
              {fires.map((fire, i) => (
                <div 
                  key={fire.id} 
                  onMouseEnter={() => setHighlightedFire(fire)}
                  onMouseLeave={() => setHighlightedFire(null)}
                  style={{ 
                    padding: "15px 20px", borderBottom: "1px solid #120d09", 
                    background: highlightedFire?.id === fire.id ? "#1a0a05" : "transparent"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: FIRE_COLORS[i % 5], fontWeight: "bold" }}>{fire.location}</span>
                    <span style={{ color: "#777" }}>{fire.date_occurred}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#d4b090", marginTop: 4 }}>{fire.facility_type}</div>
                  <div style={{ fontSize: 10, color: "#666", marginTop: 4 }}>{fire.title}</div>
                  {fire.url && <a href={fire.url} target="_blank" style={{ fontSize: 9, color: "#ff6a00", textDecoration: "none" }}>→ View Source</a>}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "40px 20px", overflowY: "auto" }}>
            <div style={{ width: "100%", maxWidth: 500, background: "#121217", padding: 30, borderRadius: 8, border: "1px solid #222" }}>
               <h2 style={{ color: "#ff4500", marginBottom: 20 }}>{view === "report" ? "Report an Incident" : "Admin Add"}</h2>
               <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 15 }}>
                  {view === "admin" && (
                    <input name="admin_password" type="password" placeholder="Admin Secret" required style={inputStyle} />
                  )}
                  <input name="title" placeholder="Short Headline (e.g. 3-Alarm Factory Fire)" required style={inputStyle} />
                  <input name="location" placeholder="City, ST (e.g. Dallas, TX)" required style={inputStyle} />
                  <input name="facility_type" placeholder="Type (e.g. Logistics Center)" style={inputStyle} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <label style={{ fontSize: 10, color: "#666" }}>Date of Incident</label>
                    <input name="date_occurred" type="date" required style={inputStyle} />
                  </div>
                  <input name="url" placeholder="News Article URL" style={inputStyle} />
                  
                  <button type="submit" disabled={status === "saving"} style={{ ...navBtnStyle, padding: 15, background: "#ff4500", color: "white" }}>
                    {status === "saving" ? "PROCESSING..." : "SUBMIT FOR REVIEW"}
                  </button>
                  <button type="button" onClick={() => setView("map")} style={{ background: "none", border: "none", color: "#666", fontSize: 11, cursor: "pointer" }}>Cancel</button>
               </form>
            </div>
          </div>
        )}
      </main>

      {/* Footer / Hidden Admin Entry */}
      <footer style={{ padding: 10, textAlign: "center", fontSize: 9, color: "#333", borderTop: "1px solid #111" }}>
        © {new Date().getFullYear()} WAREHOUSE FIRE TRACKER · 
        <span onClick={() => setView("admin")} style={{ cursor: "pointer" }}> ADMIN LOGIN</span>
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