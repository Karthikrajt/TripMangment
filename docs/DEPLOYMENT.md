# Deployment guide

Target cost: **₹0/month**. Keep Firebase on the **Spark (free) plan** and Supabase on the **Free plan**. Nothing here needs billing. Free-tier limits change, so check the providers' current pricing pages before you go live.

## 1. Firebase project

1. Create a project at https://console.firebase.google.com. You can skip Google Analytics.
2. **Authentication → Sign-in method → Google → Enable.** Add your Hosting domain(s) under *Authorized domains*. The default `*.web.app` and `*.firebaseapp.com` domains are already listed.
3. **Firestore Database → Create database** (production mode). Pick a region close to India, such as `asia-south1`.
4. **Project settings → Your apps → Web app**. Register the app and copy its config into `.env.local`:
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`.
   (These values are public identifiers, not secrets. The security rules protect the data.)
5. Choose the bootstrap admin, the Google account that creates the trip:
   - `.env.local`: `VITE_BOOTSTRAP_ADMIN_EMAIL=you@gmail.com`
   - `firestore.rules`: change `'you@gmail.com'` in `isBootstrapAdmin()` to the same address.
6. Install the CLI and deploy the rules and indexes:

```bash
npx firebase login
```

```bash
cp .firebaserc.example .firebaserc
```

Edit `.firebaserc` and set your project id, then deploy:

```bash
npx firebase deploy --only firestore:rules,firestore:indexes
```

## 2. Supabase (private file storage and Edge Functions)

1. Create a project at https://supabase.com, choosing a region close to your users (for example, Mumbai).
2. Create the private bucket: open **SQL Editor** and run `supabase/migrations/0001_private_trip_files.sql`. This creates `trip-files` with `public = false`, a 5 MB limit and a MIME allow-list. Do **not** add storage policies.
3. Copy **Project URL** and the **anon public key** into `.env.local` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Never put the `service_role` key in any `VITE_` variable.
4. Set the function secrets (stored server-side only):

```bash
npx supabase login
```

```bash
npx supabase link --project-ref <your-ref>
```

```bash
npx supabase secrets set FIREBASE_PROJECT_ID=<firebase-project-id> TRIP_ID=main ALLOWED_ORIGINS=https://<project>.web.app,https://<project>.firebaseapp.com,http://localhost:5173 APP_URL=https://<project>.web.app
```

   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into functions automatically.
5. Deploy the functions. `verify_jwt = false` is set in `supabase/config.toml` because callers send a Firebase token, which each function verifies itself:

```bash
npx supabase functions deploy files --no-verify-jwt
```

```bash
npx supabase functions deploy notify --no-verify-jwt
```

## 3. Push notifications & reminders

In-app notifications (the bell) work without this step. For notifications on
the phone when the app is closed:

1. Firebase console → **Project settings → Cloud Messaging → Web Push certificates → Generate key pair**. Put the public key in `VITE_FIREBASE_VAPID_KEY` in `.env.production` (it is public, safe to commit).
2. Google Cloud console → **APIs & Services** → make sure **Firebase Cloud Messaging API** (V1) is enabled.
3. Nothing else: the Deploy workflow stores the `FIREBASE_SERVICE_ACCOUNT` GitHub secret as the Supabase secret `FCM_SERVICE_ACCOUNT` (used by the `notify` function), and the **Reminders** workflow (`.github/workflows/reminders.yml`) uses the same secret.

Manual setup without GitHub Actions: `npx supabase secrets set FCM_SERVICE_ACCOUNT="$(base64 -w0 service-account.json)"` (plain JSON also works).

**Reminders** (GitHub Actions, every 15 minutes, free on public repos; exits in seconds outside the trip dates):

| When | Who |
|---|---|
| 7 PM the evening before a train | that ticket's passengers |
| 3 hours before departure | that ticket's passengers |
| 1 hour before a vehicle pickup | people assigned to the vehicle |
| 7 AM on each trip day | everyone (the day's plan) |

Each reminder is sent once (marker docs in `trips/main/reminders`), shows in the bell and goes to phones that turned notifications on. Run it by hand: Actions → Reminders → Run workflow. GitHub pauses scheduled workflows after 60 days without commits; re-enable it there if needed. Test locally: `cd scripts/reminders && npm ci && cd ../.. && npm run test:reminders`.

On iPhone, web push only works after the user adds the app to the Home Screen (iOS 16.4+).

## 4. Build and host

```bash
npm ci
```

```bash
npm test
```

```bash
npm run build
```

```bash
npx firebase deploy --only hosting
```

Open `https://<project>.web.app` and sign in with the bootstrap admin account. You will see **Set up your trip**: create it, then share the link with the family. Everyone else signs in and taps **Send request**. You approve them under **Member Approvals**.

## 5. After going live

- Confirm the Google Cloud project has **no billing account**, or set a budget alert at ₹1. See [COSTS.md](COSTS.md).
- Run through [TESTING.md](TESTING.md) on a real Android phone and a real iPhone.
- To make another member an admin, use Member Management → *Make admin*.

## Environment variables

| Variable | Where | Secret? |
|---|---|---|
| `VITE_FIREBASE_*` | browser | No (public identifiers) |
| `VITE_FIREBASE_VAPID_KEY` | browser | No (public key) |
| `VITE_TRIP_ID` | browser | No |
| `VITE_BOOTSTRAP_ADMIN_EMAIL` | browser + firestore.rules | No |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | browser | No (anon key is public; the bucket has no anon policies) |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions only (auto-injected) | **Yes** |
| `FCM_SERVICE_ACCOUNT` | Edge Functions only | **Yes** |
| `FIREBASE_PROJECT_ID`, `TRIP_ID`, `ALLOWED_ORIGINS`, `APP_URL` | Edge Functions | No |
