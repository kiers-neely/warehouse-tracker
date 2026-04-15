"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const FIRE_COLORS = ["#ff4500", "#ff6a00", "#ff8c00", "#ffa500", "#ffcc00"];

const STATE_CENTROIDS = {
  AL: [32.8, -86.8], AK: [64.2, -153.4], AZ: [34.3, -111.1], AR: [34.8, -92.2],
  CA: [36.8, -119.4], CO: [39.1, -105.4], CT: [41.6, -72.7], DE: [39.0, -75.5],
  FL: [27.8, -81.6], GA: [32.2, -83.4], HI: [19.9, -155.6], ID: [44.4, -114.5],
  IL: [40.0, -89.2], IN: [39.9, -86.3], IA: [42.1, -93.2], KS: [38.5, -96.7],
  KY: [37.7, -84.9], LA: [31.2, -91.8], ME: [44.7, -69.4], MD: [39.0, -76.8],
  MA: [42.3, -71.8], MI: [44.3, -85.4], MN: [46.4, -93.1], MS: [32.7, -89.7],
  MO: [38.4, -92.5], MT: [47.0, -110.5], NE: [41.5, -99.9], NV: [38.4, -117.1],
  NH: [43.7, -71.6], NJ: [40.1, -74.5], NM: [34.8, -106.2], NY: [42.9, -75.5],
  NC: [35.5, -79.4], ND: [47.5, -100.5], OH: [40.4, -82.8], OK: [35.6, -97.5],
  OR: [44.1, -120.5], PA: [40.9, -77.8], RI: [41.7, -71.5], SC: [33.9, -80.9],
  SD: [44.4, -100.2], TN: [35.9, -86.7], TX: [31.1, -97.6], UT: [39.3, -111.1],
  VT: [44.0, -72.7], VA: [37.8, -79.5], WA: [47.4, -120.5], WV: [38.6, -80.6],
  WI: [44.3, -89.8], WY: [42.8, -107.5], DC: [38.9, -77.0],
};

const MAP_W = 800, MAP_H = 496;
const LNG_MIN = -124.733253, LNG_MAX = -66.949895;
const LAT_MAX = 49.384358, LAT_MIN = 24.396308;

function project(lat, lng) {
  const x = ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * MAP_W;
  const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * MAP_H;
  return [x, y];
}

function getCoords(state, index) {
  const base = STATE_CENTROIDS[state];
  if (!base) return null;
  const j1 = Math.sin(index * 137.5) * 0.4;
  const j2 = Math.cos(index * 137.5) * 0.4;
  return [base[0] + j1, base[1] + j2];
}

function parseFiresFromText(text) {
  const fires = [];
  for (const line of text.split("\n").filter(l => l.trim())) {
    const fullMatch = line.match(/^-?\s*(.+?),\s*([A-Z]{2})\s*\|([^|]+)\|([^|]+)\|([^|]+)\|(.+)$/);
    const legacyMatch = line.match(/^-?\s*(.+?),\s*([A-Z]{2})\s*\|([^|]+)\|([^|]+)\|(.+)$/);
    if (fullMatch) {
      fires.push({
        id: `${Date.now()}-${Math.random()}`,
        location: fullMatch[1].trim(), state: fullMatch[2].trim(), date: fullMatch[3].trim(),
        facility: fullMatch[4].trim(), building: fullMatch[5].trim(), source: fullMatch[6].trim(), isNew: true,
      });
    } else if (legacyMatch) {
      fires.push({
        id: `${Date.now()}-${Math.random()}`,
        location: legacyMatch[1].trim(), state: legacyMatch[2].trim(), date: legacyMatch[3].trim(),
        facility: legacyMatch[4].trim(), building: "",
        source: legacyMatch[5].trim(), isNew: true,
      });
    }
  }
  return fires;
}

export default function FireTracker() {
  const [fires, setFires] = useState([]);
  const [status, setStatus] = useState("idle");
  const [lastScan, setLastScan] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [articleCount, setArticleCount] = useState(null);
  const [incidentCount, setIncidentCount] = useState(null);
  const [hoveredFire, setHoveredFire] = useState(null);
  const [highlightedFire, setHighlightedFire] = useState(null);
  const firesRef = useRef(fires);
  firesRef.current = fires;
  const scanningRef = useRef(false); // prevents duplicate concurrent scans

  const scan = useCallback(async () => {
    if (scanningRef.current) return; // bail if already scanning
    scanningRef.current = true;
    setStatus("scanning");
    setErrorMsg(null);
    setArticleCount(null);
    setIncidentCount(null);
    try {
      const existingLocations = firesRef.current.map(f => `${f.location}, ${f.state}${f.building ? ` | ${f.building}` : ""}`);
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ existingLocations }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unknown server error");
      setArticleCount(data.articleCount ?? null);
      setIncidentCount(data.incidentCount ?? null);
      if (data.text && !data.text.includes("NO_NEW_FIRES")) {
        const newFires = parseFiresFromText(data.text);
        if (newFires.length > 0) {
          setFires(prev => {
            const keys = new Set(prev.map(f => `${(f.building || f.location).toLowerCase()}-${f.state}-${f.date}`));
            return [
              ...newFires.filter(f => !keys.has(`${(f.building || f.location).toLowerCase()}-${f.state}-${f.date}`)),
              ...prev.map(f => ({ ...f, isNew: false })),
            ];
          });
        }
      }
      setLastScan(new Date());
      setStatus("idle");
    } catch (e) {
      setStatus("error");
      setErrorMsg(e.message);
    } finally {
      scanningRef.current = false; // always release lock
    }
  }, []);


  const firesWithCoords = fires.map((f, i) => ({ ...f, coords: getCoords(f.state, i) }));

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e8e0d5", fontFamily: "'DM Mono','Courier New',monospace", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #2a1a0f", padding: "20px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "linear-gradient(180deg,#120a05 0%,transparent 100%)", position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(8px)" }}>
        <div>
          <div className="header-title" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(22px,4vw,38px)", letterSpacing: "0.12em", color: "#ff4500", lineHeight: 1 }}>
            🔥 US WAREHOUSE FIRE TRACKER
          </div>
          <div style={{ fontSize: 10, color: "#6b5040", letterSpacing: "0.2em", marginTop: 4 }}>
            INDUSTRIAL & MANUFACTURING FACILITY INCIDENTS · NATIONWIDE
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 11, color: "#8a6050" }}>
          <div style={{ background: "#1a0a05", border: "1px solid #2a1505", borderRadius: 4, padding: "6px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div style={{ color: "#ff4500", fontFamily: "'Bebas Neue'", fontSize: 28, lineHeight: 1 }}>{fires.length}</div>
            <div style={{ fontSize: 9, letterSpacing: "0.15em", color: "#6b4030" }}>INCIDENTS</div>
          </div>
          <div style={{ textAlign: "right" }}>
            {status === "scanning"
              ? <div style={{ color: "#ff8c00", display: "flex", alignItems: "center", gap: 6 }}><span className="spin-icon">◌</span> SCANNING...</div>
              : status === "error" ? <div style={{ color: "#ff3333" }}>⚠ SCAN ERROR</div>
              : <div style={{ color: "#4a7a4a" }}>● LIVE</div>}
            {lastScan && <div style={{ fontSize: 9, marginTop: 3, color: "#503020" }}>LAST: {lastScan.toLocaleTimeString()}</div>}
            {articleCount != null && incidentCount != null && (
              <div style={{ fontSize: 9, marginTop: 3, color: "#6b5040" }}>
                Scanned {articleCount} headlines · found {incidentCount} incidents
              </div>
            )}
            <button onClick={scan} disabled={status === "scanning"} style={{ marginTop: 6, background: "transparent", border: "1px solid #2a1505", color: status === "scanning" ? "#503020" : "#ff6a00", padding: "3px 10px", fontSize: 9, letterSpacing: "0.1em", cursor: status === "scanning" ? "not-allowed" : "pointer", borderRadius: 2, display: "block", width: "100%" }}>
              {status === "scanning" ? "SCANNING..." : "↺ SCAN NOW"}
            </button>
          </div>
        </div>
      </div>

      {errorMsg && <div style={{ background: "#1a0505", borderBottom: "1px solid #3a0505", padding: "8px 32px", fontSize: 11, color: "#ff5555" }}>⚠ {errorMsg}</div>}

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Map */}
        <div style={{ flex: "0 0 60%", borderRight: "1px solid #1a0f08", position: "relative", overflow: "hidden", background: "#05080f" }}>
          {status === "scanning" && (
            <div style={{ position: "absolute", inset: 0, zIndex: 10, pointerEvents: "none", overflow: "hidden" }}>
              <div style={{ position: "absolute", left: 0, right: 0, height: 2, background: "linear-gradient(90deg,transparent,#ff450055,#ff4500,#ff450055,transparent)", animation: "scan-line 2s linear infinite" }} />
              <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,69,0,0.015) 3px,rgba(255,69,0,0.015) 4px)" }} />
            </div>
          )}
          <div style={{ padding: "12px 16px" }}>
            <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#2a1a10", marginBottom: 8 }}>INCIDENT MAP · UNITED STATES</div>
            <USMap fires={firesWithCoords} hoveredFire={hoveredFire} setHoveredFire={setHoveredFire} highlightedFire={highlightedFire} />
          </div>
          {hoveredFire && (
            <div style={{ position: "absolute", bottom: 20, left: 20, background: "#0f0805ee", border: "1px solid #3a1a0a", borderLeft: "3px solid #ff4500", padding: "10px 14px", fontSize: 11, maxWidth: 280, backdropFilter: "blur(4px)" }}>
              <div style={{ color: "#ff4500", fontWeight: 500, marginBottom: 4 }}>{hoveredFire.location}, {hoveredFire.state}</div>
              <div style={{ color: "#9a7060", marginBottom: 2 }}>{hoveredFire.facility}{hoveredFire.building ? ` · ${hoveredFire.building}` : ""}</div>
              <div style={{ color: "#6a5040" }}>{hoveredFire.date}</div>
              <div style={{ color: "#5a4030", marginTop: 4, fontSize: 10, lineHeight: 1.4 }}>{hoveredFire.source}</div>
            </div>
          )}
        </div>

        {/* Log */}
        <div style={{ flex: "0 0 40%", overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "12px 20px", borderBottom: "1px solid #1a0f08", fontSize: 9, letterSpacing: "0.2em", color: "#2a1a10", position: "sticky", top: 0, background: "#0a0a0f", zIndex: 5, display: "flex", justifyContent: "space-between" }}>
            <span>INCIDENT LOG</span><span>{fires.length} TOTAL</span>
          </div>
          {fires.length === 0 && status === "idle" && (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "#e8e0d5", fontSize: 13, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, minHeight: "280px" }}>
              <div style={{ maxWidth: 260, lineHeight: 1.6, color: "#d4b090" }}>
                No incidents found yet.
                <div style={{ marginTop: 8, color: "#8a6050", fontSize: 11 }}>
                  Tap the button below to search current news headlines for warehouse and industrial fires.
                </div>
              </div>
              <button onClick={scan} style={{ background: "#ff4500", border: "none", color: "#fff", padding: "14px 24px", fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", borderRadius: 4, cursor: "pointer", boxShadow: "0 10px 24px rgba(255,69,0,0.24)" }}>
                SCAN NOW
              </button>
            </div>
          )}
          {fires.length === 0 && status === "scanning" && (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "#6a4020", fontSize: 12 }}>
              <div className="spin-icon" style={{ fontSize: 24, display: "block", marginBottom: 12 }}>◌</div>
              Searching news for warehouse fire reports...
            </div>
          )}
          {fires.map((fire, i) => (
            <div key={fire.id} className={`fire-row${fire.isNew ? " fire-row-new" : ""}`}
              style={{ padding: "12px 20px", borderBottom: "1px solid #120d09", borderLeft: fire.isNew ? "2px solid #ff4500" : "2px solid transparent", transition: "background 0.2s", background: highlightedFire?.id === fire.id ? "rgba(255,69,0,0.06)" : "transparent" }}
              onMouseEnter={() => setHighlightedFire(fire)} onMouseLeave={() => setHighlightedFire(null)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: FIRE_COLORS[i % FIRE_COLORS.length], display: "inline-block", flexShrink: 0 }} />
                  <span style={{ fontWeight: 500, color: "#d4b090", fontSize: 12 }}>{fire.location}, {fire.state}</span>
                </div>
                <span style={{ fontSize: 10, color: "#4a3020", flexShrink: 0, marginLeft: 8 }}>{fire.date}</span>
              </div>
              <div style={{ fontSize: 11, color: "#7a5a40", marginLeft: 16, marginBottom: 2 }}>{fire.facility}{fire.building ? ` · ${fire.building}` : ""}</div>
              <div style={{ fontSize: 10, color: "#4a3020", marginLeft: 16, lineHeight: 1.4 }}>{fire.source}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ borderTop: "1px solid #150f08", padding: "8px 32px", fontSize: 9, color: "#2a1a10", display: "flex", justifyContent: "space-between", letterSpacing: "0.1em" }}>
        <span>DATA SOURCED VIA WEB SEARCH · NOT OFFICIAL EMERGENCY SERVICES DATA</span>
        <span>SCAN ON DEMAND</span>
      </div>
    </div>
  );
}

function USMap({ fires, hoveredFire, setHoveredFire, highlightedFire }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  // Put your map file in /public/us-map.svg (or .png)
  const MAP_URL = "/us-map.svg";

  return (
    <div style={{ position: "relative", lineHeight: 0, borderRadius: 6, overflow: "hidden", background: "#0d1e30" }}>
      <img
        src={MAP_URL}
        alt="US Map"
        onLoad={() => {
          setImgLoaded(true);
          setImgError(false);
        }}
        onError={() => {
          setImgError(true);
          setImgLoaded(false);
        }}
        style={{ width: "100%", height: "auto", display: "block", opacity: imgLoaded ? 0.75 : 0, transition: "opacity 0.5s" }}
      />

      {imgLoaded && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(5,8,15,0.45)", pointerEvents: "none" }} />
      )}

      {imgError && (
        <div style={{ width: "100%", paddingTop: "62%", position: "relative", background: "#0d1e30", border: "1px solid #1e3d5a", borderRadius: 6 }}>
          <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", color: "#2a4060", fontSize: 11, fontFamily: "monospace" }}>MAP UNAVAILABLE — add us-map.svg to /public</span>
        </div>
      )}

      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <defs>
          <filter id="dotglow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {fires.map((fire, i) => {
          if (!fire.coords) return null;
          const [lat, lng] = fire.coords;
          if (fire.state === "AK" || fire.state === "HI") return null;
          const [x, y] = project(lat, lng);
          if (x < 0 || x > MAP_W || y < 0 || y > MAP_H) return null;
          const isHighlighted = highlightedFire?.id === fire.id || hoveredFire?.id === fire.id;
          const color = FIRE_COLORS[i % FIRE_COLORS.length];
          const r = isHighlighted ? 10 : 7;
          return (
            <g key={fire.id} onMouseEnter={() => setHoveredFire(fire)} onMouseLeave={() => setHoveredFire(null)} style={{ cursor: "pointer" }}>
              {fire.isNew && (
                <circle cx={x} cy={y} fill="none" stroke={color} strokeWidth="2">
                  <animate attributeName="r" values={`${r};${r + 16};${r}`} dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.8;0;0.8" dur="2s" repeatCount="indefinite" />
                </circle>
              )}
              <circle cx={x} cy={y} r={r + 5} fill={color} opacity={isHighlighted ? 0.25 : 0.12} />
              <circle cx={x} cy={y} r={r} fill={color} filter="url(#dotglow)" />
              <circle cx={x} cy={y} r={r * 0.3} fill="white" opacity="0.9" />
            </g>
          );
        })}

        <g transform="translate(12,12)">
          <rect width="122" height="28" fill="rgba(6,8,14,0.88)" stroke="#1a2535" strokeWidth="0.5" rx="3" />
          <circle cx="15" cy="14" r="5" fill="#ff4500" />
          <circle cx="15" cy="14" r="1.5" fill="white" opacity="0.9" />
          <text x="26" y="18" fontSize="7.5" fill="#8a5030" fontFamily="monospace" letterSpacing="0.08em">FIRE INCIDENT</text>
        </g>
        <text x={MAP_W - 8} y={MAP_H - 8} textAnchor="end" fontSize="7" fill="#2a3040" fontFamily="monospace">AK/HI NOT SHOWN</text>
      </svg>
    </div>
  );
}