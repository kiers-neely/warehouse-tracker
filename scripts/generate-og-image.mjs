// One-off generator for the static OG image. Run with: node scripts/generate-og-image.mjs
// Produces public/og-image.png so requests don't pay any Workers CPU cost.

import { ImageResponse } from "next/dist/server/og/image-response.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import React from "react";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);

const size = { width: 1200, height: 630 };

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

const h = React.createElement;

const mapSvg = await readFile(path.join(ROOT, "public", "us-map.svg"), "utf8");
const mapDataUrl = `data:image/svg+xml;base64,${Buffer.from(mapSvg).toString("base64")}`;
const bebasFontData = await readFile(path.join(ROOT, "src", "app", "fonts", "BebasNeue-Regular.ttf"));
const monoFontData = await readFile(path.join(ROOT, "src", "app", "fonts", "DMMono-Regular.ttf"));

const tree = h(
  "div",
  {
    style: {
      width: "100%",
      height: "100%",
      display: "flex",
      background: "#08090d",
      color: "#f4dcc6",
      position: "relative",
      fontFamily: "Arial",
      overflow: "hidden",
    },
  },
  h("div", {
    style: {
      position: "absolute",
      inset: 0,
      display: "flex",
      background:
        "radial-gradient(circle at 20% 20%, rgba(255, 80, 0, 0.2), transparent 30%), radial-gradient(circle at 80% 15%, rgba(255, 204, 102, 0.12), transparent 28%), linear-gradient(180deg, #110b08 0%, #08090d 100%)",
    },
  }),
  h(
    "div",
    {
      style: {
        width: "46%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "56px 40px 56px 64px",
        position: "relative",
        zIndex: 2,
      },
    },
    h(
      "div",
      {
        style: {
          display: "flex",
          fontSize: 20,
          letterSpacing: "0.28em",
          color: "#a07868",
          marginBottom: 18,
          fontFamily: "DM Mono",
        },
      },
      "CROWDSOURCED INDUSTRIAL INCIDENT MAP"
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          fontSize: 100,
          fontFamily: "Bebas Neue",
          lineHeight: 0.94,
          fontWeight: 400,
          color: "#ff6a00",
          marginBottom: 22,
        },
      },
      "U.S. FIRE TRACKER"
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          fontSize: 28,
          fontFamily: "DM Mono",
          lineHeight: 1.25,
          color: "#d5b39a",
          maxWidth: 420,
        },
      },
      "Live tracking of warehouse and industrial facility fires across the United States."
    )
  ),
  h(
    "div",
    {
      style: {
        width: "54%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        zIndex: 2,
        paddingRight: 48,
      },
    },
    h(
      "div",
      {
        style: {
          width: 560,
          height: 410,
          display: "flex",
          position: "relative",
          border: "1px solid rgba(160, 74, 42, 0.45)",
          boxShadow: "0 0 36px rgba(255, 107, 0, 0.18)",
          background: "rgba(10, 10, 15, 0.88)",
        },
      },
      h("img", {
        src: mapDataUrl,
        alt: "",
        style: {
          position: "absolute",
          left: 22,
          top: 22,
          width: 516,
          height: 366,
          objectFit: "contain",
          opacity: 0.82,
          filter: "invert(1)",
        },
      }),
      ...previewDots.map((dot, index) =>
        h("div", {
          key: index,
          style: {
            position: "absolute",
            left: dot.left,
            top: dot.top,
            width: 14,
            height: 14,
            borderRadius: "999px",
            background: dot.color,
            boxShadow: `0 0 18px ${dot.color}`,
          },
        })
      ),
      h("div", {
        style: {
          position: "absolute",
          left: 0,
          top: 0,
          width: 2,
          height: "100%",
          background: "linear-gradient(180deg, transparent, rgba(255, 107, 0, 0.8), transparent)",
          boxShadow: "0 0 18px rgba(255, 107, 0, 0.55)",
        },
      })
    )
  )
);

const response = new ImageResponse(tree, {
  ...size,
  fonts: [
    { name: "Bebas Neue", data: bebasFontData, style: "normal", weight: 400 },
    { name: "DM Mono", data: monoFontData, style: "normal", weight: 400 },
  ],
});

const buffer = Buffer.from(await response.arrayBuffer());
const outDir = path.join(ROOT, "public");
await mkdir(outDir, { recursive: true });
const outPath = path.join(outDir, "og-image.png");
await writeFile(outPath, buffer);
console.log(`Wrote ${outPath} (${buffer.length} bytes)`);
