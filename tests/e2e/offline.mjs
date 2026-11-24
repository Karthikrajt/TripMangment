/**
 * Offline test against a PRODUCTION build with the service worker.
 * Run after tests/e2e/smoke.mjs has filled the emulator with made-up data:
 *   npx vite build --mode e2e --outDir /tmp/dist-e2e   (uses .env.local with VITE_USE_EMULATORS=true)
 *   npx vite preview --outDir /tmp/dist-e2e --port 4173
 *   BASE_URL=http://localhost:4173 node tests/e2e/smoke.mjs
 *   BASE_URL=http://localhost:4173 node tests/e2e/offline.mjs [screenshotDir]
 * Checks: pages never opened before work offline (details saved in the
 * background), an expense added offline is kept on the phone and syncs
 * automatically when the connection returns.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const BASE = process.env.BASE_URL ?? 'http://localhost:4173';
const SHOTS = process.argv[2] ?? 'e2e-shots';
mkdirSync(SHOTS, { recursive: true });
let step = 0;
const ok = (m) => console.log(`✔ ${++step}. ${m}`);
const browser = await chromium.launch();
const errors = [];

try {
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(BASE);
  await p.getByRole('button', { name: /Sign in with Google/ }).waitFor();
  await p.evaluate(() => window.__e2eSignIn('alice@gmail.com', 'Alice Kumar'));
  await p.getByText('Hello, Alice').waitFor();
  // service worker installed + trip details saved in the background
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.waitForFunction(() => Number(localStorage.getItem('tm.lastWarm') ?? 0) > 0, null, { timeout: 30000 });
  ok('Online: app installed for offline use and all trip details saved on the phone');

  await ctx.setOffline(true);
  // Alice never opened these pages while online.
  await p.goto(`${BASE}/accommodation`);
  await p.getByRole('heading', { name: 'Sample Lake Resort' }).waitFor();
  await p.getByText(/Offline – showing saved data/).waitFor();
  await p.goto(`${BASE}/vendors`);
  await p.getByText('Sample Travels').waitFor();
  await p.goto(`${BASE}/tickets`);
  await p.getByRole('button', { name: /10009 SAMPLE SF EXP/ }).click();
  await p.getByRole('list', { name: 'Passengers' }).getByText('M2 · 58 MB').waitFor();
  await p.screenshot({ path: `${SHOTS}/offline-tickets.png` });
  await p.goto(`${BASE}/itinerary`);
  await p.getByText('Departure from Chennai').waitFor();
  ok('Offline: hotel, Hotels & Travel, tickets with passenger berths and itinerary all open (never visited before)');

  await p.goto(`${BASE}/expenses/new`);
  await p.getByText(/You are offline/).waitFor();
  await p.getByLabel('Expense title').fill('Offline tea stall');
  await p.getByLabel('Amount (₹)').fill('120');
  await p.getByRole('button', { name: 'Submit expense' }).click();
  await p.getByText('Saved on this phone. It will sync automatically').waitFor();
  await p.getByText('Offline tea stall').waitFor();
  await p.getByText(/Your changes are saved on this phone/).waitFor();
  await p.screenshot({ path: `${SHOTS}/offline-expense.png` });
  ok('Offline: expense added, kept on the phone, shown in the list right away');

  // Admin (online, other device) cannot see it yet
  const actx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const admin = await actx.newPage();
  await admin.goto(BASE);
  await admin.getByRole('button', { name: /Sign in with Google/ }).waitFor();
  await admin.evaluate(() => window.__e2eSignIn('you@gmail.com', 'Ravi Kumar'));
  await admin.getByText('Admin dashboard', { exact: true }).waitFor();
  await admin.goto(`${BASE}/expenses?tab=review`);
  await admin.waitForTimeout(1500);
  if (await admin.getByText('Offline tea stall').count()) throw new Error('expense reached the server while offline?');

  await ctx.setOffline(false);
  await p.evaluate(() => window.dispatchEvent(new Event('online')));
  await p.getByText('All offline changes synced').waitFor({ timeout: 30000 });
  await admin.getByText('Offline tea stall').waitFor({ timeout: 30000 });
  ok('Back online: expense synced automatically and appears in the admin\'s verification queue');

  // reopen offline after closing: still works from saved data
  await ctx.setOffline(true);
  await p.close();
  const p2 = await ctx.newPage();
  await p2.goto(`${BASE}/live`);
  await p2.getByText('Departure from Chennai').waitFor();
  await p2.goto(`${BASE}/expenses`);
  await p2.getByText('Offline tea stall').waitFor();
  ok('App reopened with no internet: Trip Live and expenses still open');
  await ctx.setOffline(false);
} catch (e) {
  console.error('✘ FAILED:', e.message);
  errors.push(e.message);
} finally {
  await browser.close();
}
if (errors.length) {
  console.error('\nErrors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('\nAll offline checks passed.');
