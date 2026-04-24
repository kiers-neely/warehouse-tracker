"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { US_STATE_OPTIONS } from "../lib/usStates.js";
import { geoAlbersUsa } from "d3-geo";

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
const MAP_WIDTH = 930;
const MAP_HEIGHT = 600;
const US_MAP_VIEWBOX = "0 0 959 593";
const MIN_MAP_ZOOM = 1;
const MAX_MAP_ZOOM = 3.2;
const MAP_PAN_BOUND_MULTIPLIER = 1.85;
const STATE_FOCUS_ZOOM_MULTIPLIER = 1.22;
const RIGHT_CLICK_PAN_SPEED = 1.4;
const TRACKPAD_PAN_SPEED = 0.20;
const SCAN_BEAM_DURATION_MS = 6000;
const statePathCache = new Map();
const stateInteractionPathCache = [];
const STATE_VIEW_ZOOM = {
  AK: 1.35, TX: 1.65, CA: 1.75, MT: 1.9, NM: 1.95, AZ: 2,
  NV: 2, CO: 2.05, OR: 2.05, WY: 2.05, ID: 2.05, UT: 2.05,
  WA: 2.1, MN: 2.1, ND: 2.15, SD: 2.15, NE: 2.15, KS: 2.15,
  OK: 2.15, MO: 2.2, AR: 2.2, LA: 2.2, MS: 2.2, AL: 2.2,
  GA: 2.2, FL: 2.15, SC: 2.25, NC: 2.2, TN: 2.25, KY: 2.25,
  VA: 2.25, WV: 2.35, PA: 2.25, NY: 2.2, ME: 2.25, MI: 2.1,
  WI: 2.2, IA: 2.25, IL: 2.25, IN: 2.35, OH: 2.35, HI: 2.1,
};

const usProjection = geoAlbersUsa()
  .scale(1230)
  .translate([MAP_WIDTH / 2, MAP_HEIGHT / 2]);

function latLngToSVG(lat, lng) {
  const point = usProjection([lng, lat]);
  if (!point) return null;

  return [
    point[0] / MAP_WIDTH * 100,
    point[1] / MAP_HEIGHT * 100,
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

function applyStackJitter(coords, stackIndex) {
  if (stackIndex === 0) return coords;

  const angle = stackIndex * 137.5 * (Math.PI / 180);
  const radius = Math.min(2.4, 0.45 + stackIndex * 0.35);

  return [
    coords[0] + Math.cos(angle) * radius,
    coords[1] + Math.sin(angle) * radius,
  ];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampMapPan(pan, zoomLevel) {
  if (zoomLevel <= 1) return { x: 0, y: 0 };

  const maxX = ((zoomLevel - 1) / zoomLevel) * 100 * MAP_PAN_BOUND_MULTIPLIER;
  const maxY = ((zoomLevel - 1) / zoomLevel) * 100 * MAP_PAN_BOUND_MULTIPLIER;

  return {
    x: clamp(pan.x, -maxX, maxX),
    y: clamp(pan.y, -maxY, maxY),
  };
}

function getStateViewZoom(state) {
  const baseZoom = STATE_VIEW_ZOOM[state] || 2.65;
  return clamp(Number((baseZoom * STATE_FOCUS_ZOOM_MULTIPLIER).toFixed(2)), MIN_MAP_ZOOM, MAX_MAP_ZOOM);
}

function getStateViewPan(state, zoomLevel) {
  const center = US_STATES_COORDS[state];
  if (!center) return { x: 0, y: 0 };

  return clampMapPan({
    x: (50 - center[0]) * zoomLevel,
    y: (50 - center[1]) * zoomLevel,
  }, zoomLevel);
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
  const [newIncidentIds, setNewIncidentIds] = useState(new Set());
  const knownIncidentIdsRef = useRef(new Set());
  const hasLoadedIncidentsRef = useRef(false);
  const newIncidentTimerRef = useRef(null);

  // Handle Mobile Detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    return () => {
      if (newIncidentTimerRef.current) {
        clearTimeout(newIncidentTimerRef.current);
      }
    };
  }, []);

  // Fetch approved fires for the map
  const fetchApprovedFires = useCallback(async ({ playScan = false } = {}) => {
    setStatus("loading");
    try {
      const res = await fetch("/api/scan"); 
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const incidents = data.incidents || [];
      const nextIds = new Set(incidents.map((incident) => incident.id));

      if (hasLoadedIncidentsRef.current) {
        const newIds = incidents
          .filter((incident) => !knownIncidentIdsRef.current.has(incident.id))
          .map((incident) => incident.id);

        setNewIncidentIds(new Set(newIds));

        if (newIncidentTimerRef.current) {
          clearTimeout(newIncidentTimerRef.current);
        }

        if (newIds.length > 0) {
          newIncidentTimerRef.current = setTimeout(() => {
            setNewIncidentIds(new Set());
          }, 3500);
        }
      }

      knownIncidentIdsRef.current = nextIds;
      hasLoadedIncidentsRef.current = true;
      setFires(incidents);
      if (playScan) {
        setScanBeamRun((current) => current + 1);
      }
      setStatus("idle");
    } catch (e) {
      setErrorMsg(e.message);
      setStatus("error");
    }
  }, []);

  useEffect(() => { fetchApprovedFires({ playScan: true }); }, [fetchApprovedFires]);

  // Submission Handler (Public or Admin)
  const handleSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = Object.fromEntries(formData.entries());
    
    payload.city = payload.city.trim();
    payload.state = payload.state.toUpperCase();
    payload.location = `${payload.city}, ${payload.state}`;

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

  const [zoomLevel, setZoomLevel] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [mapZoomOrigin, setMapZoomOrigin] = useState({ x: 50, y: 50 });
  const [selectedMapState, setSelectedMapState] = useState("");
  const [scanBeamRun, setScanBeamRun] = useState(0);

  const handleMapStateChange = (state) => {
    setSelectedMapState(state);

    if (!state) {
      setZoomLevel(1);
      setPan({ x: 0, y: 0 });
      setMapZoomOrigin({ x: 50, y: 50 });
      return;
    }

    const nextLevel = getStateViewZoom(state);

    setMapZoomOrigin({ x: 50, y: 50 });
    setZoomLevel(nextLevel);
    setPan(getStateViewPan(state, nextLevel));
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
                alignItems: "center",
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
          <div className="header-title"
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
            US WAREHOUSE FIRE TRACKER 🔥
          </div>
          <div style={{ fontSize: "14px", color: "#a07868", letterSpacing: "0.2em", textAlign: isMobile ? "center" : undefined }}>
            CROWDSOURCED INDUSTRIAL INCIDENT MAP
          </div>
        </div>

        {isMobile ? (
          <div style={{ display: "flex", flexDirection: "row", gap: 8, marginBottom: 8 }}>
            <button onClick={() => setView(view === "report" ? "map" : "report")} style={navBtnStyle}>
              {view === "report" ? "✕ CLOSE" : "✚ REPORT FIRE"}
            </button>
            <button onClick={() => fetchApprovedFires({ playScan: true })} style={navBtnStyle}>↺ REFRESH</button>
            <div style={{ background: "#1a0a05", border: "1px solid #a04a2a", borderRadius: 4, padding: "6px 12px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, color: "#8a6a55", letterSpacing: "0.1em", fontWeight: 500 }}>FIRES TRACKED:</span>
              <span style={{ fontSize: "clamp(18px, 4vw, 40px)", color: "#ff4500", fontFamily: "'Bebas Neue',sans-serif", fontWeight: "bold", marginLeft: 4 }}>{fires.length}</span>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 15, alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={() => setView(view === "report" ? "map" : "report")} style={navBtnStyle}>
                {view === "report" ? "✕ CLOSE" : "✚ REPORT FIRE"}
              </button>
              <button onClick={() => fetchApprovedFires({ playScan: true })} style={navBtnStyle}>↺ REFRESH</button>
            </div>
            <div style={{ background: "#1a0a05", border: "1px solid #a04a2a", borderRadius: 4, padding: "6px 12px", display: "flex", flexDirection: "row", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, color: "#8a6a55", letterSpacing: "0.1em", fontWeight: 500 }}>FIRES TRACKED:</span>
              <span style={{ fontSize: "clamp(18px, 4vw, 40px)", color: "#ff4500", fontFamily: "'Bebas Neue',sans-serif", marginBottom: -4 }}>{fires.length}</span>
            </div>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", overflow: "hidden" }}>
        
        {view === "map" ? (
          <>
            {/* Map Column */}
            <div style={{ flex: isMobile ? "0 0 auto" : "0 0 60%", borderRight: "1px solid #1a0f08", position: "relative", padding: 20 }}>
              <MapControls
                zoomLevel={zoomLevel}
                selectedState={selectedMapState}
                onStateChange={handleMapStateChange}
                onZoomIn={() => {
                  setZoomLevel((level) => {
                    const nextLevel = Math.min(MAX_MAP_ZOOM, Number((level + 0.2).toFixed(2)));
                    setPan((current) => clampMapPan(current, nextLevel));
                    return nextLevel;
                  });
                }}
                onZoomOut={() => {
                  setZoomLevel((level) => {
                    const nextLevel = Math.max(MIN_MAP_ZOOM, Number((level - 0.2).toFixed(2)));
                    setPan((current) => clampMapPan(current, nextLevel));
                    return nextLevel;
                  });
                }}
                onReset={() => {
                  setSelectedMapState("");
                  setZoomLevel(1);
                  setPan({ x: 0, y: 0 });
                  setMapZoomOrigin({ x: 50, y: 50 });
                }}
              />
              <USMap
                fires={fires.map((f, i) => {
                  const state = f.state || (f.location?.match(/,\s*([A-Z]{2})$/)?.[1] ?? null);
                  const hasLatLng = Number.isFinite(Number(f.latitude)) && Number.isFinite(Number(f.longitude));
                  const geoCoords = hasLatLng
                    ? latLngToSVG(Number(f.latitude), Number(f.longitude))
                    : null;
                  const sameLocationIndex = fires
                    .slice(0, i)
                    .filter((other) => {
                      const sameCity = (other.city || "").toLowerCase() === (f.city || "").toLowerCase();
                      const sameState = other.state === f.state;
                      const sameLat = Number(other.latitude) === Number(f.latitude);
                      const sameLng = Number(other.longitude) === Number(f.longitude);
                      return (sameCity && sameState) || (sameLat && sameLng);
                    }).length;
                  const coords = geoCoords
                    ? applyStackJitter(geoCoords, sameLocationIndex)
                    : getCoords(state, i);
                  return { ...f, coords, state };
                })}
                hoveredFire={hoveredFire}
                setHoveredFire={setHoveredFire}
                highlightedFire={highlightedFire}
                isMobile={isMobile}
                zoomLevel={zoomLevel}
                setZoomLevel={setZoomLevel}
                pan={pan}
                setPan={setPan}
                zoomOrigin={mapZoomOrigin}
                setZoomOrigin={setMapZoomOrigin}
                selectedState={selectedMapState}
                onStateClick={handleMapStateChange}
                scanBeamRun={scanBeamRun}
              />
            </div>

            {/* Log Column */}
            <div style={{ flex: isMobile ? "1" : "0 0 40%", overflowY: "auto", background: "#050508" }}>
              <div style={{ padding: 12, color: "#8a6a55", borderBottom: "1px solid #1a1a1f",
                display: "flex", flexDirection: "row", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 26, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: "0.1em", verticalAlign: "middle", marginBottom: -4 }}>INCIDENT LOG</span>
                  <button type="button" onClick={() => window.location.href = "/admin"} style={{ ...navBtnStyle, cursor: "pointer" }}>ADMIN</button>
              </div>
              {fires.map((fire, i) => (
                <div
                  key={fire.id}
                  className={newIncidentIds.has(fire.id) ? "fire-row fire-row-new" : "fire-row"}
                  onMouseEnter={() => setHighlightedFire(fire)}
                  onMouseLeave={() => setHighlightedFire(null)}
                  style={{
                    padding: "15px 20px",
                    borderBottom: "1px solid #120d09",
                    background: highlightedFire?.id === fire.id ? "#1a0a05" : "transparent",
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

                  <input name="facility_type" placeholder="Building Type (e.g. Warehouse, Industrial Facility)" style={inputStyle} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <label style={{ fontSize: 11, color: "#666" }}>Date of Incident</label>
                    <input name="date_occurred" type="date" required style={inputStyle} />
                  </div>
                  <input name="url" placeholder="News Article URL" style={inputStyle} />
                  
                  <button type="submit" disabled={status === "saving"} style={{ ...navBtnStyle, padding: 15, background: "#ff4500", color: "white" }}>
                    {status === "saving" ? "PROCESSING..." : "SUBMIT FOR REVIEW"}
                  </button>
                  <button type="button" onClick={() => setView("map")} style={{ background: "none", border: "none", color: "#666", fontFamily: "'DM Mono', monospace", fontSize: 11, cursor: "pointer" }}>CANCEL</button>
               </form>
            </div>
          </div>
        )}
      </main>

      {/* Footer / Hidden Admin Entry */}
      <footer style={{ padding: 10, textAlign: "center", display: "flex", flexDirection: "column", fontSize: 9, color: "#333", borderTop: "1px solid #111" }}>
        © {new Date().getFullYear()} WAREHOUSE FIRE TRACKER by @OKQUEERSTEN · FOR INFORMATIONAL PURPOSES ONLY · 
        INCIDENTS SHOULD NOT BE CONSIDERED ARSON UNLESS EXPLICITLY STATED IN THE SOURCE ARTICLE
      </footer>
    </div>
  );
}

// --- SUB-COMPONENTS ---

function MapControls({ zoomLevel, selectedState, onStateChange, onZoomIn, onZoomOut, onReset }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
        marginBottom: 12,
        flexWrap: "wrap",
      }}
    >
      <div style={{ color: "#8a6a55", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 11, fontWeight: "bold", letterSpacing: "0.14em" }}>
          INTERACTIVE MAP
        </div>
        <div style={{ fontSize: 11, color: "#d4b090", letterSpacing: "0.06em" }}>
          Click/tap state to view incident summary
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <select
          aria-label="Zoom to state"
          value={selectedState}
          onChange={(event) => onStateChange(event.target.value)}
          style={mapSelectStyle}
        >
          <option value="">ALL STATES</option>
          {US_STATE_OPTIONS.map((state) => (
            <option key={state.value} value={state.value}>
              {state.label.toUpperCase()}
            </option>
          ))}
        </select>
        <button type="button" aria-label="Zoom out" title="Zoom out" onClick={onZoomOut} style={mapControlBtnStyle}>-</button>
        <button type="button" aria-label="Zoom in" title="Zoom in" onClick={onZoomIn} style={mapControlBtnStyle}>+</button>
        <button type="button" aria-label="Current map view" title="Map view" style={mapZoomBtnStyle}>{Math.round(zoomLevel * 100)}%</button>
        <button type="button" aria-label="Reset map view" title="Reset map view" onClick={onReset} style={mapResetBtnStyle}>RESET</button>
      </div>
    </div>
  );
}

function StateHighlight({ selectedState, isMobile }) {
  const [pathD, setPathD] = useState(null);

  useEffect(() => {
    let cancelled = false;

    if (!selectedState) {
      setPathD(null);
      return;
    }

    const cachedPath = statePathCache.get(selectedState);
    if (cachedPath) {
      setPathD(cachedPath);
      return;
    }

    (async () => {
      try {
        const response = await fetch("/us-map.svg");
        if (!response.ok) throw new Error("Could not load state map");

        const svgText = await response.text();
        const svgDoc = new DOMParser().parseFromString(svgText, "image/svg+xml");
        const statePath = svgDoc.querySelector(`path.${selectedState.toLowerCase()}`);
        const nextPathD = statePath?.getAttribute("d") || null;

        if (nextPathD) statePathCache.set(selectedState, nextPathD);
        if (!cancelled) setPathD(nextPathD);
      } catch {
        if (!cancelled) setPathD(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedState]);

  if (!selectedState || !pathD) return null;

  const glowStrokeWidth = isMobile ? 5 : 8;
  const traceStrokeWidth = isMobile ? 1.25 : 2;
  const glowShadow = isMobile
    ? "drop-shadow(0 0 4px rgba(255, 107, 0, 0.55))"
    : "drop-shadow(0 0 7px rgba(255, 107, 0, 0.65))";

  return (
    <svg
      aria-hidden="true"
      viewBox={US_MAP_VIEWBOX}
      preserveAspectRatio="none"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 1,
      }}
    >
      <path
        d={pathD}
        fill="rgba(255, 107, 0, 0.16)"
        stroke="rgba(255, 107, 0, 0.55)"
        strokeWidth={glowStrokeWidth}
        vectorEffect="non-scaling-stroke"
        style={{ filter: glowShadow }}
      />
      <path
        className="state-focus-trace"
        d={pathD}
        fill="none"
        stroke="#ffcc66"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={traceStrokeWidth}
        strokeOpacity="0.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function StateInteractionLayer({ selectedState, onHoverState, onStateClick }) {
  const [statePaths, setStatePaths] = useState(stateInteractionPathCache);

  useEffect(() => {
    let cancelled = false;

    if (stateInteractionPathCache.length > 0) {
      setStatePaths(stateInteractionPathCache);
      return;
    }

    (async () => {
      try {
        const response = await fetch("/us-map.svg");
        if (!response.ok) throw new Error("Could not load state map");

        const svgText = await response.text();
        const svgDoc = new DOMParser().parseFromString(svgText, "image/svg+xml");
        const nextStatePaths = US_STATE_OPTIONS
          .map(({ value, label }) => {
            const pathD = svgDoc.querySelector(`path.${value.toLowerCase()}`)?.getAttribute("d");
            if (!pathD) return null;
            statePathCache.set(value, pathD);
            return { value, label, pathD };
          })
          .filter(Boolean);

        stateInteractionPathCache.push(...nextStatePaths);
        if (!cancelled) setStatePaths(nextStatePaths);
      } catch {
        if (!cancelled) setStatePaths([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (statePaths.length === 0) return null;

  return (
    <svg
      aria-hidden="false"
      viewBox={US_MAP_VIEWBOX}
      preserveAspectRatio="none"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        WebkitTapHighlightColor: "transparent",
        zIndex: 2,
      }}
    >
      {statePaths.map(({ value, label, pathD }) => (
        <path
          key={value}
          aria-label={`Focus ${label}`}
          role="button"
          tabIndex={0}
          d={pathD}
          fill="transparent"
          stroke="transparent"
          strokeWidth={selectedState === value ? 8 : 4}
          vectorEffect="non-scaling-stroke"
          style={{
            cursor: "pointer",
            outline: "none",
            pointerEvents: "all",
          }}
          onPointerEnter={() => {
            if (!selectedState) onHoverState(value);
          }}
          onPointerLeave={() => {
            if (!selectedState) onHoverState(null);
          }}
          onClick={(event) => {
            event.stopPropagation();
            onStateClick(value);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            onStateClick(value);
          }}
        />
      ))}
    </svg>
  );
}

function StateIncidentPopup({ selectedState, fires, isMobile }) {
  if (!selectedState) return null;

  const selectedStateLabel =
    US_STATE_OPTIONS.find((state) => state.value === selectedState)?.label || selectedState;
  const stateIncidents = fires.filter((fire) => fire.state === selectedState);

  return (
    <div
      style={{
        position: "absolute",
        top: isMobile ? 0 : 12,
        left: isMobile ? 0 : "auto",
        right: isMobile ? "auto" : 12,
        bottom: isMobile ? "auto" : "auto",
        width: isMobile ? "min(38vw, 150px)" : 260,
        maxHeight: isMobile ? "none" : "58%",
        overflowY: "auto",
        background: isMobile ? "rgba(0, 0, 0, 0.78)" : "rgba(0, 0, 0, 0.86)",
        border: "1px solid #333",
        borderRadius: isMobile ? "0 4px 4px 0" : 4,
        boxShadow: "0 0 18px rgba(255, 107, 0, 0.2)",
        color: "#d4b090",
        fontSize: isMobile ? 8 : 10,
        lineHeight: isMobile ? 1.3 : 1.45,
        padding: isMobile ? "8px 7px" : "10px 12px",
        pointerEvents: "auto",
        zIndex: 5,
      }}
    >
      <div
        style={{
          color: "#ffcc66",
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: isMobile ? 16 : 22,
          letterSpacing: "0.08em",
          lineHeight: 1,
          marginBottom: 7,
        }}
      >
        {selectedStateLabel.toUpperCase()}
      </div>
      {stateIncidents.length > 0 ? (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: isMobile ? 4 : 5 }}>
          {stateIncidents.map((fire) => {
            const city = fire.city || fire.location?.replace(/,\s*[A-Z]{2}$/, "") || "Unknown";
            const buildingType = fire.facility_type || "Unknown building type";

            return (
              <li key={fire.id} style={{ display: "flex", gap: isMobile ? 4 : 6 }}>
                <span style={{ color: "#ff6a00", flex: "0 0 auto" }}>•</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ color: "#f0d1b3" }}>{city}</span>
                  <span style={{ color: "#8a6a55" }}> - {buildingType}</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div style={{ color: "#8a6a55" }}>No incidents listed.</div>
      )}
    </div>
  );
}

function USMap({ fires, hoveredFire, setHoveredFire, highlightedFire, isMobile, zoomLevel = 1, setZoomLevel, pan, setPan, zoomOrigin, setZoomOrigin, selectedState, onStateClick, scanBeamRun }) {
  const mapRef = useRef(null);
  const rightPanStartRef = useRef(null);
  const activeTouchPointersRef = useRef(new Map());
  const pinchStartRef = useRef(null);
  const [isRightPanning, setIsRightPanning] = useState(false);
  const [hoveredMapState, setHoveredMapState] = useState(null);
  const [showScanBeam, setShowScanBeam] = useState(false);
  const currentZoomOrigin = zoomOrigin || { x: 50, y: 50 };
  const currentPan = pan || { x: 0, y: 0 };
  const highlightedState = selectedState || hoveredMapState;
  const mapTransform = `translate(${currentPan.x}%, ${currentPan.y}%) scale(${zoomLevel})`;
  const markerBaseSize = isMobile ? 7 : 9;
  const markerActiveSize = isMobile ? 11 : 13;
  const markerScale = 1 / Math.sqrt(zoomLevel);

  useEffect(() => {
    const mapElement = mapRef.current;
    if (!mapElement) return;

    const handleNativeWheel = (event) => {
      event.preventDefault();
      event.stopPropagation();

      const bounds = mapElement.getBoundingClientRect();
      const pointerX = ((event.clientX - bounds.left) / bounds.width) * 100;
      const pointerY = ((event.clientY - bounds.top) / bounds.height) * 100;

      if (!event.ctrlKey) {
        setPan((current) => clampMapPan({
          x: current.x - (event.deltaX * TRACKPAD_PAN_SPEED) / zoomLevel,
          y: current.y - (event.deltaY * TRACKPAD_PAN_SPEED) / zoomLevel,
        }, zoomLevel));
        return;
      }

      const direction = event.deltaY > 0 ? -1 : 1;
      const step = Math.max(0.06, Math.min(0.18, Math.abs(event.deltaY) * 0.01));

      setZoomOrigin({
        x: clamp(pointerX, 0, 100),
        y: clamp(pointerY, 0, 100),
      });

      setZoomLevel((level) => {
        const nextLevel = clamp(Number((level + direction * step).toFixed(2)), MIN_MAP_ZOOM, MAX_MAP_ZOOM);
        setPan((current) => clampMapPan(current, nextLevel));
        return nextLevel;
      });
    };

    const preventBrowserGestureZoom = (event) => {
      event.preventDefault();
    };

    mapElement.addEventListener("wheel", handleNativeWheel, { passive: false });
    mapElement.addEventListener("gesturestart", preventBrowserGestureZoom);
    mapElement.addEventListener("gesturechange", preventBrowserGestureZoom);

    return () => {
      mapElement.removeEventListener("wheel", handleNativeWheel);
      mapElement.removeEventListener("gesturestart", preventBrowserGestureZoom);
      mapElement.removeEventListener("gesturechange", preventBrowserGestureZoom);
    };
  }, [setPan, setZoomLevel, zoomLevel]);

  useEffect(() => {
    if (!scanBeamRun) return;

    setShowScanBeam(true);
    const timeoutId = window.setTimeout(() => {
      setShowScanBeam(false);
    }, SCAN_BEAM_DURATION_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [scanBeamRun]);

  const getMapPointerPercent = (clientX, clientY) => {
    const bounds = mapRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 50, y: 50 };

    return {
      x: clamp(((clientX - bounds.left) / bounds.width) * 100, 0, 100),
      y: clamp(((clientY - bounds.top) / bounds.height) * 100, 0, 100),
    };
  };

  const getTouchPointers = () => Array.from(activeTouchPointersRef.current.values());

  const getTouchDistance = (first, second) => {
    return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
  };

  const getTouchCenter = (first, second) => {
    return {
      clientX: (first.clientX + second.clientX) / 2,
      clientY: (first.clientY + second.clientY) / 2,
    };
  };

  const handlePointerDown = (event) => {
    if (event.pointerType === "touch") {
      activeTouchPointersRef.current.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
      });

      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {}

      const touches = getTouchPointers();
      if (touches.length === 2) {
        event.preventDefault();
        const center = getTouchCenter(touches[0], touches[1]);
        pinchStartRef.current = {
          distance: getTouchDistance(touches[0], touches[1]),
          zoomLevel,
        };
        setZoomOrigin(getMapPointerPercent(center.clientX, center.clientY));
      }
      return;
    }

    if (event.button === 2) {
      event.preventDefault();
      rightPanStartRef.current = {
        x: event.clientX,
        pan: currentPan,
        zoomLevel,
      };
      setIsRightPanning(true);

      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {}
    }
  };

  const handlePointerMove = (event) => {
    if (event.pointerType === "touch") {
      if (!activeTouchPointersRef.current.has(event.pointerId)) return;

      event.preventDefault();
      activeTouchPointersRef.current.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
      });

      const touches = getTouchPointers();
      if (touches.length < 2) return;

      const pinchStart = pinchStartRef.current;
      const currentDistance = getTouchDistance(touches[0], touches[1]);
      const center = getTouchCenter(touches[0], touches[1]);

      if (!pinchStart || pinchStart.distance <= 0) {
        pinchStartRef.current = {
          distance: currentDistance,
          zoomLevel,
        };
        return;
      }

      const nextLevel = clamp(
        Number((pinchStart.zoomLevel * (currentDistance / pinchStart.distance)).toFixed(2)),
        MIN_MAP_ZOOM,
        MAX_MAP_ZOOM
      );

      setZoomOrigin(getMapPointerPercent(center.clientX, center.clientY));
      setZoomLevel(nextLevel);
      setPan((current) => clampMapPan(current, nextLevel));
      return;
    }

    const rightPanStart = rightPanStartRef.current;
    const bounds = mapRef.current?.getBoundingClientRect();

    if (!rightPanStart || !bounds) return;

    event.preventDefault();
    const deltaX = ((event.clientX - rightPanStart.x) / bounds.width) * 100 / rightPanStart.zoomLevel * RIGHT_CLICK_PAN_SPEED;

    setPan(clampMapPan({
      x: rightPanStart.pan.x + deltaX,
      y: rightPanStart.pan.y,
    }, rightPanStart.zoomLevel));
  };

  const handlePointerEnd = (event) => {
    if (event.pointerType === "touch") {
      activeTouchPointersRef.current.delete(event.pointerId);

      if (activeTouchPointersRef.current.size < 2) {
        pinchStartRef.current = null;
      }
    }

    if (rightPanStartRef.current) {
      rightPanStartRef.current = null;
      setIsRightPanning(false);
    }
  };

  return (
    <div
      ref={mapRef}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "959 / 593",
        overflow: "hidden",
        background: "radial-gradient(circle, rgba(255, 68, 0, 0.22) 0%, rgba(0, 0, 0, 0.05) 50%, transparent 90%)",
        cursor: isRightPanning ? "ew-resize" : "default",
        touchAction: "none",
        userSelect: "none",
      }}
    >
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
        @keyframes traceState {
          0% { stroke-dashoffset: 4000; opacity: 0.35; }
          100% { stroke-dashoffset: 0; opacity: 1; }
        }
        .scan-beam {
          position: absolute;
          top: 0;
          width: 2px;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 107, 0, 0.6), transparent);
          box-shadow: 0 0 20px rgba(255, 107, 0, 0.4);
          animation: scanBeam 6s ease-in-out 1 forwards;
          pointer-events: none;
          z-index: 3;
        }
        .fire-marker-breathing {
          animation: breathe 0.8s ease-in-out infinite;
        }
        .state-focus-trace {
          stroke-dasharray: 4000;
          stroke-dashoffset: 4000;
          animation: traceState 900ms ease-out forwards;
        }
      `}</style>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: mapTransform,
          transformOrigin: `${currentZoomOrigin.x}% ${currentZoomOrigin.y}%`,
          transition: "transform 700ms cubic-bezier(0.22, 1, 0.36, 1), transform-origin 700ms cubic-bezier(0.22, 1, 0.36, 1)",
          willChange: "transform, transform-origin",
        }}
      >
        <img
          src="/us-map.svg"
          alt="US Map"
          draggable={false}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            opacity: 0.6,
            filter: "invert(1)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
        <StateHighlight selectedState={highlightedState} isMobile={isMobile} />
        <StateInteractionLayer
          selectedState={selectedState}
          onHoverState={setHoveredMapState}
          onStateClick={onStateClick}
        />
        {fires.map((fire, i) => {
          if (!fire.coords || fire.state === "AK" || fire.state === "HI") return null;

          const [x, y] = fire.coords;

          if (x < 0 || x > 100 || y < 0 || y > 100) return null;

          const active = highlightedFire?.id === fire.id || hoveredFire?.id === fire.id;
          const markerSize = active ? markerActiveSize : markerBaseSize;

          return (
            <div
              key={fire.id}
              onMouseEnter={() => setHoveredFire(fire)}
              onMouseLeave={() => setHoveredFire(null)}
              onClick={() => onStateClick(fire.state)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onStateClick(fire.state);
              }}
              className="fire-marker-breathing"
              role="button"
              tabIndex={0}
              aria-label={`Focus ${fire.location}`}
              style={{
                position: "absolute",
                left: `${x}%`,
                top: `${y}%`,
                width: markerSize,
                height: markerSize,
                background: FIRE_COLORS[i % 5],
                borderRadius: "50%",
                transform: `translate(-50%, -50%) scale(${markerScale})`,
                cursor: "pointer",
                boxShadow: active ? `0 0 15px ${FIRE_COLORS[i % 5]}` : "none",
                zIndex: active ? 100 : 2,
                transition: "width 0.2s, height 0.2s, box-shadow 0.2s",
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
      <StateIncidentPopup selectedState={selectedState} fires={fires} isMobile={isMobile} />
      {showScanBeam && <div className="scan-beam"></div>}
    </div>
  );
}

// --- STYLES ---
const navBtnStyle = {
  background: "#1a1a1f", border: "1px solid #333", color: "#7dc06c",
  padding: "6px 12px", fontSize: 11, cursor: "pointer", borderRadius: 4,
  fontFamily: "inherit"
};

const mapControlBtnStyle = {
  width: 30,
  height: 30,
  background: "#151519",
  border: "1px solid #333",
  color: "#ff8c00",
  borderRadius: 4,
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 15,
  lineHeight: 1,
};

const mapZoomBtnStyle = {
  ...mapControlBtnStyle,
  width: "auto",
  padding: "0 9px",
  color: "#ff8c00",
  fontSize: 10,
  letterSpacing: "0.08em",
};

const mapResetBtnStyle = {
  ...mapControlBtnStyle,
  width: "auto",
  padding: "0 9px",
  color: "#7dc06c",
  fontSize: 10,
  letterSpacing: "0.08em",
};

const mapSelectStyle = {
  height: 30,
  minWidth: 150,
  background: "#151519",
  border: "1px solid #333",
  color: "#d4b090",
  borderRadius: 4,
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 10,
  letterSpacing: "0.06em",
  padding: "0 8px",
};

const inputStyle = {
  padding: "12px", background: "#0a0a0f", border: "1px solid #333",
  color: "white", borderRadius: 4, fontSize: 13, fontFamily: "inherit"
};
