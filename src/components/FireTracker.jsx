"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";

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
  if (!base) return [50, 50];
  const jitterX = Math.sin(index * 137.5) * 1.5;
  const jitterY = Math.cos(index * 137.5) * 1.5;
  return [base[0] + jitterX, base[1] + jitterY];
}

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
    if (typeof window === "undefined") return;
    setStatus("loading");
    try {
      const res = await fetch("/api/scan");
      if (!res.ok) throw new Error("API unavailable");
      const data = await res.json();
      setFires(data.incidents || []);
      setStatus("idle");
    } catch (e) {
      console.error(e);
      setStatus("error");
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
    <div style={containerStyle}>
      <header style={headerStyle}>
        <div onClick={() => setView("map")} style={{ cursor: "pointer" }}>
          <h1 style={{ color: "#ff4500", margin: 0, fontSize: isMobile ? "18px" : "28px", fontFamily: "'Bebas Neue', sans-serif" }}>
            🔥 US WAREHOUSE FIRE TRACKER
          </h1>
          <p style={{ fontSize: "10px", color: "#a07868", margin: 0, letterSpacing: "0.15em", textTransform: "uppercase" }}>
            CROWDSOURCED INDUSTRIAL INCIDENT MAP
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={() => setView(view === "report" ? "map" : "report")} style={btnStyle}>
            {view === "report" ? "✕ CLOSE" : "✚ REPORT FIRE"}
          </button>
          {!isMobile && (
            <button onClick={fetchFires} style={btnStyle}>
              {status === "loading" ? "..." : "↺ REFRESH"}
            </button>
          )}
        </div>
      </header>

      <main style={{ flex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", overflow: isMobile ? "auto" : "hidden" }}>
        {view === "map" ? (
          <>
            <div style={{ flex: 2, padding: "20px", position: "relative", minHeight: "350px" }}>
              <USMap 
                fires={fires.map((f, i) => ({ ...f, visualCoords: getCoords(f.location.split(', ')[1], i) }))} 
                highlightedFire={highlightedFire} 
              />
            </div>
            <div style={sidebarStyle}>
               <div style={{ padding: "10px 15px", fontSize: "10px", color: "#444", borderBottom: "1px solid #111" }}>
                 INCIDENT LOG ({fires.length})
               </div>
               {fires.map((f, i) => (
                 <div key={f.id} onMouseEnter={() => setHighlightedFire(f)} onMouseLeave={() => setHighlightedFire(null)}
                   style={{ padding: "15px", borderBottom: "1px solid #111", background: highlightedFire?.id === f.id ? "#150a05" : "transparent" }}>
                   <div style={{ color: FIRE_COLORS[i % 5], fontWeight: "bold", fontSize: "13px" }}>{f.location}</div>
                   <div style={{ fontSize: "11px", color: "#888", marginTop: "4px" }}>{f.facility_type} — {f.date_occurred}</div>
                   {f.url && <a href={f.url} target="_blank" style={{ fontSize: "10px", color: "#ff6a00", textDecoration: "none", display: "block", marginTop: "6px" }}>View Source →</a>}
                 </div>
               ))}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, padding: "40px 20px", display: "flex", justifyContent: "center", overflowY: "auto" }}>
            <form onSubmit={handleSubmit} style={{ width: "100%", maxWidth: "450px", display: "flex", flexDirection: "column", gap: "15px" }}>
              <h2 style={{ color: "#ff4500" }}>Submit New Incident</h2>
              <input name="admin_password" type="password" placeholder="Admin Password (Optional)" style={inputStyle} />
              <input name="title" placeholder="Incident Title" required style={inputStyle} />
              <input name="location" placeholder="City, ST (e.g. Chicago, IL)" required style={inputStyle} />
              <input name="facility_type" placeholder="Facility Type" style={inputStyle} />
              <input name="date_occurred" type="date" required style={inputStyle} />
              <input name="url" placeholder="News Article URL" style={inputStyle} />
              <button type="submit" disabled={status === "saving"} style={{ ...btnStyle, background: "#ff4500", color: "white", padding: "15px" }}>
                {status === "saving" ? "SAVING..." : "SUBMIT FOR REVIEW"}
              </button>
            </form>
          </div>
        )}
      </main>

      <footer style={footerStyle}>
        <span>&copy; {new Date().getFullYear()} FIRE TRACKER</span>
        <span onClick={() => window.location.href='/admin'} style={{ cursor: 'pointer', marginLeft: "15px" }}>MODERATION PANEL</span>
      </footer>
    </div>
  );
}

function USMap({ fires, highlightedFire }) {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <img src="/us-map.svg" alt="US Map" style={{ width: "100%", height: "auto", opacity: 0.15, filter: "invert(1)" }} />
      {fires.map((fire, i) => {
        const [x, y] = fire.visualCoords;
        const isActive = highlightedFire?.id === fire.id;
        return (
          <div key={fire.id} style={{
              position: "absolute", left: `${x}%`, top: `${y}%`,
              width: isActive ? "12px" : "8px", height: isActive ? "12px" : "8px",
              background: FIRE_COLORS[i % 5], borderRadius: "50%",
              transform: "translate(-50%, -50%)", zIndex: isActive ? 10 : 1,
              boxShadow: isActive ? `0 0 15px ${FIRE_COLORS[i % 5]}` : "none",
              transition: "all 0.2s"
            }}>
            {isActive && <div style={tooltipStyle}>{fire.location}</div>}
          </div>
        );
      })}
    </div>
  );
}

// --- STYLES ---
const containerStyle = { minHeight: "100vh", background: "#0a0a0f", color: "#e8e0d5", display: "flex", flexDirection: "column", fontFamily: "monospace" };
const headerStyle = { padding: "15px 25px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #1a1a1f" };
const sidebarStyle = { flex: 1, borderLeft: "1px solid #1a1a1f", overflowY: "auto", background: "#050508" };
const btnStyle = { background: "#1a1a1f", border: "1px solid #333", color: "#ff6a00", padding: "8px 16px", fontSize: "11px", cursor: "pointer", borderRadius: "4px" };
const inputStyle = { padding: "12px", background: "#000", border: "1px solid #333", color: "white", borderRadius: "4px", fontSize: "16px", width: "100%" };
const tooltipStyle = { position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)", background: "#000", border: "1px solid #333", padding: "4px 8px", fontSize: "10px", borderRadius: "4px", whiteSpace: "nowrap", marginBottom: "8px" };
const footerStyle = { padding: "10px", textAlign: "center", fontSize: "10px", color: "#222", borderTop: "1px solid #111" };