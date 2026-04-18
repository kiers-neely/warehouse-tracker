# US Warehouse Fire Tracker

A live map of warehouse, manufacturing, and industrial facility fires reported across the United States. Updated on demand using AI-filtered news headlines.

**[View the live app](https://warehousefire.watch)**

---

## What it does

The tracker scans Google News headlines and uses AI to identify verified reports of fires at industrial facilities — warehouses, distribution centers, factories, data centers, and similar sites. Confirmed incidents appear as markers on an interactive US map alongside a running log with location, date, and facility details.

## Features

- **Interactive US map** — fire incidents plotted by state with hover details
- **Incident log** — chronological list with location, facility type, and headline summary
- **On-demand scanning** — hit the scan button to check for new reports
- **Recent incidents only** — filters to the past few weeks so the map stays relevant
- **US industrial facilities only** — AI filters out residential fires, non-US incidents, and unverified reports

## How to use

1. Open the app in your browser
2. The map loads any previously recorded incidents automatically
3. Click **Scan for New Incidents** to fetch the latest headlines and update the map
4. Hover over a map marker or log entry to highlight the corresponding item
5. New incidents found in the latest scan are highlighted when they first appear

## About the data

Incidents are extracted from Google News RSS headlines using Claude (Anthropic's AI). The AI is instructed to include only US industrial facility fires with a confirmed location — it will skip vague reports, non-US incidents, and anything that doesn't clearly involve a warehouse, factory, or similar facility.

This is a best-effort news aggregator, not an authoritative fire database. Some incidents may be missed; others may be updated or corrected after the headline was scanned.

---

## Self-hosting

If you want to run your own instance:

**Requirements:** Node.js 16+, an [Anthropic API key](https://console.anthropic.com/)

```bash
npm install
echo "ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx" > .env.local
npm run dev
# Open http://localhost:3000
```

**Deploy to Vercel (recommended)**

1. Push this repo to GitHub
2. Import it at [vercel.com](https://vercel.com)
3. Add environment variable: `ANTHROPIC_API_KEY` → your key
4. Deploy

The API key is used server-side only and is never sent to the browser.
