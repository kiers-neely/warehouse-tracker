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
  const jitterX = Math.sin(index * 137.5) * 2.2; // Slightly more jitter for better separation
  const jitterY = Math.cos(index * 137.5) * 2.2;
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
      if (!res.ok) throw new Error("API Offline");
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
      alert(payload.admin_password ? "Entry Authenticated & Added" : "Incident Logged for Review");
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
          <h1 style={titleStyle}>🔥 US WAREHOUSE FIRE TRACKER</h1>
          <p style={subtitleStyle}>CROWDSOURCED INDUSTRIAL INCIDENT MAP</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={() => setView(view === "report" ? "map" : "report")} style={btnStyle}>
            {view === "report" ? "✕ CLOSE" : "✚ REPORT FIRE"}
          </button>
          {!isMobile && (
            <button onClick={fetchFires} style={secondaryBtnStyle}>
              {status === "loading" ? "SCANNING..." : "↺ REFRESH"}
            </button>
          )}
        </div>
      </header>

      <main style={{ flex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", overflow: isMobile ? "auto" : "hidden" }}>
        {view === "map" ? (
          <>
            <div style={{ flex: 2, padding: "20px", position: "relative", minHeight: "400px" }}>
              <USMap 
                fires={fires.map((f, i) => ({ ...f, visualCoords: getCoords(f.location.split(', ')[1], i) }))} 
                highlightedFire={highlightedFire} 
              />
            </div>
            <div style={sidebarStyle}>
               <div style={sidebarHeaderStyle}>
                 INCIDENT LOG // {fires.length} ACTIVE RECORDS
               </div>
               {fires.map((f, i) => (
                 <div key={f.id} 
                   onMouseEnter={() => setHighlightedFire(f)} 
                   onMouseLeave={() => setHighlightedFire(null)}
                   style={{ 
                     ...logItemStyle, 
                     background: highlightedFire?.id === f.id ? "rgba(255, 69, 0, 0.1)" : "transparent",
                     borderColor: highlightedFire?.id === f.id ? "#ff4500" : "#111"
                   }}>
                   <div style={{ color: FIRE_COLORS[i % 5], fontWeight: "900", fontSize: "14px", textTransform: "uppercase" }}>{f.location}</div>
                   <div style={{ fontSize: "11px", color: "#666", marginTop: "2px", fontWeight: "bold" }}>{f.facility_type.toUpperCase()} — {f.date_occurred}</div>
                   {f.url && <a href={f.url} target="_blank" style={linkStyle}>DATA SOURCE →</a>}
                 </div>
               ))}
            </div>
          </>
        ) : (
          <div style={formWrapperStyle}>
            <form onSubmit={handleSubmit} style={formStyle}>
              <h2 style={{ color: "#ff4500", letterSpacing: "2px" }}>REPORT NEW INCIDENT</h2>
              <input name="admin_password" type="password" placeholder="ADMIN ACCESS KEY (OPTIONAL)" style={inputStyle} />
              <div style={divider} />
              <input name="title" placeholder="INCIDENT HEADLINE" required style={inputStyle} />
              <input name="location" placeholder="CITY, STATE (e.g. Dallas, TX)" required style={inputStyle} />
              <input name="facility_type" placeholder="FACILITY TYPE" style={inputStyle} />
              <input name="date_occurred" type="date" required style={inputStyle} />
              <input name="url" placeholder="SOURCE URL" style={inputStyle} />
              <button type="submit" disabled={status === "saving"} style={submitBtnStyle}>
                {status === "saving" ? "UPLOADING..." : "TRANSMIT DATA"}
              </button>
            </form>
          </div>
        )}
      </main>

      <footer style={footerStyle}>
        <span>SYSTEM STATUS: {status === "loading" ? "SYNCING..." : "ONLINE"} // &copy; {new Date().getFullYear()}</span>
        <span onClick={() => window.location.href='/admin'} style={{ cursor: 'pointer', marginLeft: "20px", opacity: 0.3 }}>[ ADMIN ]</span>
      </footer>
    </div>
  );
}

function USMap({ fires, highlightedFire }) {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center" }}>
      <img src="/us-map.svg" alt="US Map" style={{ width: "100%", height: "auto", opacity: 0.25, filter: "invert(1) sepia(1) saturate(5) hue-rotate(-20deg)" }} />
      {fires.map((fire, i) => {
        const [x, y] = fire.visualCoords;
        const isActive = highlightedFire?.id === fire.id;
        return (
          <div key={fire.id} style={{
              position: "absolute", left: `${x}%`, top: `${y}%`,
              width: isActive ? "14px" : "9px", height: isActive ? "14px" : "9px",
              background: FIRE_COLORS[i % 5], borderRadius: "50%",
              transform: "translate(-50%, -50%)", zIndex: isActive ? 10 : 1,
              boxShadow: `0 0 ${isActive ? '20px' : '8px'} ${FIRE_COLORS[i % 5]}`,
              transition: "all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
              border: isActive ? "2px solid white" : "none"
            }}>
            {isActive && <div style={tooltipStyle}>{fire.location.toUpperCase()}</div>}
          </div>
        );
      })}
    </div>
  );
}

// --- RESTORED STYLES ---
const containerStyle = { 
  minHeight: "100vh", 
  background: "radial-gradient(circle at 50% 50%, #150d0a 0%, #050508 100%)", 
  color: "#e8e0d5", 
  display: "flex", 
  flexDirection: "column", 
  fontFamily: "'Inter', monospace" 
};

const headerStyle = { padding: "20px 30px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #ff450033" };

const titleStyle = { 
  color: "#ff4500", 
  margin: 0, 
  fontSize: "32px", 
  fontFamily: "'Bebas Neue', sans-serif", 
  letterSpacing: "1px" 
};

const subtitleStyle = { 
  fontSize: "11px", 
  color: "#ff6a00", 
  margin: 0, 
  letterSpacing: "0.25em", 
  fontWeight: "bold",
  opacity: 0.8 
};

const sidebarStyle = { flex: 1, borderLeft: "1px solid #222", overflowY: "auto", background: "rgba(0,0,0,0.4)" };

const sidebarHeaderStyle = { padding: "12px 20px", fontSize: "10px", color: "#ff4500", borderBottom: "1px solid #222", letterSpacing: "1px", fontWeight: "bold" };

const logItemStyle = { padding: "18px", borderBottom: "1px solid #111", transition: "all 0.2s", borderLeft: "4px solid transparent" };

const btnStyle = { background: "#ff4500", border: "none", color: "white", padding: "10px 20px", fontSize: "12px", cursor: "pointer", fontWeight: "900", borderRadius: "2px", letterSpacing: "1px" };

const secondaryBtnStyle = { background: "transparent", border: "1px solid #444", color: "#888", padding: "10px 20px", fontSize: "11px", cursor: "pointer", borderRadius: "2px" };

const inputStyle = { padding: "14px", background: "#000", border: "1px solid #333", color: "white", borderRadius: "2px", fontSize: "16px", width: "100%", fontFamily: "monospace" };

const tooltipStyle = { position: "absolute", bottom: "150%", left: "50%", transform: "translateX(-50%)", background: "#ff4500", color: "white", padding: "5px 10px", fontSize: "11px", fontWeight: "bold", borderRadius: "2px", whiteSpace: "nowrap", boxShadow: "0 5px 15px rgba(0,0,0,0.5)" };

const footerStyle = { padding: "15px", textAlign: "center", fontSize: "10px", color: "#444", borderTop: "1px solid #111", letterSpacing: "2px" };

const formWrapperStyle = { flex: 1, padding: "40px", display: "flex", justifyContent: "center", overflowY: "auto" };

const formStyle = { width: "100%", maxWidth: "500px", display: "flex", flexDirection: "column", gap: "18px" };

const submitBtnStyle = { ...btnStyle, padding: "18px", fontSize: "14px", marginTop: "10px" };

const linkStyle = { fontSize: "10px", color: "#ff6a00", textDecoration: "none", display: "inline-block", marginTop: "10px", borderBottom: "1px solid #ff6a00" };

const divider = { height: "1px", background: "#222", margin: "10px 0" };