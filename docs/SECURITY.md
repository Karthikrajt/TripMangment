# Data model and security

## Principles

1. **The server decides.** Every permission is enforced by `firestore.rules` or by an Edge Function. The UI only hides buttons.
2. **No public files.** Documents live in a private Supabase bucket and are reachable only through signed URLs that expire after 5 minutes.
3. **No secrets in the browser.** The Supabase service-role key and the Google service account exist only as Supabase function secrets.
4. **Queries match the rules.** Firestore rules do not filter results, so every client query asks only for documents the caller may read (see *Notifications*).

## Firestore data model

All trip data lives under `trips/{tripId}` (single trip: `VITE_TRIP_ID`, default `main`).

| Path | Purpose | Read | Write |
|---|---|---|---|
| `users/{uid}` | Private profile, read markers for chat/notifications | self | self (allow-listed fields) |
| `trips/{t}` | Trip settings, emergency info, contacts, `ticketsLocked`, `ownerUid` | approved | create: bootstrap admin; update: admin (owner immutable) |
| `trips/{t}/public/summary` | Name/destination/dates shown on the request screen | any signed-in | admin |
| `trips/{t}/members/{uid}` | Profile, `role` (admin/member), `status` (pending/approved/rejected/disabled). **Also serves as the access request.** | self, approved | see below |
| `…/itinerary/{id}` | Day-wise activities (`published` flag) | approved | admin |
| `…/tickets/{id}` | Ticket details, `passengerUids[]`, `passengerNames[]`, `filePath`, `uploadedBy`, `locked`, timestamps | approved | create: any approved (as self); update/delete: uploader if unlocked and trip not locked, or admin |
| `…/accommodations/{id}` | Hotels, confirmation document path | approved | admin |
| `…/rooms/{id}` | Room allocation (`memberUids[]`) | approved | admin |
| `…/transport/{id}` | Vehicles, drivers, pickup, `memberUids[]` | approved | admin |
| `…/expenses/{idempotencyKey}` | `amountPaise` (int), `splits{uid: paise}`, `status` | approved | see below |
| `…/settlements/{id}` | Settlement records (separate from expenses) | approved | admin |
| `…/messages/{id}` | Group chat | approved | create as self; delete own (admin: any); no edits |
| `…/announcements/{id}` | Admin announcements | approved | admin |
| `…/notifications/{id}` | In-app feed, `target` = `all`, `admins` or a uid | approved and targeted | create as self (pending users: only `access_request` to `admins`) |
| `…/pushTokens/{uid}` | FCM device tokens | self | self (approved) |
| `…/auditLogs/{id}` | Append-only history | admin | create as self; never update or delete |

Calendar dates are stored as `YYYY-MM-DD` and times as `HH:mm`, both in IST, so they never shift with the device timezone. Money is stored only as **integer paise**. Event times use `serverTimestamp()`, and the rules check `createdAt == request.time`.

### People (travellers) vs sign-in accounts

Every traveller is a document in `members`:

- **Admin-added travellers** have a random id (`p_…`), `hasLogin: false`, `status: 'approved'`, an optional email, `ageGroup` (`adult`/`child`/`infant`) and, optionally, their own share (`customShare: true` + `shareWeight`). Adults are always 100%. Children and infants otherwise use the trip defaults `childSharePercent` / `infantSharePercent` (Trip Settings, default 50 / 0). The family name is stored in `relationship`. Nobody can sign in as them, because their id is never a Firebase Auth uid.
- **Sign-in accounts** are keyed by the Firebase uid. When the admin approves one, they can link it to an existing traveller (`personId` on the account, `linkedUid` on the traveller). The account then acts as that traveller: "my tickets", "my room" and "my balance" use the traveller's id, and the account is hidden from people lists.
- Only admins can create travellers, link accounts, or set age group and share. A user cannot claim a traveller, reduce their own share, or create a traveller. 8 rule tests cover this.

**Per-head splitting:** expenses are split in proportion to `shareWeight` using the largest-remainder method in integer paise, so the parts always add up exactly. Infants (weight 0) never get a share. A "custom amount per person" split is still available for exceptions.

### Membership and approval

- A new user can only create **their own** member document, with `status: 'pending'`, `role: 'member'`, their verified Google email and a server timestamp.
- The owner (bootstrap admin) creates the trip and their own approved admin membership in one atomic batch. The rules confirm `ownerUid` via `getAfter`.
- Members can edit only profile fields (name, phone, emergency contact, family). They cannot change their own `role` or `status`.
- A rejected user can send a new request. A disabled user cannot.
- Only admins approve, reject, disable or change roles. Nobody else can change the owner's role or status.
- Each rule checks `isApproved()`, which reads the caller's member document. Revoking access takes effect on the very next request.

### Train tickets

- Any approved member can create a ticket, but only with `uploadedBy == auth.uid` and a `filePath` inside `trips/{t}/ticket/{theirUid}/…`.
- Every approved member can read every ticket.
- Update and delete are allowed to the uploader only when `locked == false` and the trip-wide `ticketsLocked == false`. The uploader cannot change `uploadedBy`, `createdAt` or `locked`. Admins can do anything, including locking.
- Field allow-list, sizes, MIME type and file size are validated.

### Expenses

- Create: approved, `createdBy == self`, `status == 'pending'`, no review fields, integer `amountPaise` between 1 and 1,000,000,000, `paidBy` must be a member, known category and split method, 1–100 split entries.
- **Idempotency:** the document id is a client-generated UUID created once per form. A retry (offline queue, double tap) writes the same document, so a duplicate cannot be created.
- Update: the owner only while `pending`, and they cannot change status or review fields. An admin can edit and review. Any status change must record `reviewedBy == admin`.
- Delete: the owner while pending, or an admin.
- **Split-sum check:** Firestore rules cannot loop over a map, so the exact-sum check runs in the client (`computeSplits`), again at approval (`reviewExpense` refuses inconsistent splits), and again in the settlement engine, which excludes and flags any approved expense whose splits do not add up. An approved expense therefore never feeds a wrong number into settlement. A stricter option is to move expense writes into an Edge Function.

### Notifications

The rules allow reading a notification only if `target` is `all`, the caller's uid, or `admins` (for admins). The client query is `where('target', 'in', ['all', uid, ...(admin ? ['admins'] : [])])`, which the rules can prove safe. An unfiltered query is rejected, and `tests/rules` checks this.

## File security (Supabase)

```
Browser ──Firebase ID token──▶ files Edge Function ──service role──▶ private bucket
                                   │ 1 verify token (Google JWKS, iss/aud/exp)
                                   │ 2 read members/{uid} with the CALLER's token (rules apply)
                                   │ 3 validate kind, extension, MIME, size, path
                                   │ 4 delete: find the record that references the file and check uploader/lock/admin
                                   └ 5 return signed URL (upload: one-time token; download: 5 min)
```

- Bucket `trip-files` is `public = false`, has no storage policies, `file_size_limit = 5 MB` and a MIME allow-list. The bucket itself enforces these limits even for signed uploads.
- Paths follow `trips/{tripId}/{kind}/{uploaderUid}/{uuid}.{ext}`. The function generates them and the client never chooses them. Path parsing rejects traversal.
- `accommodation` uploads are admin-only.
- Deleting a ticket file goes through the same checks as deleting the ticket document: uploader while unlocked, or admin. A file that no record references (an abandoned upload) can be deleted only by its uploader.
- The function lets callers use only the trip id configured in `TRIP_ID`.
- CORS allows only `ALLOWED_ORIGINS`.
- Download URLs are generated per click. Nothing is cached automatically. "Save for offline" stores a copy in IndexedDB only when the user taps it, and Profile can remove it. **Shared-device mode** keeps Firestore data in memory only. **Remove trip data from this device** clears offline tickets, cached data and push tokens.

## Push (notify function)

The function re-reads the notification with the caller's token and requires `createdBy == caller` and an age under 10 minutes. It resolves recipients from approved members only, sends through FCM HTTP v1 with the service account, and prunes invalid tokens. Push is best-effort, and the in-app feed is the source of truth.

## Known limitations / residual risk

- Audit log entries are written by clients. They are append-only and attributed to the authenticated user, but a malicious approved member could write misleading entries about their *own* actions. Moving auditing to a trusted backend would require Cloud Functions (Blaze plan) or routing writes through Edge Functions.
- Approved members can create notifications targeted at `all`. This is acceptable within a trusted family group, and the chat push is throttled on the client.
- Signed download URLs work for anyone who has the link for 5 minutes. Keep the TTL short.
- The Firebase web API key is public by design. Restrict it to your domains in Google Cloud → Credentials (HTTP referrer restriction).
