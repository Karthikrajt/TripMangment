# Cost and quota guidance

Goal: **₹0/month**. A family trip of 10–60 people fits well inside free tiers if you follow these points.

> Limits below were current when this was written. **Check the providers' pricing pages before deployment.** Free tiers are not guaranteed and can change.

| Service | Free allowance (approx.) | Typical trip usage |
|---|---|---|
| Firestore (Spark) | 50k reads/day, 20k writes/day, 1 GiB stored, 10 GiB/month egress | A few thousand reads/day while the trip is active |
| Firebase Auth | Google sign-in free (MAU cap well above family size) | <100 users |
| Firebase Hosting | 10 GB storage, 360 MB/day transfer | App shell is about 1 MB, cached by the service worker |
| FCM | Free | — |
| Supabase Free | 1 GB storage, 5 GB egress, 500k Edge Function invocations/month. **Free projects pause after about 1 week of inactivity.** | Tickets/receipts at 50–500 KB each: well under 1 GB |
| Google Maps | URLs only, no API calls | ₹0 |

## Built-in optimisations

- Listeners start only after approval and only for the screen in view. Members, notifications (latest 50) and chat (latest 50) share one listener each, which also drive the badges.
- Firestore offline persistence serves repeat visits from cache, so only changes are billed.
- Large photos (receipts and photographed tickets over 1.2 MB) are resized and compressed before upload.
- Files are never auto-cached. Signed URLs are generated only on click.
- Push for chat is throttled (at most one per sender every 2 minutes).
- Admin "Check usage" (Trip Reports) uses count aggregations (about 1 read per 1,000 documents) and is run on demand only.
- Supabase JS is lazy-loaded only when uploading.

## Offline cache cost

To make every page work offline, each phone reads all trip collections once in the background, at most every 6 hours (or when the user changes settings). For a trip with about 300 records and 20 phones that is at most ~24,000 reads/day in the worst case, usually far less – under the 50,000/day free limit. Ticket files are downloaded once per device and only again if a ticket's document is replaced.

## Monitoring

1. **Trip Reports → Free-tier usage & quota** shows document counts, estimated Firestore storage and actual Supabase storage, and warns at 80%.
2. Firebase console → Firestore → *Usage* tab: daily reads/writes.
3. Supabase dashboard → *Reports / Usage*: storage, egress, function invocations.
4. Google Cloud → Billing: keep the project **without a billing account** (Spark). If you ever link billing, create a **budget alert** (for example ₹100) first.
5. Supabase pauses free projects that are inactive for about a week. Open the app or the dashboard during long planning gaps, or files will be unavailable until the project is resumed.

## After the trip

Export the Expenses and Settlement CSVs (Trip Reports). Then delete old chat attachments and receipts if storage is close to the limit.
