# 🔥 US Warehouse Fire Tracker

Live tracker for warehouse, manufacturing, and industrial facility fires across the United States. Scans news every 5 minutes via the Anthropic API (server-side — your API key is never exposed to the browser).

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Add your Anthropic API key
Edit `.env.local` and replace the placeholder:
```
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx
```
Get a key at https://console.anthropic.com/

### 3. Run locally
```bash
npm run dev
```
Open http://localhost:3000

---

## Deploy to Vercel (recommended, free)

1. Push this folder to a GitHub repo
2. Go to https://vercel.com → "Add New Project" → import your repo
3. During setup, add an **Environment Variable**:
   - Key: `ANTHROPIC_API_KEY`
   - Value: your key from console.anthropic.com
4. Click Deploy — live in ~1 minute

Your API key is stored securely in Vercel's environment and never sent to the browser.

---

## Deploy to Netlify

Netlify supports Next.js via the `@netlify/plugin-nextjs` adapter.

1. Push to GitHub
2. Go to https://netlify.com → "Add new site" → Import from Git
3. Build command: `npm run build`
4. Add environment variable: `ANTHROPIC_API_KEY=your_key`
5. Deploy

---

## How it works

- The browser calls `/api/scan` (your own server)
- The Next.js API route (`src/app/api/scan/route.js`) holds the Anthropic key and makes the actual API call
- Results are returned to the browser — the key is never exposed
- Auto-scans every 5 minutes; manual scan button also available
