# Trip Manager – Family & Group Trip PWA

An installable Progressive Web App that puts everything for **one** family or group trip in one place: member approvals, shared train tickets, a day-wise itinerary, hotels and room allocation, transport and drivers, group expenses with splitting and settlement, group chat, announcements, notifications and a Trip Live screen for use on the road.

Built with React, TypeScript, Vite, Tailwind CSS, Zustand, Firebase (Auth, Firestore, Cloud Messaging, Hosting) and Supabase (private Storage and Edge Functions). It is designed to run at **₹0/month** on free tiers.

> **Key rule:** every approved member can upload, view and download *all* train tickets for the trip. Only the person who uploaded a ticket (while it is unlocked) or a trip admin can edit or delete it. Firestore Security Rules and the `files` Edge Function enforce this on the server.

Open source under the [MIT License](LICENSE). Contributions welcome.

## Publish your own copy (get a URL)

1. Fork or clone this repository.
2. Create a free Firebase project and a free Supabase project (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), steps 1–3).
3. In GitHub → Settings → Secrets and variables → Actions, add the secrets listed at the top of `.github/workflows/deploy.yml`, and add the variable `DEPLOY_ENABLED=true`.
4. Push to `main`. Your app goes live at `https://<your-firebase-project-id>.web.app`.

## Features

| Area | What you get |
|---|---|
| People | Admin adds every traveller (email optional) as adult, child (custom %) or infant (not counted). Only people who add expenses or tickets need to sign in; their account is linked to their traveller when the admin approves it |
| Access | Google sign-in, request to join, admin approve/reject/disable, admin/member roles, bootstrap admin on first run |
| Dashboard | Countdown or "Day N", member/expense stats, today's schedule, travel/hotel/pickup cards, announcements, recent activity, quick actions |
| Itinerary | Day-wise activities, 12-hour times, Google Maps links, coordinator, instructions, draft/publish, change notifications |
| Train tickets | PDF/JPG/PNG upload, multi-passenger assignment (members plus free-text names), search/filter, preview/download through signed URLs, per-ticket and trip-wide admin lock, explicit "Save for offline" |
| Stay | Hotels with booking confirmation document, check-in/out, map, call; room allocation with capacity warnings and "your room" |
| Transport | Multiple vehicles, driver call button, pickup schedule, navigation, member assignment |
| Expenses | 10 categories, integer paise, per-head split (children by %, infants free) for everyone or selected people, or custom amounts, with exact-sum validation, receipts, admin verification, offline queue with idempotency keys |
| Settlement | Paid − share balances, minimum-transfer suggestions, separate settlement records (mark paid, date, reference) |
| Chat | One real-time group chat with images/documents, unread counts, announcements mirrored into chat |
| Notifications | In-app feed (source of truth) plus best-effort FCM web push |
| Reports | Category/day/member breakdowns, CSV export, print, free-tier usage meter |
| Audit | Append-only audit history with before/after snapshots |
| PWA | Installable, offline app shell, cached trip data, last-synced indicators, update prompt, shared-device mode |

## Quick start (local, no cloud accounts needed)

```bash
npm install
```

```bash
cp .env.example .env.local
```

In `.env.local`, set `VITE_USE_EMULATORS=true` and `VITE_FIREBASE_PROJECT_ID=demo-trip`. Any non-empty values work for the other Firebase keys.

```bash
npm run emulators
```

```bash
npm run dev
```

Open http://localhost:5173. With emulators, Google sign-in uses the Auth emulator. File upload needs a Supabase project (see the deployment guide).

## Tests

```bash
npm test
```
Unit tests: money, splits, settlement, dates, file validation and CSV.

```bash
npm run test:rules
```
Firestore Security Rules tests (31 cases) against the emulator, sent as direct API requests.

```bash
npm run test:e2e
```
UI smoke test with Playwright. It needs the emulators and the dev server running.

```bash
npm run check:functions
```
Type-checks the Supabase Edge Functions with Deno.

## Documentation

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): Firebase, Supabase, FCM and Hosting setup, step by step
- [docs/SECURITY.md](docs/SECURITY.md): data model, security rules, file security, threat notes
- [docs/TESTING.md](docs/TESTING.md): testing checklist (automated and manual)
- [docs/COSTS.md](docs/COSTS.md): free-tier limits, quota monitoring and cost guidance

## Project structure

```
src/
  domain/        pure business logic (types, money, split, settlement, validation, permissions) + tests
  services/      Firestore data access (one module per area), audit + notification helpers
  lib/           firebase init, files client (Edge Function), offline files, push, formatting, retry
  hooks/         live Firestore hooks, forms, online/install state
  store/         Zustand session store (auth, membership, shared listeners)
  components/    UI kit, layout (sidebar + bottom nav), shared widgets
  pages/         screens (pages/admin for admin-only screens)
  sw.ts          service worker (precache, SPA fallback, FCM background messages)
supabase/
  functions/files    signed upload/download/delete URLs and storage usage
  functions/notify   FCM push fan-out
  functions/_shared  token verification, Firestore REST, file rules (shared with the browser)
  migrations/        private bucket definition
firestore.rules, firestore.indexes.json, firebase.json
tests/rules, tests/e2e
```
