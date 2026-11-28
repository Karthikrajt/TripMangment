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
  await admin.getByText('Admin dashboard', { exact: true }).waitFor();
  ok('Bootstrap admin created the trip and sees the admin dashboard');

  // 1b. Turn off "anyone can join" so the approval flow can be tested first
  await admin.goto(`${BASE}/admin/settings`);
  await admin.getByLabel(/Anyone with the app link can join/).uncheck();
  await admin.getByRole('button', { name: 'Save changes' }).click();
  await admin.getByText('Trip settings saved').waitFor();
  ok('Admin can require approval for new people (Trip Settings switch)');

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

  // 3c. Alice is asked which traveller she is; she's not on the list → joins her family
  await alice.goto(BASE);
  const who = alice.getByRole('dialog', { name: 'Which traveller are you?' });
  await who.waitFor();
  await who.getByRole('button', { name: /not on the list/ }).click();
  await alice.getByRole('dialog', { name: 'Welcome to the trip' }).getByLabel('Family').selectOption('Kumar family');
  await alice.getByRole('button', { name: 'Done' }).click();
  await who.waitFor({ state: 'detached' });
  ok('Member asked "Which traveller are you?" → not on the list → stays as new member in their family');

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

  // 12. Families view: tap-only family management (made-up names)
  await admin.goto(`${BASE}/members`);
  await admin.getByRole('tab', { name: 'Families' }).click();
  const famCard = (name) => admin.getByRole('region', { name, exact: true });
  await famCard('People without a family').waitFor();
  await famCard('People without a family').getByRole('button', { name: 'Kavin (kid)' }).click();
  await admin.getByRole('dialog', { name: 'Move Kavin (kid) to…' }).getByRole('button', { name: 'Test Family' }).click();
  await famCard('Test Family').getByText('Kavin (kid)').waitFor();
  await shot(admin, 'families-view');
  ok('Tap a person without a family → Move to… → Test Family');

  await admin.getByRole('button', { name: 'New family' }).first().click();
  await admin.getByLabel('Family name').fill('Sample Family');
  const dlg = admin.getByRole('dialog', { name: 'New family' });
  await dlg.getByRole('checkbox', { name: /Baby Nila/ }).check();
  await dlg.getByRole('checkbox', { name: /Bob Uncle/ }).check();
  await dlg.getByRole('button', { name: 'Create with 2 people' }).click();
  await famCard('Sample Family').getByText('Baby Nila').waitFor();
  await famCard('Sample Family').getByText('Bob Uncle').waitFor();
  ok('New family with name and ticked members in one step');

  await famCard('Kumar family').getByRole('button', { name: 'Add people to Kumar family' }).click();
  const add = admin.getByRole('dialog', { name: 'Add people to Kumar family' });
  await add.getByRole('checkbox', { name: /Ravi Kumar/ }).check();
  await add.getByRole('button', { name: 'Add 1 to Kumar family' }).click();
  await famCard('Kumar family').getByText('Ravi Kumar').waitFor();
  ok('"Add people" checklist adds people to a family');

  await famCard('Test Family').getByRole('button', { name: /Kavin \(kid\) – move/ }).click();
  await admin.getByRole('dialog', { name: 'Move Kavin (kid) to…' }).getByRole('button', { name: 'No family' }).click();
  await famCard('People without a family').getByText('Kavin (kid)').waitFor();
  ok('Move to "No family" puts the person back in the unassigned list');

  // 13. Hotels & Travel register (made-up names)
  await alice.goto(`${BASE}/vendors`);
  await alice.getByRole('button', { name: 'Add the first one' }).click();
  await alice.getByLabel(/^Name/).fill('Sample Lake Resort');
  await alice.getByLabel('Type', { exact: true }).selectOption('resort');
  await alice.getByLabel('Status', { exact: true }).selectOption('quoted');
  await alice.getByLabel('Quote (₹)').fill('4500');
  await alice.getByLabel('What the quote covers').fill('per night, breakfast');
  await alice.getByLabel('Phone / WhatsApp').fill('98765 43210');
  await alice.getByLabel('Place / address').fill('Sample Town');
  await alice.getByRole('button', { name: 'Save' }).click();
  await alice.getByText('Sample Lake Resort').waitFor();
  const wa = await alice.getByRole('link', { name: 'WhatsApp' }).getAttribute('href');
  if (wa !== 'https://wa.me/919876543210') throw new Error('unexpected WhatsApp link ' + wa);
  await shot(alice, 'vendors-mobile');
  ok('Member added a resort with a quote; Call and WhatsApp buttons use +91');

  await admin.goto(`${BASE}/vendors`);
  await admin.getByRole('button', { name: 'Add record' }).click();
  await admin.getByLabel(/^Name/).fill('Sample Travels');
  await admin.getByLabel('Type', { exact: true }).selectOption('travel_agent');
  await admin.getByRole('button', { name: 'Save' }).click();
  await admin.getByText('Sample Travels').waitFor();
  await alice.getByText('Sample Travels').waitFor();
  if (await alice.getByRole('button', { name: 'Delete Sample Travels' }).count()) throw new Error('member can delete admin record');
  ok("Members see everyone's records but can only edit their own");

  await admin.getByLabel('Status of Sample Lake Resort').selectOption('booked');
  await admin.getByRole('button', { name: 'Add to Accommodation' }).click();
  await admin.getByRole('dialog', { name: 'Add accommodation' }).waitFor();
  if ((await admin.getByLabel('Hotel / resort name').inputValue()) !== 'Sample Lake Resort') throw new Error('accommodation not prefilled');
  await admin.getByLabel('Check-in date').fill('2026-12-20');
  await admin.getByLabel('Check-out date').fill('2026-12-22');
  await admin.getByRole('button', { name: 'Save' }).click();
  await admin.getByRole('heading', { name: 'Sample Lake Resort' }).waitFor();
  await shot(admin, 'vendors-to-accommodation');
  ok('Booked resort → "Add to Accommodation" opens a pre-filled hotel form');

  // 14. Tickets: passenger list per ticket (made-up data; seeded directly because
  // file uploads need Supabase, which the emulator setup does not have)
  const S = (v) => ({ stringValue: v });
  const seed = await fetch('http://127.0.0.1:8080/v1/projects/demo-trip/databases/(default)/documents/trips/main/tickets?documentId=legacy1', {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: {
      title: S('Test journey'), pnr: S('1000000009'), trainName: S('SAMPLE SF EXP'), trainNumber: S('10009'), journeyDate: S('2027-01-18'),
      boardingStation: S('AAA'), destinationStation: S('BBB'), departureTime: S(''), arrivalTime: S(''), coach: S('M2'), seats: S(''),
      travelClass: S('3E'), notes: S(''), passengerUids: { arrayValue: {} }, passengerNames: { arrayValue: { values: [S('Guest One')] } },
      filePath: S('trips/main/ticket/x/legacy1.pdf'), fileName: S('t.pdf'), fileType: S('application/pdf'), fileSize: { integerValue: '1000' },
      uploadedBy: S('x'), uploadedByName: S('Test Admin'), locked: { booleanValue: false }, createdAt: { timestampValue: new Date().toISOString() },
    } }),
  });
  if (!seed.ok) throw new Error('could not seed ticket: ' + (await seed.text()));
  await admin.goto(`${BASE}/tickets`);
  const card = admin.getByRole('button', { name: /10009 SAMPLE SF EXP/ });
  await card.waitFor();
  if ((await card.getAttribute('aria-expanded')) !== 'false') throw new Error('tickets should start collapsed');
  await card.click();
  await admin.getByRole('list', { name: 'Passengers' }).getByText('Guest One').waitFor();
  ok('Tickets start collapsed; tapping opens the passenger list (older ticket still shows its passengers)');

  await admin.getByRole('button', { name: 'Edit' }).first().click();
  await admin.getByRole('group', { name: /Who is on this ticket/ }).getByRole('checkbox', { name: /Ravi Kumar/ }).check();
  await admin.getByLabel('Berth of Guest One').fill('57');
  await admin.getByLabel('Berth type of Guest One').selectOption('LB');
  await admin.getByLabel('Berth of Ravi Kumar').fill('58');
  await admin.getByLabel('Berth type of Ravi Kumar').selectOption('MB');
  await admin.getByLabel('Age of Ravi Kumar').fill('36');
  await admin.getByLabel('Status of Ravi Kumar').fill('rlwl 4');
  await admin.getByRole('button', { name: 'Use coach M2 for everyone' }).click();
  await admin.getByRole('button', { name: 'Save changes' }).click();
  const paxList = admin.getByRole('list', { name: 'Passengers' });
  await paxList.getByText('M2 · 58 MB').waitFor();
  await paxList.getByText('M2 · 57 LB').waitFor();
  await paxList.getByText('RLWL 4').waitFor();
  await admin.getByText('CNF + WL').waitFor();
  await admin.getByText('YOU', { exact: true }).waitFor();
  await shot(admin, 'ticket-passengers');
  ok('Passenger details per ticket: coach · berth, status, "YOU" marker, ticket status summary');

  // 15. In-app viewer (no new browser page): open an offline copy of a PDF ticket
  const maker = await browser.newPage();
  await maker.setContent('<h1 style="font-family:sans-serif">TEST TICKET</h1><p>PNR 1000000009 · made-up</p>');
  const pdfB64 = (await maker.pdf({ width: '600px', height: '400px' })).toString('base64');
  await maker.close();
  await admin.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'application/pdf' });
    await new Promise((res, rej) => {
      const req = indexedDB.open('trip-offline-files');
      req.onupgradeneeded = () => req.result.createObjectStore('files');
      req.onsuccess = () => {
        const tx = req.result.transaction('files', 'readwrite');
        tx.objectStore('files').put({ id: 'legacy1', path: 'x', name: 'test-ticket.pdf', type: 'application/pdf', savedAt: Date.now(), blob }, 'legacy1');
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
      };
      req.onerror = () => rej(req.error);
    });
  }, pdfB64);
  await admin.reload();
  await admin.getByRole('button', { name: /10009 SAMPLE SF EXP/ }).click();
  await admin.getByRole('button', { name: 'Remove offline copy' }).waitFor();
  await admin.context().setOffline(true);
  await admin.getByRole('button', { name: 'Open offline copy' }).waitFor();
  await admin.context().setOffline(false);
  // open the saved copy (Profile → offline tickets) in the in-app viewer
  const pagesBefore = admin.context().pages().length;
  await admin.goto(`${BASE}/profile`);
  await admin.getByRole('button', { name: 'test-ticket.pdf' }).click();
  const viewer = admin.getByRole('dialog', { name: 'Viewing test-ticket.pdf' });
  await viewer.getByRole('img', { name: 'Page 1 of 1' }).waitFor();
  if (admin.context().pages().length !== pagesBefore) throw new Error('viewer opened a new page');
  await shot(admin, 'doc-viewer');
  await viewer.getByRole('button', { name: 'Zoom in' }).click();
  await viewer.getByText('125%').waitFor();
  await admin.goBack();
  await viewer.waitFor({ state: 'detached' });
  if (!admin.url().endsWith('/profile')) throw new Error('Back should close the viewer, not leave the page');
  ok('Documents open inside the app (PDF drawn in-app, zoom, Back closes the viewer); offline copy button shows offline');

  // 16. Open joining (default): no admin approval; name match → "Are you …?"
  await admin.goto(`${BASE}/admin/settings`);
  await admin.getByLabel(/Anyone with the app link can join/).check();
  await admin.getByRole('button', { name: 'Save changes' }).click();
  await admin.getByText('Trip settings saved').waitFor();
  const kavin = await user('kavin@gmail.com', 'Kavin', true);
  const ask = kavin.getByRole('dialog', { name: 'Which traveller are you?' });
  await ask.getByText('Are you Kavin (kid)?').waitFor({ timeout: 20000 });
  await shot(kavin, 'who-are-you');
  await ask.getByRole('button', { name: /Yes, that/ }).click();
  await ask.waitFor({ state: 'detached' });
  await kavin.goto(`${BASE}/profile`);
  await kavin.getByText('You are Kavin (kid)').waitFor();
  ok('New user joins without approval; "Are you Kavin (kid)?" → Yes connects them');

  const newbie = await user('newcomer@gmail.com', 'Newcomer Person', true);
  const ask2 = newbie.getByRole('dialog', { name: 'Which traveller are you?' });
  await ask2.getByText('Find your name').waitFor({ timeout: 20000 });
  await ask2.getByRole('button', { name: /not on the list/ }).click();
  await newbie.getByLabel('Family').selectOption('Sample Family');
  await newbie.getByRole('button', { name: 'Done' }).click();
  await newbie.getByRole('dialog').waitFor({ state: 'detached' });
  await admin.goto(`${BASE}/members`);
  await admin.getByRole('tab', { name: 'People' }).click();
  await admin.getByRole('heading', { name: 'Sample Family', exact: true }).locator('xpath=../..').getByText('Newcomer Person').waitFor();
  ok('No match → "I\'m not on the list" → added as a new member in the chosen family');

  // UPI pay: receiver adds a UPI ID, payer opens the UPI link and reports "I've paid", receiver confirms.
  await alice.goto(`${BASE}/profile`);
  await alice.getByRole('button', { name: /Edit/ }).first().click();
  await alice.getByLabel('UPI ID (optional)').fill('alice.test@okaxis');
  await alice.getByRole('button', { name: 'Save' }).click();
  await alice.getByText('Details saved').waitFor();
  await admin.goto(`${BASE}/settlements`);
  const payRow = admin.locator('li', { hasText: 'Alice Kumar' }).filter({ has: admin.getByRole('button', { name: 'Pay', exact: true }) }).first();
  await payRow.getByRole('button', { name: 'Pay', exact: true }).click();
  const payDlg = admin.getByRole('dialog', { name: 'Pay Alice Kumar' });
  const upiLink = payDlg.getByRole('link', { name: /with UPI/ });
  const href = await upiLink.getAttribute('href');
  if (!href?.startsWith('upi://pay?pa=alice.test%40okaxis') || !href.includes('cu=INR')) throw new Error(`bad UPI link ${href}`);
  await shot(admin, 'upi-pay');
  await payDlg.getByLabel('UPI reference (optional)').fill('123456789012');
  await payDlg.getByRole('button', { name: /I’ve paid/ }).click();
  await admin.getByText('Paid – waiting for confirmation').first().waitFor();
  await alice.goto(`${BASE}/settlements`);
  await alice.getByRole('button', { name: 'Confirm received' }).first().click();
  await alice.getByText('Payment confirmed').waitFor();
  await shot(alice, 'settlement-confirmed-mobile');
  ok('UPI pay: link carries receiver UPI ID + amount; "I’ve paid" → receiver confirms');

  // Checklist: suggested items, per-person ticks shared with everyone
  await alice.goto(`${BASE}/checklist`);
  await alice.getByRole('button', { name: 'Add suggested items' }).click();
  await alice.getByText('Medicines').waitFor();
  const meds = alice.locator('li', { hasText: 'Medicines' });
  await meds.getByRole('button', { name: 'Me', exact: true }).click();
  await meds.getByRole('button', { name: 'Me', exact: true, pressed: true }).waitFor();
  await admin.goto(`${BASE}/checklist`);
  await admin.locator('li', { hasText: 'Medicines' }).getByText(/^1 of \d+ people$/).waitFor();
  ok('Checklist: suggested items added; a tick on one phone shows on the others');

  // Roll call: admin starts, member taps "I'm here", admin sees them as present
  await admin.getByRole('button', { name: 'Start', exact: true }).click();
  await admin.getByRole('dialog', { name: 'Start a roll call' }).getByRole('button', { name: 'Start' }).click();
  await admin.getByText(/Roll call started/).waitFor();
  await alice.goto(`${BASE}/checklist`);
  await alice.getByRole('button', { name: 'I’m here' }).click();
  await alice.getByRole('button', { name: /You’re marked here/ }).waitFor();
  await admin.getByRole('button', { name: /Alice Kumar is here/ }).waitFor();
  await shot(alice, 'rollcall-mobile');
  await shot(admin, 'checklist-admin');
  const share = admin.getByRole('link', { name: 'Share missing list' }).first();
  if (!(await share.getAttribute('href'))?.startsWith('https://wa.me/')) throw new Error('WhatsApp share link missing');
  ok('Roll call: "I’m here" from a phone shows instantly; missing list can be shared on WhatsApp');

  // WhatsApp share buttons on the plan, tickets and Trip Live
  await alice.goto(`${BASE}/itinerary`);
  await alice.getByRole('link', { name: 'Share' }).first().waitFor();
  await alice.goto(`${BASE}/live`);
  await alice.getByRole('link', { name: 'Share today' }).waitFor();
  await alice.goto(`${BASE}/tickets`);
  await alice.locator('[aria-expanded]').first().click();
  await alice.getByRole('link', { name: 'Share details' }).first().waitFor();
  ok('WhatsApp share on itinerary days, tickets and Trip Live');

  // Free video calls: admin creates the Jitsi room and adds the WhatsApp group link
  await admin.goto(`${BASE}/admin/settings`);
  await admin.getByRole('button', { name: 'Create call link' }).click();
  await admin.getByLabel('WhatsApp group invite link (optional)').fill('https://chat.whatsapp.com/TestGroup123?mode=r_c');
  await admin.getByRole('button', { name: 'Save changes' }).click();
  await admin.getByText('Trip settings saved').waitFor();
  await alice.goto(`${BASE}/chat`);
  const call = alice.getByRole('link', { name: 'Video call' });
  const callHref = await call.getAttribute('href');
  if (!/^https:\/\/meet\.jit\.si\/trip-[A-Za-z0-9]{20}#userInfo\.displayName=/.test(callHref ?? '')) throw new Error(`bad Jitsi link ${callHref}`);
  if ((await alice.getByRole('link', { name: 'WhatsApp group' }).getAttribute('href')) !== 'https://chat.whatsapp.com/TestGroup123') throw new Error('bad WhatsApp group link');
  await alice.goto(`${BASE}/call`);
  await alice.getByRole('heading', { name: 'Trip video call' }).waitFor();
  await shot(alice, 'video-call-mobile');
  await admin.goto(`${BASE}/chat`);
  await admin.context().route('https://meet.jit.si/**', (r) => r.fulfill({ status: 200, body: 'jitsi' }));
  const [popup] = await Promise.all([admin.waitForEvent('popup'), admin.locator('a[href^="https://meet.jit.si/"]').click()]);
  await popup.close();
  await admin.getByRole('dialog', { name: 'Let everyone know?' }).getByRole('button', { name: 'Notify everyone' }).click();
  await alice.goto(`${BASE}/notifications`);
  await alice.getByText('Ravi Kumar started a video call').waitFor();
  ok('Video call: private Jitsi room + WhatsApp group link; "Notify everyone" reaches the others');
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
