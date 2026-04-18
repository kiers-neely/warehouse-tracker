"use client";

import { useState, useEffect, useRef, useCallback } from "react";


// [x%, y%] centers derived by parsing actual path bounding boxes from the 959x593 SVG.
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

const US_STATES = new Set(Object.keys(US_STATES_COORDS));

function parseFiresFromText(text) {
  const fires = [];
  const lines = text.split("\n").filter((l) => l.trim());
  for (const line of lines) {
    const match = line.match(/^-?\s*(.+?),\s*([A-Z]{2})\s*\|([^|]+)\|([^|]+)\|(.+)$/);
    if (match && US_STATES.has(match[2].trim())) {
      fires.push({
        id: `${Date.now()}-${Math.random()}`,
        location: match[1].trim(),
        state: match[2].trim(),
        date: match[3].trim(),
        facility: match[4].trim(),
        source: match[5].trim(),
        isNew: true,
      });
    }
  }
  return fires;
}

// Returns [x%, y%] with slight jitter to separate overlapping dots in the same state.
function getCoords(state, index) {
  const base = US_STATES_COORDS[state];
  if (!base) return null;
  const jitter  = Math.sin(index * 137.5) * 1.2;
  const jitter2 = Math.cos(index * 137.5) * 1.2;
  return [base[0] + jitter, base[1] + jitter2];
}


export default function FireTracker() {
  const [fires, setFires] = useState([]);
  const [status, setStatus] = useState("idle");
  const [lastScan, setLastScan] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [hoveredFire, setHoveredFire] = useState(null);
  const [highlightedFire, setHighlightedFire] = useState(null);
  const firesRef = useRef(fires);
  firesRef.current = fires;

  const scan = useCallback(async () => {
    setStatus("scanning");
    setErrorMsg(null);
    try {
      const existingLocations = firesRef.current.map((f) => `${f.location}, ${f.state}`);
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ existingLocations }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unknown server error");

      const { text, articleCount } = data;
      if (articleCount === 0) {
        setErrorMsg("GDELT returned 0 articles — try again shortly");
      }
      if (text && text !== "NO_NEW_FIRES") {
        const newFires = parseFiresFromText(text);
        if (newFires.length > 0) {
          setFires((prev) => {
            const existingKeys = new Set(prev.map((f) => `${f.location}-${f.state}-${f.date}`));
            const unique = newFires.filter(
              (f) => !existingKeys.has(`${f.location}-${f.state}-${f.date}`)
            );
            return [...unique, ...prev.map((f) => ({ ...f, isNew: false }))];
          });
        }
      }
      setLastScan(new Date());
      setStatus("idle");
    } catch (e) {
      setStatus("error");
      setErrorMsg(e.message);
    }
  }, []);

  useEffect(() => {
    scan();
  }, []); // eslint-disable-line


  // Restore saved incidents after mount — must use useEffect, not useState initializer,
  // because localStorage is unavailable during Next.js SSR and React reuses server state.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("firetracker-incidents");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) setFires(parsed);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem("firetracker-incidents", JSON.stringify(fires)); } catch {}
  }, [fires]);

  const firesWithCoords = fires.map((f, i) => ({
    ...f,
    coords: getCoords(f.state, i),
  }));

  return (
    <div style={{
      height: "100vh",
      overflow: "hidden",
      background: "#0a0a0f",
      color: "#e8e0d5",
      fontFamily: "'DM Mono', 'Courier New', monospace",
      display: "flex",
      flexDirection: "column",
    }}>

      {/* Header */}
      <div style={{
        borderBottom: "1px solid #2a1a0f",
        padding: "20px 32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "linear-gradient(180deg,#120a05 0%,transparent 100%)",
        flexShrink: 0,
        backdropFilter: "blur(8px)",
      }}>
        <div>
          <div className="header-title" style={{
            fontFamily: "'Bebas Neue',sans-serif",
            fontSize: "clamp(22px,4vw,38px)",
            letterSpacing: "0.12em",
            color: "#ff4500",
            lineHeight: 1,
          }}>
            🔥 US WAREHOUSE FIRE TRACKER
          </div>
          <div style={{ fontSize: "10px", color: "#6b5040", letterSpacing: "0.2em", marginTop: 4 }}>
            INDUSTRIAL & MANUFACTURING FACILITY INCIDENTS · NATIONWIDE
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 11, color: "#8a6050" }}>
            <div style={{
              background: "#1a0a05", border: "1px solid #2a1505", borderRadius: 4,
              padding: "6px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
            }}>
              <div style={{ color: "#ff4500", fontFamily: "'Bebas Neue'", fontSize: 28, lineHeight: 1 }}>
                {fires.length}
              </div>
              <div style={{ fontSize: 9, letterSpacing: "0.15em", color: "#6b4030" }}>INCIDENTS</div>
            </div>
            <div style={{ textAlign: "right" }}>
              {status === "scanning" ? (
                <div style={{ color: "#ff8c00", display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="spin-icon">◌</span> SCANNING NEWS...
                </div>
              ) : status === "error" ? (
                <div style={{ color: "#ff3333" }}>⚠ SCAN ERROR</div>
              ) : (
                <div style={{ color: "#4a7a4a" }}>● LIVE</div>
              )}
              {lastScan && (
                <div style={{ fontSize: 9, marginTop: 3, color: "#503020" }}>
                  LAST: {lastScan.toLocaleTimeString()}
                </div>
              )}
              <button onClick={scan} disabled={status === "scanning"} style={{
                marginTop: 6, background: "transparent", border: "1px solid #2a1505",
                color: status === "scanning" ? "#503020" : "#ff6a00",
                padding: "3px 10px", fontSize: 9, letterSpacing: "0.1em",
                cursor: status === "scanning" ? "not-allowed" : "pointer",
                borderRadius: 2, display: "block", width: "100%",
              }}>
                {status === "scanning" ? "SCANNING..." : "↺ SCAN NOW"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div style={{
          background: "#1a0505", borderBottom: "1px solid #3a0505",
          padding: "8px 32px", fontSize: 11, color: "#ff5555",
        }}>
          ⚠ {errorMsg}
        </div>
      )}

      <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
        {/* Map */}
        <div style={{
          flex: "0 0 55%", borderRight: "1px solid #1a0f08",
          position: "relative", overflow: "hidden", background: "#05080f",
        }}>
          {status === "scanning" && (
            <div style={{ position: "absolute", inset: 0, zIndex: 10, pointerEvents: "none", overflow: "hidden" }}>
              <div style={{
                position: "absolute", left: 0, right: 0, height: 2,
                background: "linear-gradient(90deg,transparent,#ff450055,#ff4500,#ff450055,transparent)",
                animation: "scan-line 2s linear infinite",
              }} />
              <div style={{
                position: "absolute", inset: 0,
                background: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,69,0,0.02) 3px,rgba(255,69,0,0.02) 4px)",
              }} />
            </div>
          )}
          <div style={{ padding: 16, position: "relative" }}>
            <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#2a1a10", marginBottom: 8 }}>
              INCIDENT MAP · UNITED STATES
            </div>
            <USMap
              fires={firesWithCoords}
              hoveredFire={hoveredFire}
              setHoveredFire={setHoveredFire}
              highlightedFire={highlightedFire}
            />
          </div>
        </div>

        {/* Log */}
        <div style={{ flex: "0 0 45%", overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{
            padding: "12px 20px", borderBottom: "1px solid #1a0f08", fontSize: 9,
            letterSpacing: "0.2em", color: "#2a1a10", position: "sticky", top: 0,
            background: "#0a0a0f", zIndex: 5, display: "flex", justifyContent: "space-between",
          }}>
            <span>INCIDENT LOG</span><span>{fires.length} TOTAL</span>
          </div>

          {fires.length === 0 && status === "idle" && (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "#3a2a20", fontSize: 12 }}>
              No incidents found yet.
            </div>
          )}
          {fires.length === 0 && status === "scanning" && (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "#6a4020", fontSize: 12 }}>
              <div className="spin-icon" style={{ fontSize: 24, display: "block", marginBottom: 12 }}>◌</div>
              Searching news for warehouse fire reports...
            </div>
          )}

          {fires.map((fire, i) => (
            <div
              key={fire.id}
              className={`fire-row${fire.isNew ? " fire-row-new" : ""}`}
              style={{
                padding: "12px 20px", borderBottom: "1px solid #120d09",
                borderLeft: fire.isNew ? "2px solid #ff4500" : "2px solid transparent",
                transition: "background 0.2s",
                background: highlightedFire?.id === fire.id ? "rgba(255,69,0,0.06)" : "transparent",
              }}
              onMouseEnter={() => setHighlightedFire(fire)}
              onMouseLeave={() => setHighlightedFire(null)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: FIRE_COLORS[i % FIRE_COLORS.length],
                    display: "inline-block", flexShrink: 0,
                  }} />
                  <span style={{ fontWeight: 500, color: "#d4b090", fontSize: 12 }}>
                    {fire.location}, {fire.state}
                  </span>
                </div>
                <span style={{ fontSize: 10, color: "#4a3020", flexShrink: 0, marginLeft: 8 }}>{fire.date}</span>
              </div>
              <div style={{ fontSize: 11, color: "#7a5a40", marginLeft: 16, marginBottom: 2 }}>{fire.facility}</div>
              <div style={{ fontSize: 10, color: "#4a3020", marginLeft: 16, lineHeight: 1.4 }}>{fire.source}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        borderTop: "1px solid #150f08", padding: "8px 32px", fontSize: 9, color: "#2a1a10",
        display: "flex", justifyContent: "space-between", letterSpacing: "0.1em",
      }}>
        <span>DATA SOURCED VIA GDELT NEWS INDEX · NOT OFFICIAL EMERGENCY SERVICES DATA</span>
        <span>MANUAL SCAN · CLICK ↺ SCAN NOW TO REFRESH</span>
      </div>
    </div>
  );
}


function USMap({ fires, hoveredFire, setHoveredFire, highlightedFire }) {
  return (
    <div style={{
      position: "relative", width: "100%", borderRadius: 4,
      background: "radial-gradient(ellipse 80% 60% at 50% 55%, #1a0e05 0%, #0a0800 60%, transparent 100%)",
      boxShadow: "inset 0 0 60px 10px #0a0800",
    }}>
      {/* Real US map SVG from simplemaps / wikimedia public domain */}
      <img
        src="/us-map.svg"
        alt="US Map"
        style={{
          width: "100%",
          display: "block",
          filter: "invert(1) sepia(1) saturate(0.3) hue-rotate(180deg) brightness(0.35)",
          borderRadius: 4,
          mixBlendMode: "screen",
        }}
      />

      {/* Fire dots overlaid as absolutely positioned elements */}
      {fires.map((fire, i) => {
        if (!fire.coords || fire.state === "AK" || fire.state === "HI") return null;
        const [px, py] = fire.coords;
        if (px < 0 || px > 100 || py < 0 || py > 100) return null;
        const isHighlighted = highlightedFire?.id === fire.id || hoveredFire?.id === fire.id;
        const color = FIRE_COLORS[i % FIRE_COLORS.length];
        const size = isHighlighted ? 16 : 10;

        const flipLeft = px > 65;
        const flipDown = py < 18;
        return (
          <div
            key={fire.id}
            onMouseEnter={() => setHoveredFire(fire)}
            onMouseLeave={() => setHoveredFire(null)}
            style={{
              position: "absolute",
              left: `${px}%`,
              top: `${py}%`,
              transform: "translate(-50%, -50%)",
              width: size,
              height: size,
              borderRadius: "50%",
              background: color,
              boxShadow: isHighlighted
                ? `0 0 0 3px ${color}44, 0 0 12px ${color}`
                : `0 0 0 2px ${color}33, 0 0 6px ${color}88`,
              cursor: "pointer",
              zIndex: isHighlighted ? 10 : 2,
              transition: "all 0.15s ease",
              animation: fire.isNew ? "pulse-dot 1s ease-in-out 3" : "none",
            }}
          >
            {/* White center dot */}
            <div style={{
              position: "absolute",
              inset: 0,
              margin: "auto",
              width: "35%",
              height: "35%",
              borderRadius: "50%",
              background: "rgba(255,255,255,0.7)",
            }} />
            {/* Floating tooltip */}
            {isHighlighted && (
              <div style={{
                position: "absolute",
                left: flipLeft ? "auto" : "calc(50% + 10px)",
                right: flipLeft ? "calc(50% + 10px)" : "auto",
                top: flipDown ? "calc(100% + 8px)" : "auto",
                bottom: flipDown ? "auto" : "calc(100% + 8px)",
                transform: "none",
                background: "#0f0805f0",
                border: "1px solid #3a1a0a",
                borderLeft: "2px solid #ff4500",
                padding: "6px 10px",
                borderRadius: 3,
                fontSize: 10,
                whiteSpace: "nowrap",
                pointerEvents: "none",
                zIndex: 30,
                backdropFilter: "blur(4px)",
              }}>
                <div style={{ color: "#ff6a00", fontWeight: 500 }}>{fire.location}, {fire.state}</div>
                <div style={{ color: "#9a7060", marginTop: 2 }}>{fire.facility}</div>
              </div>
            )}
          </div>
        );
      })}

      {/* Legend */}
      <div style={{
        position: "absolute", top: 8, left: 8,
        background: "#08080fee", border: "1px solid #1a1a2a",
        borderRadius: 3, padding: "5px 10px",
        display: "flex", alignItems: "center", gap: 6,
        fontSize: 9, color: "#8a5030", letterSpacing: "0.1em",
        fontFamily: "'DM Mono', monospace",
      }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff4500" }} />
        FIRE INCIDENT
      </div>
    </div>
  );
}
