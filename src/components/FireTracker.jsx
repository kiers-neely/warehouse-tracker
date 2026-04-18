"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const POLL_INTERVAL_MS = 5 * 60 * 1000;

// Pixel-percentage centers calibrated to the 959x593 Albers Equal Area SVG.
// Stored as [x%, y%] so no projection conversion is needed.
const US_STATES_COORDS = {
  AL: [62.0, 74.0], AK: [14.0, 88.0], AZ: [22.4, 65.0], AR: [55.0, 67.5],
  CA: [12.0, 52.0], CO: [33.5, 51.5], CT: [84.5, 31.5], DE: [83.0, 40.5],
  FL: [68.5, 83.5], GA: [67.0, 73.5], HI: [27.0, 91.0], ID: [21.5, 30.5],
  IL: [59.5, 50.0], IN: [63.0, 47.0], IA: [53.5, 42.5], KS: [44.5, 55.5],
  KY: [65.5, 55.0], LA: [55.5, 78.5], ME: [88.0, 19.5], MD: [80.5, 43.5],
  MA: [85.5, 28.0], MI: [63.5, 34.5], MN: [51.5, 27.5], MS: [59.0, 75.5],
  MO: [55.5, 57.0], MT: [27.5, 23.5], NE: [43.0, 45.5], NV: [17.5, 49.0],
  NH: [85.0, 24.5], NJ: [82.5, 36.5], NM: [31.0, 66.5], NY: [79.0, 30.0],
  NC: [74.5, 59.5], ND: [43.5, 24.0], OH: [69.0, 43.5], OK: [45.0, 65.5],
  OR: [14.5, 32.5], PA: [77.5, 37.5], RI: [86.0, 30.5], SC: [72.0, 65.5],
  SD: [43.0, 36.0], TN: [63.5, 62.5], TX: [45.5, 73.0], UT: [25.5, 51.0],
  VT: [83.5, 24.0], VA: [76.5, 51.0], WA: [14.5, 20.0], WV: [73.0, 48.5],
  WI: [58.0, 33.5], WY: [31.0, 37.5], DC: [80.5, 44.5],
};

const FIRE_COLORS = ["#ff4500", "#ff6a00", "#ff8c00", "#ffa500", "#ffcc00"];

function parseFiresFromText(text) {
  const fires = [];
  const lines = text.split("\n").filter((l) => l.trim());
  for (const line of lines) {
    const match = line.match(/^-?\s*(.+?),\s*([A-Z]{2})\s*\|([^|]+)\|([^|]+)\|(.+)$/);
    if (match) {
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
  const [nextScan, setNextScan] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [hoveredFire, setHoveredFire] = useState(null);
  const [highlightedFire, setHighlightedFire] = useState(null);
  const timerRef = useRef(null);
  const countdownRef = useRef(null);
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

      const { text } = data;
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
      setNextScan(new Date(Date.now() + POLL_INTERVAL_MS));
      setStatus("idle");
    } catch (e) {
      setStatus("error");
      setErrorMsg(e.message);
    }
  }, []);

  useEffect(() => {
    scan();
  }, []); // eslint-disable-line

  useEffect(() => {
    if (status === "idle" && nextScan) {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => scan(), POLL_INTERVAL_MS);
    }
    return () => clearTimeout(timerRef.current);
  }, [status, nextScan, scan]);

  useEffect(() => {
    if (!nextScan) return;
    const tick = () => {
      const diff = Math.max(0, nextScan - Date.now());
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setCountdown(`${mins}:${secs.toString().padStart(2, "0")}`);
    };
    tick();
    countdownRef.current = setInterval(tick, 1000);
    return () => clearInterval(countdownRef.current);
  }, [nextScan]);

  const firesWithCoords = fires.map((f, i) => ({
    ...f,
    coords: getCoords(f.state, i),
  }));

  return (
    <div style={{
      minHeight: "100vh",
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
        position: "sticky",
        top: 0,
        zIndex: 100,
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
              {countdown && status !== "scanning" && (
                <div style={{ fontSize: 9, color: "#503020" }}>NEXT SCAN: {countdown}</div>
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

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
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
          {hoveredFire && (
            <div style={{
              position: "absolute", bottom: 20, left: 20,
              background: "#0f0805ee", border: "1px solid #3a1a0a",
              borderLeft: "3px solid #ff4500", padding: "10px 14px",
              fontSize: 11, maxWidth: 280, backdropFilter: "blur(4px)",
            }}>
              <div style={{ color: "#ff4500", fontWeight: 500, marginBottom: 4 }}>
                {hoveredFire.location}, {hoveredFire.state}
              </div>
              <div style={{ color: "#9a7060", marginBottom: 2 }}>{hoveredFire.facility}</div>
              <div style={{ color: "#6a5040" }}>{hoveredFire.date}</div>
              <div style={{ color: "#5a4030", marginTop: 4, fontSize: 10, lineHeight: 1.4 }}>{hoveredFire.source}</div>
            </div>
          )}
        </div>

        {/* Log */}
        <div style={{ flex: "0 0 45%", overflowY: "auto", display: "flex", flexDirection: "column" }}>
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
        <span>DATA SOURCED VIA WEB SEARCH · NOT OFFICIAL EMERGENCY SERVICES DATA</span>
        <span>AUTO-REFRESH EVERY 5 MIN</span>
      </div>
    </div>
  );
}


function USMap({ fires, hoveredFire, setHoveredFire, highlightedFire }) {
  return (
    <div style={{
      position: "relative", width: "100%", borderRadius: 4, overflow: "hidden",
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
