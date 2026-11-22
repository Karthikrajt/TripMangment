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

  // 3b. Admin adds travellers who never sign in (no email): a child at 50% and an infant
  async function addTraveller(name, age, extra) {
    await admin.goto(`${BASE}/members`);
    await admin.getByRole('button', { name: 'Add traveller' }).first().click();
    await admin.getByLabel('Full name').fill(name);
    await admin.getByLabel('Age group').selectOption(age);
    if (extra) await extra();
    await admin.getByRole('button', { name: 'Add', exact: true }).click();
    await admin.getByText(name).first().waitFor();
  }
  await addTraveller('Kavin (kid)', 'child');
  await addTraveller('Baby Nila', 'infant');
  await addTraveller('Bob Uncle', 'adult', () => admin.getByLabel('Email (optional)').fill('bob@gmail.com'));
  await admin.getByText('Child · 50%').waitFor();
  await admin.getByText('Infant · not counted').waitFor();
  await shot(admin, 'members-people');
  ok('Admin added a child (50%), an infant and an adult without them signing in');

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
  await alice.getByLabel('Amount (₹)').fill('1000');
  // 3 adults (Ravi, Alice, Bob Uncle) + child at 50% = 3.5 shares; infant free → ₹285.71 per adult
  await alice.locator('li', { hasText: 'Kavin (kid)' }).first().waitFor();
  const previewText = await alice.locator('ul', { hasText: 'Kavin (kid)' }).innerText();
  if (previewText.includes('Baby Nila')) throw new Error('infant should not be in the split');
  if (!previewText.includes('₹142.86') || !previewText.includes('₹285.71')) throw new Error('unexpected per-head preview: ' + previewText);
  await shot(alice, 'expense-preview-mobile');
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
  await alice.getByText('₹1,000').first().waitFor();
  await shot(alice, 'settlement-mobile');
  await admin.goto(`${BASE}/settlements`);
  await admin.getByRole('button', { name: 'Mark as paid' }).first().waitFor();
  await shot(admin, 'settlement-admin');
  ok('Per-head split: adults ₹285.71, child ₹142.86, infant ₹0 – settlement shows who pays Alice');

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
  await bob.getByRole('button', { name: 'Send request' }).click();
  await bob.getByText('Waiting for approval').waitFor();
  const denied = await bob.evaluate(async () => {
    const r = await fetch('http://127.0.0.1:8080/v1/projects/demo-trip/databases/(default)/documents/trips/main/itinerary', {
      headers: { Authorization: `Bearer ${await window.__e2eToken()}` },
    });
    return r.status;
  });
  if (denied !== 403) throw new Error(`expected 403 for pending user, got ${denied}`);
  ok('Pending user gets 403 on a direct Firestore REST read');

  // 10. Admin approves Bob and links him to the traveller "Bob Uncle" (matched by email)
  await admin.goto(`${BASE}/admin/approvals`);
  await admin.getByLabel('Who is this?').waitFor();
  const linked = await admin.getByLabel('Who is this?').inputValue();
  if (!linked) throw new Error('expected Bob to be matched to the existing traveller by email');
  await admin.getByRole('button', { name: 'Approve' }).first().click();
  await bob.getByText('Hello, Bob').waitFor({ timeout: 15000 });
  await bob.goto(`${BASE}/settlements`);
  await bob.getByText('You need to pay').waitFor();
  await bob.getByText('₹285.71').first().waitFor();
  await shot(bob, 'bob-linked-settlement');
  ok('Sign-in linked to an existing traveller sees that traveller’s share as their own');

  // 11. Trip-level share defaults + family groups (made-up names)
  await admin.goto(`${BASE}/admin/settings`);
  await admin.getByLabel('Child (default %)').fill('40');
  await admin.getByLabel('Infant (default %)').fill('10');
  await admin.getByRole('button', { name: 'Save changes' }).click();
  await admin.getByText('Trip settings saved').waitFor();
  await admin.goto(`${BASE}/members`);
  await admin.getByText('Child · 40%').first().waitFor();
  await admin.getByText('Infant · 10%').first().waitFor();
  ok('Trip Settings defaults (child 40%, infant 10%) apply to people without their own %');

  await admin.getByRole('button', { name: 'Add traveller' }).first().click();
  await admin.getByLabel('Full name').fill('Asha Test');
  await admin.getByLabel('Family', { exact: true }).selectOption('__new');
  await admin.getByLabel('New family name').fill('Test Family');
  await admin.getByLabel('Age group').selectOption('child');
  await admin.getByLabel(/Use the trip default/).uncheck();
  await admin.getByLabel(/Share for Asha Test/).fill('75');
  await admin.getByRole('button', { name: 'Add', exact: true }).click();
  await admin.getByRole('heading', { name: 'Test Family', exact: true }).waitFor();
  await admin.getByRole('button', { name: 'Add to family' }).first().waitFor();
  // add a second member straight into the family from its header
  await admin.getByRole('heading', { name: 'Test Family', exact: true }).locator('xpath=..').getByRole('button', { name: 'Add to family' }).click();
  await admin.getByRole('dialog', { name: 'Add to Test Family' }).waitFor();
  await admin.getByLabel('Full name').fill('Baby Test');
  await admin.getByLabel('Age group').selectOption('infant');
  await admin.getByRole('button', { name: 'Add', exact: true }).click();
  await admin.getByText('Baby Test').waitFor();
  await admin.getByText('Child · 75% (own %)').waitFor();
  const famSection = await admin.getByRole('heading', { name: 'Test Family', exact: true }).locator('xpath=../..').innerText();
  if (!famSection.includes('Baby Test') || !famSection.includes('Asha Test')) throw new Error('family section missing members: ' + famSection);
  await shot(admin, 'members-families');
  ok('Family created; second member added from the family header; child has own 75%');

  await admin.goto(`${BASE}/expenses/new`);
  await admin.getByLabel('Expense title').fill('Family snacks');
  await admin.getByLabel('Amount (₹)').fill('850');
  await admin.getByLabel('How should this be split?').selectOption('equal_selected');
  await admin.getByRole('group', { name: /Members included/ }).getByRole('button', { name: 'Clear all' }).click();
  await admin.getByRole('button', { name: /^Test Family/ }).click();
  await shot(admin, 'expense-family-chip');
  const fam = await admin.locator('div.rounded-xl', { hasText: 'Per head' }).last().innerText();
  if (!fam.includes('₹750') || !fam.includes('₹100')) throw new Error('unexpected family split: ' + fam);
  await shot(admin, 'expense-family-chip');
  ok('Whole-family select in the expense form: 75% + 10% split ₹850 as ₹750 / ₹100');

  // 12. Family board: drag and drop between families (made-up names)
  await admin.goto(`${BASE}/members`);
  await admin.getByRole('tab', { name: 'Family board' }).click();
  const col = (name) => admin.getByRole('listitem', { name, exact: true });
  await col('Test Family').waitFor();
  async function drag(person, target) {
    const from = await admin.getByRole('button', { name: new RegExp(`^${person}\\.`) }).boundingBox();
    const to = await col(target).boundingBox();
    await admin.mouse.move(from.x + 40, from.y + from.height / 2);
    await admin.mouse.down();
    await admin.mouse.move(from.x + 60, from.y + from.height / 2 + 10, { steps: 5 });
    await admin.mouse.move(to.x + to.width / 2, to.y + 60, { steps: 15 });
    await admin.mouse.up();
  }
  await drag('Kavin \\(kid\\)', 'Test Family');
  await col('Test Family').getByText('Kavin (kid)').waitFor();
  await shot(admin, 'family-board');
  ok('Dragged a person into another family on the board');

  await drag('Baby Nila', 'New family');
  await admin.getByLabel('Family name').fill('Sample Family');
  await admin.getByRole('button', { name: 'Create & move' }).click();
  await col('Sample Family').getByText('Baby Nila').waitFor();
  ok('Dropping on "New family" asks for a name and creates the family');

  await admin.getByLabel('Move Kavin (kid) to family').selectOption('');
  await col('No family').getByText('Kavin (kid)').waitFor();
  ok('"Move to" menu works without dragging');

  // keyboard: focus card, space to pick up, arrow right to next column, space to drop
  await admin.getByRole('button', { name: /^Bob Uncle\./ }).focus();
  await admin.keyboard.press('Space');
  await admin.keyboard.press('ArrowRight');
  await admin.keyboard.press('Space');
  await admin.waitForTimeout(500);
  ok('Keyboard drag does not crash (space / arrows / space)');
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
