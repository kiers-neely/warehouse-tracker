# US Warehouse Fire Tracker

A live, crowdsourced map and log of warehouse and industrial facility fires across the United States.

## Features

- **Interactive US Map**: Visualizes recent warehouse and industrial fires by state, with animated markers and a scanning radar effect.
- **Incident Log**: Scrollable, filterable list of all approved incidents, always visible alongside the map.
- **Crowdsourced Submissions**: Anyone can submit a new fire report for review.
- **Admin Moderation**: Admins can approve, delete, or directly add new incidents from a dedicated dashboard.
- **Mobile Friendly**: Responsive layout with fixed map and scrollable log for easy use on all devices.
- **Live Counter**: Prominent display of the current number of tracked incidents.

## Project Structure

```
fire-tracker/
├── public/
│   └── us-map.svg           # Map image asset
├── src/
│   ├── app/
│   │   ├── globals.css      # Global styles (fonts, resets, animations)
│   │   ├── layout.js        # Root layout, loads global styles
│   │   ├── page.js          # Main entry point
│   │   └── api/
│   │       └── scan/
│   │           └── route.js # API route for GET/POST incidents
│   └── components/
│       └── FireTracker.jsx  # Main UI component (map, log, forms)
├── .env.local               # Environment variables (Supabase, admin password)
├── next.config.js           # Next.js config
├── package.json             # Dependencies and scripts
└── README.md                # This file
```

## How It Works

- **Public users** can submit new incidents, which are set to `pending` and require admin approval.
- **Admins** can:
  - Log in at `/admin`
  - Approve or delete pending submissions
  - Add new incidents directly (auto-approved)
- **Only approved incidents** appear on the public map and log.
- The map features a subtle fire-themed gradient and a scanning animation. Markers pulse as the scan beam passes over them.
- The incident log and map are always visible together, with the map fixed at the top on mobile.

## Running Locally

1. Clone the repo and install dependencies:
   ```
   git clone https://github.com/kiers-neely/warehouse-tracker.git
   cd fire-tracker
   npm install
   ```
2. Create a `.env.local` file with your Supabase credentials and admin password:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ADMIN_SECRET_PASSWORD=your_admin_password
   ```
3. Start the dev server:
   ```
   npm run dev
   ```
4. Visit [http://localhost:3000](http://localhost:3000) in your browser.

## Deployment

- Deploys automatically to Vercel on push to `main`.
- Environment variables must be set in the Vercel dashboard.

## Credits

- Map and UI: [Kiers Neely](https://github.com/kiers-neely)
- Built with Next.js, React, and Supabase

---

For questions or contributions, open an issue or pull request!
