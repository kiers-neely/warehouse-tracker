# US Warehouse Fire Tracker

A live, crowdsourced map and log of warehouse and industrial facility fires across the United States. Live at [warehousefire.watch](https://warehousefire.watch).

## Features

- **Interactive US Map** — d3-geo Albers USA projection with color-coded fire markers, animated scan beam on load, and a breathing pulse effect on each marker.
- **Click-to-Focus States** — clicking a state on the map (or selecting from the dropdown) zooms in, highlights the state border, and filters the incident log. A popup lists all incidents for that state.
- **Cause Color Coding** — markers are colored by determined cause: orange/amber for under investigation, green for accident, red for arson.
- **Searchable Incident Log** — keyword search across location, title, facility type, and cause, combinable with state focus.
- **New Incident Flash** — incidents that appear since the last refresh are briefly highlighted in the log.
- **Crowdsourced Submissions** — anyone can submit a new incident; entries default to `pending` and require admin approval.
- **Admin Moderation** — password-gated dashboard at `/admin` for reviewing, inline-editing, approving, deleting, or directly adding incidents.
- **Geocoding** — submissions are geocoded via OpenStreetMap Nominatim, with a Supabase-backed coordinate cache to avoid duplicate lookups. Incidents at the same location are jitter-spread to prevent stacking.
- **Mobile Friendly** — responsive layout, pinch-zoom and single-finger pan when zoomed, natural page scroll past the map at default zoom.
- **Edge Caching** — public reads cached at the edge (`s-maxage=120, stale-while-revalidate=300`); admin reads bypass the cache.
- **OG Image** — pre-generated 1200×630 link preview at `public/og-image.png`, with a build script at `scripts/generate-og-image.mjs`.

## Tech Stack

- **Framework**: Next.js 15 (App Router) + React 18
- **Hosting**: Cloudflare Workers via [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare)
- **Database**: Supabase (Postgres)
- **Geocoding**: OpenStreetMap Nominatim
- **Map projection**: d3-geo (Albers USA)
- **Analytics**: Vercel Analytics + Speed Insights

## Project Structure

```
fire-tracker/
├── public/
│   ├── us-map.svg              # US state outlines (states as <path class="XX">)
│   ├── og-image.png            # Pre-generated Open Graph image
│   └── _headers                # Static asset cache headers
├── scripts/
│   └── generate-og-image.mjs  # Build script for the OG image
├── src/
│   ├── app/
│   │   ├── admin/page.jsx      # Admin moderation dashboard (edit, approve, delete)
│   │   ├── api/scan/route.js   # GET (public/admin) + POST (submit/moderate/edit) handlers
│   │   ├── fonts/              # Self-hosted Bebas Neue + DM Mono
│   │   ├── globals.css         # Resets, font-face, animations
│   │   ├── layout.js           # Root layout, metadata, OG tags, SVG preload
│   │   └── page.js             # Mounts <FireTracker />
│   ├── components/
│   │   └── FireTracker.jsx     # Main UI: map, log, search, controls, submission form
│   └── lib/
│       └── usStates.js         # State code/label list
├── wrangler.jsonc              # Cloudflare Worker config (smart placement, observability)
└── package.json
```

## How It Works

- **Public users** submit incidents through the in-app form. Submissions are rate-limited per IP (10/hour), URLs are normalized to include `https://`, and entries land in Supabase with `status = "pending"`.
- **Geocoding** runs on the server: city/state is first checked against existing rows for cached coordinates, then falls back to a Nominatim lookup.
- **Admins** authenticate via a password against `ADMIN_SECRET_PASSWORD` and can list pending entries, inline-edit any field (re-geocoding if city/state changes), approve, delete, or add directly-approved entries.
- **Public reads** are cached at the edge; admin reads bypass the cache.
- **Only `approved` incidents** appear on the public map and log.
- **Cause determination** normalizes free-text cause input to one of three values: `arson`, `accident`, or `unknown`.

## Running Locally

1. Clone and install:
   ```sh
   git clone https://github.com/kiers-neely/warehouse-fire-tracker.git
   cd warehouse-fire-tracker
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

Built by [@kiers-neely](https://github.com/kiers-neely) (@okqueersten on TikTok) with the help of Claude, Codex, and Copilot.

---

For questions or contributions, open an issue or PR.
