import { ImageResponse } from "next/og";
import { headers } from "next/headers";

export const runtime = "edge";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";
export const alt = "US Warehouse Fire Tracker preview map";

async function fetchAsset(origin, pathname) {
  try {
    const res = await fetch(`${origin}${pathname}`);
    if (!res.ok) return null;
    return res;
  } catch {
    return null;
  }
}

const previewDots = [
  { left: "11.5%", top: "51%", color: "#ff4500" },
  { left: "17.5%", top: "45%", color: "#ff6a00" },
  { left: "33%", top: "45.5%", color: "#ff8c00" },
  { left: "45%", top: "61.5%", color: "#ffa500" },
  { left: "60.5%", top: "44%", color: "#ff4500" },
  { left: "69%", top: "51%", color: "#ff6a00" },
  { left: "74.5%", top: "68%", color: "#ff8c00" },
  { left: "83.5%", top: "36%", color: "#ffcc00" },
];

export default async function Image() {
  const headersList = await headers();
  const host = headersList.get("host") || "warehousefire.watch";
  const protocol = host.includes("localhost") ? "http" : "https";
  const origin = `${protocol}://${host}`;

  const mapRes = await fetchAsset(origin, "/us-map.svg");
  const mapSvg = mapRes ? await mapRes.text() : "";
  const mapDataUrl = mapSvg
    ? `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(mapSvg)))}`
    : null;

  const bebasRes = await fetchAsset(origin, "/fonts/BebasNeue-Regular.ttf");
  const monoRes = await fetchAsset(origin, "/fonts/DMMono-Regular.ttf");
  const bebasFontData = bebasRes ? await bebasRes.arrayBuffer() : null;
  const monoFontData = monoRes ? await monoRes.arrayBuffer() : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#08090d",
          color: "#f4dcc6",
          position: "relative",
          fontFamily: "Arial",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background:
              "radial-gradient(circle at 20% 20%, rgba(255, 80, 0, 0.2), transparent 30%), radial-gradient(circle at 80% 15%, rgba(255, 204, 102, 0.12), transparent 28%), linear-gradient(180deg, #110b08 0%, #08090d 100%)",
          }}
        />

        <div
          style={{
            width: "46%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "56px 40px 56px 64px",
            position: "relative",
            zIndex: 2,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 20,
              letterSpacing: "0.28em",
              color: "#a07868",
              marginBottom: 18,
              fontFamily: "DM Mono",
            }}
          >
            CROWDSOURCED INDUSTRIAL INCIDENT MAP
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 100,
              fontFamily: "Bebas Neue",
              lineHeight: 0.94,
              fontWeight: 400,
              color: "#ff6a00",
              marginBottom: 22,
            }}
          >
            U.S. FIRE TRACKER
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 28,
              fontFamily: "DM Mono",
              lineHeight: 1.25,
              color: "#d5b39a",
              maxWidth: 420,
            }}
          >
            Live tracking of warehouse and industrial facility fires across the United States.
          </div>
        </div>

        <div
          style={{
            width: "54%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            zIndex: 2,
            paddingRight: 48,
          }}
        >
          <div
            style={{
              width: 560,
              height: 410,
              display: "flex",
              position: "relative",
              border: "1px solid rgba(160, 74, 42, 0.45)",
              boxShadow: "0 0 36px rgba(255, 107, 0, 0.18)",
              background: "rgba(10, 10, 15, 0.88)",
            }}
          >
            {mapDataUrl && (
              <img
                src={mapDataUrl}
                alt=""
                style={{
                  position: "absolute",
                  left: 22,
                  top: 22,
                  width: 516,
                  height: 366,
                  objectFit: "contain",
                  opacity: 0.82,
                  filter: "invert(1)",
                }}
              />
            )}
            {previewDots.map((dot, index) => (
              <div
                key={index}
                style={{
                  position: "absolute",
                  left: dot.left,
                  top: dot.top,
                  width: 14,
                  height: 14,
                  borderRadius: "999px",
                  background: dot.color,
                  boxShadow: `0 0 18px ${dot.color}`,
                }}
              />
            ))}
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: 2,
                height: "100%",
                background: "linear-gradient(180deg, transparent, rgba(255, 107, 0, 0.8), transparent)",
                boxShadow: "0 0 18px rgba(255, 107, 0, 0.55)",
              }}
            />
          </div>
        </div>
      </div>
    ),
    bebasFontData && monoFontData
      ? {
          ...size,
          fonts: [
            {
              name: "Bebas Neue",
              data: bebasFontData,
              style: "normal",
              weight: 400,
            },
            {
              name: "DM Mono",
              data: monoFontData,
              style: "normal",
              weight: 400,
            },
          ],
        }
      : size
  );
}
