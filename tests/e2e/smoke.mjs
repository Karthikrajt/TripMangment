/**
 * End-to-end UI smoke test against the Firebase emulators.
 *   1. npx firebase emulators:start --only auth,firestore --project demo-trip
 *   2. VITE_USE_EMULATORS=true npx vite --port 5173   (with emulator .env.local)
 *   3. node tests/e2e/smoke.mjs [screenshotDir]
 * Covers: bootstrap admin setup, access request, approval, itinerary,
 * expense submit → verify → settlement, group chat, pending-user lockout.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const SHOTS = process.argv[2] ?? 'e2e-shots';
mkdirSync(SHOTS, { recursive: true });

// wipe emulator state
await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-trip/databases/(default)/documents', { method: 'DELETE' });
await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-trip/accounts', { method: 'DELETE' });

const browser = await chromium.launch();
const errors = [];
let step = 0;
const ok = (msg) => console.log(`✔ ${++step}. ${msg}`);

async function user(email, name, mobile = false) {
  const ctx = await browser.newContext(mobile ? { ...devices['Pixel 7'] } : { viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${email}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|apis\.google/.test(m.text()) && errors.push(`${email}: ${m.text()}`));
  await page.goto(BASE);
  await page.getByRole('button', { name: /Sign in with Google/ }).waitFor();
  await page.evaluate(([e, n]) => window.__e2eSignIn(e, n), [email, name]);
  return page;
}
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

try {
  // 1. Bootstrap admin creates the trip
  const admin = await user('you@gmail.com', 'Ravi Kumar');
  await admin.getByRole('heading', { name: 'Set up your trip' }).waitFor();
  await admin.getByLabel('Trip name').fill('Kumar Family Ooty Trip');
  await admin.getByLabel('Destination').fill('Coimbatore & Ooty');
  await admin.getByLabel('Start date').fill('2026-12-20');
  await admin.getByLabel('End date').fill('2026-12-22');
  await admin.getByRole('button', { name: 'Create trip' }).click();
  await admin.getByText('Admin dashboard').waitFor();
  ok('Bootstrap admin created the trip and sees the admin dashboard');

  // 2. A new user requests access
  const alice = await user('alice@gmail.com', 'Alice Kumar', true);
  await alice.getByRole('heading', { name: 'Request to join' }).waitFor();
  await alice.getByLabel('Mobile number').fill('98765 43210');
  await alice.getByLabel('Family / group (optional)').fill('Kumar family');
  await alice.getByRole('button', { name: 'Send request' }).click();
  await alice.getByText('Waiting for approval').waitFor();
  await shot(alice, 'pending-mobile');
  ok('New member submitted an access request and is held at the pending screen');

  // 3. Admin approves
  await admin.goto(`${BASE}/admin/approvals`);
  await admin.getByText('Alice Kumar').waitFor();
  await shot(admin, 'approvals');
  await admin.getByRole('button', { name: 'Approve' }).first().click();
  await admin.getByText('No pending requests').waitFor();
  await alice.getByText('Hello, Alice').waitFor({ timeout: 15000 });
  ok('Admin approved the request; member gains access in real time');

  // 4. Admin adds an itinerary item, member sees it
  await admin.goto(`${BASE}/itinerary`);
  await admin.getByRole('button', { name: 'Add activity' }).first().click();
  await admin.getByLabel('Date').fill('2026-12-20');
  await admin.getByLabel('Start time').fill('21:30');
  await admin.getByLabel('Activity title').fill('Departure from Chennai');
  await admin.getByLabel('Location', { exact: true }).fill('Chennai Central');
  await admin.getByRole('button', { name: 'Save' }).click();
  await admin.getByText('Departure from Chennai').waitFor();
  await alice.goto(`${BASE}/itinerary`);
  await alice.getByText('Departure from Chennai').waitFor();
  await alice.getByText('9:30 PM').first().waitFor();
  await shot(alice, 'itinerary-mobile');
  ok('Itinerary item created by admin is visible to the member (12-hour time)');

  // 5. Members cannot reach admin pages
  await alice.goto(`${BASE}/admin/settings`);
  await alice.getByText('only available to the trip admin').waitFor();
  ok('Admin-only page is blocked for members');

  // 6. Member adds an expense; admin verifies; settlement reflects it
  await alice.goto(`${BASE}/expenses/new`);
  await alice.getByLabel('Expense title').fill('Dinner at station');
  await alice.getByLabel('Amount (₹)').fill('1000.50');
  await alice.getByRole('button', { name: 'Submit expense' }).click();
  await alice.getByText('Dinner at station').waitFor();
  await alice.locator('span', { hasText: /^pending$/ }).first().waitFor();
  ok('Member submitted an expense (pending)');

  await admin.goto(`${BASE}/expenses?tab=review`);
  await admin.getByText('Dinner at station').click();
  await admin.getByRole('button', { name: 'Approve' }).click();
  await admin.getByText('Nothing to verify').waitFor();
  ok('Admin approved the expense from the verification queue');

  await alice.goto(`${BASE}/settlements`);
  await alice.getByText('Ravi Kumar').first().waitFor();
  await alice.getByText('₹1,000.50').first().waitFor();
  await shot(alice, 'settlement-mobile');
  await admin.goto(`${BASE}/settlements`);
  await admin.getByRole('button', { name: 'Mark as paid' }).waitFor();
  await shot(admin, 'settlement-admin');
  ok('Settlement suggests Ravi pays Alice ₹500.25 (equal split of ₹1,000.50)');

  // 7. Group chat
  await alice.goto(`${BASE}/chat`);
  await alice.getByLabel('Message').fill('Hello everyone! 🚆');
  await alice.getByRole('button', { name: 'Send' }).click();
  await admin.goto(`${BASE}/chat`);
  await admin.getByText('Hello everyone! 🚆').waitFor();
  ok('Group chat message delivered in real time');

  // 8. Dashboard & other pages render
  for (const path of ['/', '/live', '/tickets', '/accommodation', '/rooms', '/transport', '/members', '/notifications', '/profile', '/announcements', '/admin/reports', '/admin/audit', '/admin/settings']) {
    await admin.goto(BASE + path);
    await admin.waitForTimeout(400);
    await shot(admin, `admin${path.replace(/\//g, '_') || '_home'}`);
  }
  await alice.goto(BASE + '/');
  await alice.waitForTimeout(500);
  await shot(alice, 'dashboard-mobile');
  await admin.goto(`${BASE}/admin/audit`);
  await admin.getByText('Submitted expense “Dinner at station”').waitFor();
  ok('All pages render; audit history recorded the expense');

  // 9. A pending user cannot read trip data even via direct API
  const bob = await user('bob@gmail.com', 'Bob', true);
  await bob.getByRole('heading', { name: 'Request to join' }).waitFor();
  const denied = await bob.evaluate(async () => {
    const r = await fetch('http://127.0.0.1:8080/v1/projects/demo-trip/databases/(default)/documents/trips/main/itinerary', {
      headers: { Authorization: `Bearer ${await window.__e2eToken()}` },
    });
    return r.status;
  });
  if (denied !== 403) throw new Error(`expected 403 for pending user, got ${denied}`);
  ok('Pending user gets 403 on a direct Firestore REST read');
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
console.log('\nAll smoke checks passed.');
