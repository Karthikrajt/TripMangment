# Testing checklist

## Automated

| Suite | Command | Covers |
|---|---|---|
| Unit | `npm test` | Rupee↔paise parsing, equal/selected/custom/trip-wide splits, exact-sum validation, settlement (including the spec example), transfer minimisation, IST date/time formatting, file type/size/MIME/path validation, CSV escaping |
| Security rules | `npm run test:rules` | 39 direct-API cases (including travellers without login and account linking): unauthenticated and pending lockout, self-only access requests, no self-approval, bootstrap admin, admin-only content, ticket create/read for all, no cross-member ticket edit/delete, locks, admin manages all tickets, expense ownership/status/amount rules, no member approvals, idempotent expense ids, chat impersonation, notification query restrictions |
| UI smoke | `npm run emulators`, then `npm run dev`, then `npm run test:e2e` | Setup → request → approve (real time) → itinerary → admin-page guard → expense → verification → settlement → chat → every page renders → audit entry → pending user gets 403 from the REST API |
| Edge Functions | `npm run check:functions` | Deno type-check |

## Manual (before each trip)

### Authentication
- [ ] Google login works on desktop Chrome, Android Chrome and iPhone Safari (also in installed PWA mode)
- [ ] First login creates `users/{uid}`
- [ ] New user sees "Request to join", submits, and the admin gets a notification
- [ ] Approve: the user's screen switches to the dashboard without a reload
- [ ] Reject: the user sees the declined message and can send a new request
- [ ] Disable an approved member: they lose access immediately, and file downloads return 403

### Tickets (needs Supabase)
- [ ] Admin uploads a PDF ticket
- [ ] Member uploads a JPG ticket for 3 passengers (2 members and 1 typed name)
- [ ] Another member sees both tickets, previews them and downloads them
- [ ] Member B has no Edit/Delete on member A's ticket. A direct `updateDoc` returns permission-denied
- [ ] The uploader edits details and replaces the document, and the old file is removed from the bucket
- [ ] Admin locks a ticket, and the uploader can no longer edit or delete it
- [ ] Trip-wide lock (Trip Settings) blocks member edits
- [ ] A `.exe`, a 6 MB PDF and a PNG renamed to `.pdf` are all rejected
- [ ] Calling `functions/v1/files` with no token, an expired token or a pending user's token returns 401/403
- [ ] An old signed URL stops working after 5 minutes
- [ ] Date and train filters (with counts) combine with search and the All / My / Uploaded tabs. Clear filters resets everything
- [ ] A ticket moves to the collapsed "Completed (n)" section from journey date + 2 days (IST). `/tickets?open=<id>` expands it and scrolls to the ticket
- [ ] "Save for offline", then airplane mode, then "Open offline copy" works. Profile lists the copy and can remove it

### Expenses
- [ ] Admin adds a child at 50% and an infant without email. A ₹1,000 "everyone" expense with 3 adults + 1 child splits ₹285.71 / ₹142.86 and the infant ₹0
- [ ] A family member signs in, and the admin links them to their existing traveller on approval. Their balance and tickets show correctly
- [ ] Equal split across all members, including remainder paise (₹100 / 3)
- [ ] Split among selected members
- [ ] Custom split: Submit is blocked until the parts add up exactly
- [ ] Admin approves it, and totals and settlement update
- [ ] Admin rejects with a note, and the submitter is notified
- [ ] The member edits their own pending expense, but cannot edit an approved one
- [ ] Offline: add an expense, see "Saved on this device", go online, and exactly one record exists
- [ ] Double-tapping Submit creates one record

### Other modules
- [ ] Itinerary: draft hidden from members, publish notifies, "Now" highlight during an activity, Directions opens Google Maps
- [ ] Hotel: confirmation document downloads, call and map buttons work
- [ ] Rooms: the "Your room" banner appears and over-capacity is flagged
- [ ] Transport: "Call driver" dials and "Navigate" opens Maps
- [ ] Chat: real-time between two phones, image and PDF attachments, unread badge, "Load older"
- [ ] Announcements: posting shows in chat, on the dashboard and as a push
- [ ] Push: enable in Profile, close the app, post an announcement from another device, and the notification arrives. Tapping it opens the right page
- [ ] Trip Live: works offline from cached data and shows "Last synced"
- [ ] PWA: install on Android (menu → Install) and iPhone (Share → Add to Home Screen), check the icon and splash screen, then launch offline
- [ ] Responsive layout at 360px, 768px and 1280px. Bottom nav on phones, sidebar on desktop
- [ ] Accessibility: text zoom to 150% still works, everything is reachable by keyboard, focus rings are visible
