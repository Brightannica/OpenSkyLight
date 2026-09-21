# OpenSkyLight

An open-source, fully standalone family calendar display — a [Skylight Calendar](https://myskylight.com) alternative with no subscription, no cloud account, and no Home Assistant. One Electron app owns the whole touchscreen: calendar, family member color coding, Google sync, weather, chores, rewards, lists, meals, news, live cameras, and a photo screensaver.

## What it looks like

The customizable home screen — a big clock and a 3-day weather glance in the
header, with drag-and-drop tiles for today's events, the week ahead, meals,
chores progress, and star balances:

![Home screen](docs/screenshots/home.png)

At sunset it switches itself to a warm dark palette (here with a live news tile
swapped in):

![Home screen in dark mode](docs/screenshots/home-dark.png)

| Week view with the meal strip | Touch-first event editor |
| --- | --- |
| ![Week view](docs/screenshots/week.png) | ![Event editor](docs/screenshots/editor.png) |

| Month view | Chore board with star rewards | Family lists |
| --- | --- | --- |
| ![Month view](docs/screenshots/month.png) | ![Chores](docs/screenshots/chores.png) | ![Lists](docs/screenshots/lists.png) |

The phone companion app (pair by QR, served by the display itself — no cloud):

| Lists on your phone | Chores on your phone |
| --- | --- |
| ![Companion lists](docs/screenshots/companion-lists.png) | ![Companion chores](docs/screenshots/companion-chores.png) |

Every screenshot is generated from a clean install by `node scripts/shot-readme.mjs`,
which seeds demo data through the app's real IPC layer — so they stay honest.

## Web Hosting Deployment (Vercel / Render / Cloudflare Pages)

OpenSkyLight can be built and deployed as a web web-app on cloud hosting platforms such as **Vercel**, **Render**, or **Cloudflare Pages**.

### Environment Variables

Environment variables are configured on your hosting provider or in a `.env` file:

| Variable | Description | Example / Value |
| --- | --- | --- |
| `DATABASE_URL` | Connection URL for external database (Supabase PostgreSQL, Turso / LibSQL, or SQLite file) | `postgresql://postgres:pass@db.ref.supabase.co:5432/postgres` or `libsql://your-db.turso.io` or `file:openskylight.db` |
| `LIBSQL_AUTH_TOKEN` | Auth token for Turso / LibSQL (if using Turso) | `eyJ...` |
| `PORT` | Port for web HTTP server (Render / Node.js) | `3000` |

### Deploying to Vercel
1. Import your repository into **Vercel**.
2. Vercel automatically detects `vercel.json` and uses:
   - **Build Command:** `npm run build:web`
   - **Output Directory:** `dist/web`
3. In **Settings → Environment Variables**, add `DATABASE_URL` (pointing to your Supabase PostgreSQL or Turso database).

### Deploying to Render
1. Create a new **Web Service** on Render and connect your repository.
2. Select **Node** environment with:
   - **Build Command:** `npm run build:web`
   - **Start Command:** `npm run start:web`
3. In Environment Variables, set `DATABASE_URL` (Supabase, Turso, or persistent disk SQLite).

### Deploying to Cloudflare Pages
1. Connect your repo to **Cloudflare Pages**.
2. Set Build configuration:
   - **Build Command:** `npm run build:web`
   - **Build output directory:** `dist/web`
3. Set environment variable `DATABASE_URL` for your external database.

---

## Status

**All planned milestones (M0 – M6) complete**, plus auto-update and a customizable home screen:

- **Customizable Home screen** (the default view): a 12×6 tile dashboard you
  arrange yourself — drag, resize, add, and remove tiles in a PIN-gated edit
  mode with snap-to-grid ghosts. Eleven tile types: today's events, this-week
  agenda, weather, chores progress, star balances, any list, today's meals,
  clock, cycling photos, news headlines, live cameras, BirdNET-Go bird
  detections (clock and weather
  tiles are off by default — the header already shows both). Tapping a tile
  jumps to its tab.
- **Bird detections (BirdNET-Go)**: point a tile at your
  [BirdNET-Go](https://github.com/tphakala/birdnet-go) instance on the LAN and
  see the latest birds it heard — species, confidence, and a photo — refreshing
  every ~20 seconds. Photos are proxied through the kiosk so the sandbox stays
  intact; paste the dashboard URL and the app trims it to the right address.
- **IP camera tiles (RTSP)**: add any camera's rtsp:// URL and watch it live on
  the home screen (~1s latency). The bundled ffmpeg remuxes the camera's H.264
  stream without transcoding (near-zero CPU) to a token-guarded localhost
  WebSocket; camera URLs (which contain credentials) are DPAPI-encrypted and
  never leave the main process. Cameras must provide an H.264 stream (set the
  camera substream to H.264 if tiles show "unavailable").

- Week / Day / Month / Agenda (List) views, touch-first with ≥48px targets
- Family member profiles with per-person colors and filter chips
- Local calendars with full event create/edit/delete from the screen
- Recurring events (daily/weekly/monthly/yearly, weekday picker, end date) with
  Google-style **this / this-and-following / all** edit and delete scopes
- **Two-way Google Calendar sync**: loopback OAuth with PKCE (your own free
  Google Cloud credentials), incremental pull with sync tokens (60s polling),
  push of local edits with If-Match etags and last-writer-wins conflict
  resolution, person assignments round-tripped via extended properties
- **ICS feed subscriptions** (read-only, conditional GET, 30-minute refresh)
- **Weather header** via Open-Meteo (no API key): current conditions plus the
  next two days right in the header (on wide displays), tap for the full 5-day
  forecast; city search and °F/°C in settings
- **Parental PIN lock** (scrypt-hashed, enforced in the main process): settings,
  calendar/people management, and sync configuration sit behind a 4–8 digit PIN
- **Chores & routines**: per-child daily/weekly/one-time chores grouped into
  morning/evening routines on a per-person chore board with big tap-to-check
  circles; parents manage definitions behind the PIN
- **Star rewards**: completed chores earn stars (append-only ledger, balance is
  always the sum); kids redeem rewards from the board, parents approve pending
  redemptions in settings
- **Custom lists** (groceries, to-dos, anything): color-coded cards with
  tap-to-check items, clear-done, shared by the whole family
- **Phone companion app**: scan a QR code to pair, then edit lists, meals, and
  chores from any phone on your Wi-Fi — served by the display itself, no cloud
  (see "Companion app" below)
- **Meal planning**: breakfast/lunch/dinner/snack per day, edited from a tap on
  the meal strip in the Week and Day views
- **Photo screensaver**: point it at a folder of family photos; after the
  configured idle time it crossfades through them with a clock overlay (photos
  are served through a sandbox-safe custom protocol, never direct file access)
- **Sleep schedule**: the screen goes dark on a nightly window (overnight
  ranges supported), the display power-save blocker is released so the OS can
  power the panel down, and a tap wakes it for five minutes
- Launch-on-startup toggle, single-instance lock, crash auto-relaunch
- Built-in on-screen keyboard (no reliance on the Windows touch keyboard)
- Warm "paper planner" visual design (Fraunces + Nunito, linen + ember palette)
- **Dark mode that follows the sun**: by default the display switches to a warm
  dark palette at sunset and back at sunrise — sun times computed locally from
  your weather location (no network), falling back to 7pm–7am without one.
  Settings → General → Appearance also offers always-Light / always-Dark.

### Companion app (phones)

Phones on your home Wi-Fi can edit **lists, meals, and chores** (and see a
read-only week agenda) without walking to the display:

1. On the display: Settings → General → **Companion app** → enable
2. Tap **Pair a phone** and scan the QR code with the phone's camera
3. On the phone, use the browser's **Add to Home Screen** — it installs like an
   app with its own icon

How it works and what to know:

- The display itself serves the app on your network (default port 8420) — no
  cloud, no accounts; everything stays in your house. Each QR scan pairs one
  device; **Unpair all devices** in settings revokes every phone at once.
- Pairing lives behind the parental PIN, and a paired phone gets parent-level
  editing of lists/meals/chores only — it can never reach settings, sync
  credentials, or cameras.
- If a phone can't connect, allow OpenSkyLight through **Windows Firewall**
  (Private networks) on the kiosk machine.
- Away-from-home access: run [Tailscale](https://tailscale.com) on the kiosk
  and your phone and it works from anywhere, unchanged. (Traffic on your LAN is
  plain HTTP — fine for a home network, which is the threat model here.)

### Connecting Google Calendar

1. Create a free Google Cloud project, enable the **Google Calendar API**
2. Configure an OAuth consent screen (External, add yourself as a test user)
3. Create an OAuth client of type **Desktop app**
4. In the app: Settings → Calendars → paste the client ID + secret → Save & connect
5. Sign in via the browser window that opens, then choose which calendars to sync

### Ideas for later

Recipe storage, drag-to-reorder lists, portrait-layout pass, hard panel
power-off via the Win32 API, AI imports (Magic Import-style), companion
mobile/web access.

## Releases and auto-update

Installed apps check GitHub Releases every 6 hours (and shortly after boot).
Updates download in the background, show a "Restart now" pill on the display,
and install themselves silently at 03:30 if nobody taps it.

To ship a release:

```bash
npm version patch        # or minor/major — bumps package.json and creates the tag
git push --follow-tags
```

The `Release` GitHub Action builds the installer on a Windows runner, runs the
test suite, and publishes the release; every kiosk picks it up automatically.

## Kiosk setup (Windows)

1. `npm run dist`, then run the installer from `dist/` on the kiosk machine
2. In the app: Settings → General → enable **Launch on startup**
3. Windows Settings: set power options so the OS never sleeps (the app manages
   display dimming through its own sleep schedule), enable auto-login
4. The installed app runs fullscreen kiosk by default; launch with
   `OpenSkyLight.exe --windowed` if you ever need a window

## Development

```bash
npm install        # also rebuilds better-sqlite3 for Electron
npm run dev        # windowed dev mode with hot reload
npm run dev -- --kiosk   # fullscreen kiosk in dev
npm run dev:companion    # companion web app with hot reload (proxies /api to a running kiosk)
npm run build:web  # builds web app frontend (dist/web) and web server (dist/server)
npm run start:web  # starts the standalone Node.js web server
npm test           # unit tests (run inside Electron's Node for the native module)
npm run typecheck
node scripts/e2e-smoke.mjs   # launches the built app and creates an event end-to-end
npm run dist       # NSIS installer + portable exe (Windows)
```

Production builds run fullscreen kiosk by default; pass `--windowed` to opt out.
Data lives in SQLite at `%APPDATA%/openskylight/openskylight.db`.

## Architecture

- **Electron + React 19 + TypeScript**, bundled with electron-vite
- **SQLite / Postgres / LibSQL + Drizzle** in the backend is the single source of truth
- Renderer is fully sandboxed; all access goes through a **typed IPC / HTTP contract**
  (`src/shared/ipc/contract.ts`) with zod validation at the boundary
- Recurrence is stored as RRULE masters + exception rows and expanded at query
  time in `src/shared/recurrence/expand.ts` (rrule + Luxon, DST-safe, heavily unit-tested)
- State: TanStack Query over IPC/HTTP + Zustand for view state
