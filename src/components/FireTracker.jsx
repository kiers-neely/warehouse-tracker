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

// Albers Equal Area Conic projection calibrated to the 959×593 SVG.
// Parameters: parallels 29.5°/45.5°N, central meridian 96°W, ref lat 37.5°N.
// Linear scale/offset derived by least-squares fit against known state centroids.
function latLngToSVG(lat, lng) {
  const n = 0.6029, C = 1.3516, rho0 = 1.3031;
  const phi = lat * Math.PI / 180;
  const theta = n * (lng + 96) * Math.PI / 180;
  const rho = Math.sqrt(Math.max(0, C - 2 * n * Math.sin(phi))) / n;
  return [
    134 * rho * Math.sin(theta) + 50.5,
    -205 * (rho0 - rho * Math.cos(theta)) + 54.8,
  ];
}

// State-center fallback with jitter to separate stacked dots.
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
  const geoCacheRef = useRef({});

  // Load persisted geocode cache from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem("fire-geo-cache");
      if (raw) geoCacheRef.current = JSON.parse(raw);
    } catch {}
  }, []);

  // Geocode any fires that don't have a cached city-level position yet.
  // Runs sequentially with 1.1s gaps to respect Nominatim's 1 req/s policy.
  // Dots start at the state center and move to the accurate position once resolved.
  useEffect(() => {
    if (fires.length === 0) return;
    const toGeocode = fires
      .map(f => {
        const city = f.location?.replace(/,\s*[A-Z]{2}$/, "").trim();
        const state = f.state;
        return { city, state, key: `${city}|${state}` };
      })
      .filter(({ city, state, key }) => city && state && !geoCacheRef.current[key]);

    if (toGeocode.length === 0) return;

    (async () => {
      for (let i = 0; i < toGeocode.length; i++) {
        const { city, state, key } = toGeocode[i];
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city + ", " + state + ", USA")}&format=json&limit=1`,
            { headers: { "User-Agent": "fire-tracker/1.0" }, signal: AbortSignal.timeout(8000) }
          );
          const data = await res.json();
          if (data[0]) {
            geoCacheRef.current[key] = latLngToSVG(+data[0].lat, +data[0].lon);
            try { localStorage.setItem("fire-geo-cache", JSON.stringify(geoCacheRef.current)); } catch {}
            setFires(prev => [...prev]); // trigger re-render with new position
          }
        } catch {}
        if (i < toGeocode.length - 1) await new Promise(r => setTimeout(r, 1100));
      }
    })();
  }, [fires.length]); // re-run only when the number of fires changes

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
      setFires(data.incidents.filter(incident => incident.status === 'approved') || []);
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
      alert("Thank you! Submission sent for review.");
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
      <header
        style={
          isMobile
            ? {
                borderBottom: "1px solid #2a1a0f",
                padding: "14px 8px 10px 8px",
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                background: "linear-gradient(180deg,#120a05 0%,transparent 100%)",
                gap: 8,
              }
            : {
                borderBottom: "1px solid #2a1a0f",
                padding: "20px 32px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "linear-gradient(180deg,#120a05 0%,transparent 100%)",
              }
        }
      >
        <div onClick={() => setView("map")} style={{ cursor: "pointer", marginBottom: isMobile ? 8 : 0 }}>
          <div
            style={{
              fontFamily: "'Bebas Neue',sans-serif",
              fontSize: isMobile ? "clamp(28px,10vw,44px)" : "clamp(20px,4vw,44px)",
              color: "#ff4500",
              letterSpacing: "0.1em",
              textAlign: isMobile ? "center" : undefined,
              width: isMobile ? "100%" : undefined,
              lineHeight: 1.05,
            }}
          >
            🔥 US WAREHOUSE FIRE TRACKER
          </div>
          <div style={{ fontSize: "9px", color: "#a07868", letterSpacing: "0.2em", textAlign: isMobile ? "center" : undefined }}>
            CROWDSOURCED INDUSTRIAL INCIDENT MAP
          </div>
        </div>

        {isMobile ? (
          <div style={{ display: "flex", flexDirection: "row", gap: 8, marginBottom: 8 }}>
            <button onClick={() => setView(view === "report" ? "map" : "report")} style={navBtnStyle}>
              {view === "report" ? "✕ CLOSE" : "✚ REPORT FIRE"}
            </button>
            <button onClick={fetchApprovedFires} style={navBtnStyle}>↺ REFRESH</button>
            <div style={{ background: "#1a0a05", border: "1px solid #ff4500", borderRadius: 6, padding: "4px 14px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, color: "#8a6a55", letterSpacing: "0.1em", fontWeight: 500 }}>FIRES TRACKED:</span>
              <span style={{ fontSize: "clamp(18px, 4vw, 32px)", color: "#ff4500", fontFamily: "'Bebas Neue',sans-serif", fontWeight: "bold", marginLeft: 4 }}>{fires.length}</span>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 15, alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={() => setView(view === "report" ? "map" : "report")} style={navBtnStyle}>
                {view === "report" ? "✕ CLOSE" : "✚ REPORT FIRE"}
              </button>
              <button onClick={fetchApprovedFires} style={navBtnStyle}>↺ REFRESH</button>
            </div>
            <div style={{ background: "#1a0a05", border: "1px solid #ff4500", borderRadius: 6, padding: "4px 14px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, color: "#8a6a55", letterSpacing: "0.1em", fontWeight: 500 }}>FIRES TRACKED:</span>
              <span style={{ fontSize: "clamp(18px, 4vw, 32px)", color: "#ff4500", fontFamily: "'Bebas Neue',sans-serif", fontWeight: "bold", marginLeft: 4 }}>{fires.length}</span>
            </div>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", overflow: "hidden" }}>
        
        {view === "map" ? (
          <>
            {/* Map Column */}
            <div style={{ flex: isMobile ? "0 0 300px" : "0 0 60%", borderRight: "1px solid #1a0f08", position: "relative", padding: 20 }}>
               <USMap
                fires={fires.map((f, i) => {
                  const state = f.state || (f.location?.match(/,\s*([A-Z]{2})$/)?.[1] ?? null);
                  const city = f.location?.replace(/,\s*[A-Z]{2}$/, "").trim();
                  const geoKey = `${city}|${state}`;
                  const geoCoords = geoCacheRef.current[geoKey];
                  // Use accurate geocoded city position when available; jitter only for same-city overlaps
                  const coords = geoCoords
                    ? [geoCoords[0] + Math.sin(i * 137.5) * 0.5, geoCoords[1] + Math.cos(i * 137.5) * 0.5]
                    : getCoords(state, i);
                  return { ...f, state, coords };
                })}
                hoveredFire={hoveredFire} setHoveredFire={setHoveredFire}
                highlightedFire={highlightedFire} isMobile={isMobile}
               />
            </div>

            {/* Log Column */}
            <div style={{ flex: isMobile ? "1" : "0 0 40%", overflowY: "auto", background: "#050508" }}>
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
               <h2 style={{ color: "#ff4500", marginBottom: 20 }}>Report an Incident</h2>
               <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 15 }}>
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
        <span onClick={() => window.location.href = "/admin"} style={{ cursor: "pointer" }}> ADMIN LOGIN</span>
      </footer>
    </div>
  );
}

// --- SUB-COMPONENTS ---

function USMap({ fires, hoveredFire, setHoveredFire, highlightedFire, isMobile }) {
  return (
    <div style={{ position: "relative", width: "100%", background: "radial-gradient(circle, rgba(255, 69, 0, 0.08) 0%, rgba(255, 107, 0, 0.03) 40%, transparent 50%)" }}>
      <style>{`
        @keyframes scanBeam {
          0% { left: -5%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { left: 105%; opacity: 0; }
        }
        @keyframes breathe {
          0%, 100% { box-shadow: 0 0 0px rgba(255, 107, 0, 0), inset 0 0 0px rgba(255, 107, 0, 0); }
          50% { box-shadow: 0 0 8px rgba(255, 107, 0, 0.4), inset 0 0 4px rgba(255, 107, 0, 0.2); }
        }
        .scan-beam {
          position: absolute;
          top: 0;
          width: 2px;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 107, 0, 0.6), transparent);
          box-shadow: 0 0 20px rgba(255, 107, 0, 0.4);
          animation: scanBeam 6s ease-in-out infinite;
          pointer-events: none;
          z-index: 0;
        }
        .fire-marker-breathing {
          animation: breathe 0.8s ease-in-out infinite;
        }
      `}</style>
      <div className="scan-beam"></div>
      <img src="/us-map.svg" alt="US Map" style={{ width: "100%", opacity: 0.3, filter: "invert(1)" }} />
      {fires.map((fire, i) => {
        if (!fire.coords || fire.state === "AK" || fire.state === "HI") return null;
        const [x, y] = fire.coords;
        if (x < 0 || x > 100 || y < 0 || y > 100) return null;
        const active = highlightedFire?.id === fire.id || hoveredFire?.id === fire.id;
        return (
          <div key={fire.id}
            onMouseEnter={() => setHoveredFire(fire)}
            onMouseLeave={() => setHoveredFire(null)}
            className="fire-marker-breathing"
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