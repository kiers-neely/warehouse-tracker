# US Warehouse Fire Tracker

A live, crowdsourced map and log of warehouse and industrial facility fires across the United States. Live at [warehousefire.watch](https://warehousefire.watch).

## Features

- **Interactive US Map** — d3-geo Albers USA projection with animated fire markers, pinch-zoom and pan on mobile, scroll-zoom on desktop, and a one-time scanning beam on load.
- **Click-to-Focus States** — clicking a state (or selecting from the dropdown) zooms in and filters the incident log to that state.
- **Searchable Incident Log** — keyword search across location, title, and facility type, combinable with state focus.
- **Crowdsourced Submissions** — anyone can submit a new incident; entries default to `pending` and require admin approval.
- **Admin Moderation** — password-gated dashboard at `/admin` for approving, deleting, or directly adding incidents.
- **Geocoding** — submissions are geocoded via OpenStreetMap Nominatim, with a Supabase-backed coordinate cache to avoid duplicate lookups.
- **Mobile Friendly** — responsive layout, single-finger pan when zoomed, and natural page scroll past the map at default zoom.
- **OG Image** — auto-generated 1200x630 link preview rendered with @vercel/og at build time.

## Tech Stack

- **Framework**: Next.js 15 (App Router) + React 18
- **Hosting**: Cloudflare Workers via [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare)
- **Database**: Supabase (Postgres + Auth)
- **Geocoding**: OpenStreetMap Nominatim
- **Map projection**: d3-geo
- **Analytics**: Vercel Analytics + Speed Insights

## Project Structure

```
fire-tracker/
├── public/
│   ├── us-map.svg              # Inline SVG map (states as <path class="XX">)
│   └── _headers                # Static asset cache headers
├── src/
│   ├── app/
│   │   ├── admin/page.jsx      # Admin moderation dashboard
│   │   ├── api/scan/route.js   # GET (public/admin) + POST (submit/moderate) handlers
│   │   ├── fonts/              # Self-hosted Bebas Neue + DM Mono
│   │   ├── globals.css         # Resets, font-face, animations
│   │   ├── layout.js           # Root layout, metadata, OG tags, SVG preload
│   │   ├── opengraph-image.jsx # Build-time OG image generation
│   │   └── page.js             # Mounts <FireTracker />
│   ├── components/
│   │   └── FireTracker.jsx     # Main UI: map, log, search, controls, submission form
│   └── lib/
│       └── usStates.js         # State code/label list
├── wrangler.jsonc              # Cloudflare Worker config
├── open-next.config.ts         # OpenNext build config
└── package.json
```

## How It Works

- **Public users** submit incidents through the in-app form. Submissions are rate-limited per IP (10/hour), URLs are normalized to include `https://`, and entries land in Supabase with `status = "pending"`.
- **Geocoding** runs on the server: city/state is first checked against existing rows for cached coordinates, then falls back to a Nominatim lookup (rate-limited to ~1/sec).
- **Admins** authenticate via a password against `ADMIN_SECRET_PASSWORD` and can list pending entries, approve them, delete them, add directly-approved entries, or run a backfill action to geocode older rows.
- **Public reads** are cached at the edge (`s-maxage=120, stale-while-revalidate=300`); admin reads bypass the cache.
- **Only `approved` incidents** appear on the public map and log.

## Running Locally

1. Clone and install:
   ```sh
   git clone https://github.com/kiers-neely/warehouse-tracker.git
   cd warehouse-tracker
   npm install
   ```
2. Create `.env.local` with your Supabase credentials and admin password:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ADMIN_SECRET_PASSWORD=your_admin_password
   ```
3. Start the dev server:
   ```sh
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000).

## Deployment

The site deploys to Cloudflare Workers via OpenNext:

- **Production** (`main` branch) → `warehousefire.watch`
- **Preview** (any other branch) → unique `*.workers.dev` URL via Cloudflare's Git integration

### Manual deploy

```sh
npm run deploy        # Build with OpenNext + deploy to production worker
npm run preview       # Build + spin up a local preview at the worker runtime
```

### Required Cloudflare secrets

Set once via `wrangler secret put`:

- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_SECRET_PASSWORD`

`NEXT_PUBLIC_SUPABASE_URL` is configured as a plain `vars` entry in [`wrangler.jsonc`](wrangler.jsonc).

## Branching Workflow

- `main` is protected — production. Updates only via merged PRs.
- `dev` is the default working branch for in-progress changes.
- Feature branches off `dev` get auto-deployed preview URLs by Cloudflare.

## Credits

Built by [@kiers-neely](https://github.com/kiers-neely) (@okqueeersten on TikTok) with the help of vibe code masterminds Claude, Codex and Copilot.

---

For questions or contributions, open an issue or PR.
