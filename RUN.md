# Run AgroConnect locally on Windows (PowerShell)

This guide covers the local Firebase emulator setup only. It uses `npm` because the repository contains `package-lock.json` files. No real Firebase credentials are needed in emulator mode.

> The exact Windows error output was not supplied, so the troubleshooting section covers the likely PowerShell and host/network failures. If a command still fails, paste the command and the complete error text.

## 1. Prerequisites

Open **PowerShell** in the repository:

```powershell
Set-Location 'E:\13 Trimester\AgroApp'
Get-Location
node --version
npm --version
java -version
```

The Firestore emulator requires Java 21+. If `java` is missing, install Temurin 21 (for example with `winget install --id EclipseAdoptium.Temurin.21.JDK -e`), reopen PowerShell, and verify again. If Java is installed but not on `PATH`, use this in **each** terminal that starts the emulators:

```powershell
$jdk = Get-ChildItem 'C:\Program Files\Eclipse Adoptium' -Directory -Filter 'jdk-21*' | Select-Object -First 1
if ($jdk) {
  $env:JAVA_HOME = $jdk.FullName
  $env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
}
java -version
```

If `npm.ps1 cannot be loaded` appears, allow scripts only for the current process (no permanent machine-wide change):

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

## 2. Install dependencies

From the repository root:

```powershell
npm ci --include=optional
Push-Location backend
npm ci --include=optional
Pop-Location
```

`lightningcss` uses platform-specific native binaries. If `node_modules` was created on another OS or copied from another machine, delete it before reinstalling so npm can select the correct binary for Windows. The root `postinstall` script also repairs a missing nested Windows binary automatically when you run `npm ci` or `npm install`.

## 3. Create `.env` files

The templates are committed; actual `.env` files are ignored:

```powershell
Copy-Item .env.example .env -Force
Copy-Item backend\.env.example backend\.env -Force
notepad .env
notepad backend\.env
```

Use these values for web + local emulators (`notepad` values are plain `KEY=value`, with no quotes):

`E:\13 Trimester\AgroApp\.env` (adjust drive/path to your checkout):

```text
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:4000
EXPO_PUBLIC_FIREBASE_API_KEY=fake-api-key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-agroconnect.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=demo-agroconnect
EXPO_PUBLIC_EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=000000000000
EXPO_PUBLIC_FIREBASE_APP_ID=1:000000000000:web:0000000000000000000000
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=
EXPO_PUBLIC_USE_EMULATOR=true
EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=
```

`E:\13 Trimester\AgroApp\backend\.env`:

```text
PORT=4000
NODE_ENV=development
CORS_ORIGINS=http://localhost:8081,http://127.0.0.1:8081
FIREBASE_PROJECT_ID=demo-agroconnect
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
FIREBASE_STORAGE_BUCKET=demo-agroconnect.appspot.com
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
```

Leave the AI values empty for emulator-only testing. Service-account credentials are not required in emulator mode.

### AI configuration (Phase 09 and unverified AI photo suggestions)

Add these to `backend\.env` only when the owner has real credentials. Never put a key in `.env` for the mobile app (`EXPO_PUBLIC_*`) or commit either `.env` file:

```text
# Farming assistant (text only)
GEMINI_API_KEY=
GEMINI_MODEL=
GEMINI_REQUEST_TIMEOUT_MS=
GEMINI_RETRIES=
AI_DAILY_MESSAGE_LIMIT=
AI_MESSAGES_PER_MINUTE=
AI_HISTORY_LIMIT=
AI_PROMPT_MAX_CHARS=
AI_MAX_OUTPUT_TOKENS=

# AI photo suggestions: none | gemini | external
DISEASE_PROVIDER=
GEMINI_VISION_MODEL=gemini-3.5-flash-lite
GEMINI_VISION_TIMEOUT_MS=
GEMINI_VISION_RETRIES=
GEMINI_VISION_TOTAL_TIMEOUT_MS=
AI_CHECK_IMAGE_PATH=
DISEASE_MODEL_ENDPOINT=
DISEASE_MODEL_API_KEY=
DISEASE_REQUEST_TIMEOUT_MS=
AI_DAILY_DIAGNOSIS_LIMIT=
AI_DIAGNOSES_PER_MINUTE=
```

- `GEMINI_MODEL` is the exact model code chosen by the owner for the text assistant; the repository does not pick one by default. During live debugging on 2026-11-24, `gemini-flash-latest` returned HTTP 503 and `gemini-2.5-flash` returned HTTP 404 (“no longer available to new users”); `gemini-3.5-flash-lite` completed a real text request. Confirm availability again before changing this value.
- The text assistant uses the documented, still-supported `generateContent` REST endpoint because the Interactions endpoint took 30–45 seconds for the same prompt on this account. Backend logs record the HTTP status and redacted upstream error fields; keys and request bodies are never logged.
- `DISEASE_PROVIDER` defaults to `none`, which disables photo suggestions. Use `gemini` with `GEMINI_VISION_MODEL` set to an image-capable model code and `GEMINI_API_KEY`, or `external` with `DISEASE_MODEL_ENDPOINT` and `DISEASE_MODEL_API_KEY`. The existing classifier adapter is preserved for a future verified model. `gemini-3.5-flash-lite` is present in the live model list, supports `generateContent`, and completed a real inline-image Interactions request on 2026-11-24; the observed call took about 55 seconds, so `GEMINI_VISION_TIMEOUT_MS` defaults to 90 seconds and is independent of the 15-second chat timeout. Both the Interactions and `generateContent` endpoints later returned 503 “high demand” for this exact model, which is a provider capacity issue, not a missing key or unsupported model.
- Temporary image-provider failures (429/500/502/503/504) get at most `GEMINI_VISION_RETRIES` retries (default 2, hard cap 3, so at most 4 attempts) with exponential backoff, jitter and `Retry-After` support. `GEMINI_VISION_TOTAL_TIMEOUT_MS` (default 110s) is the wall-clock budget for all attempts and waits; it must be at least `GEMINI_VISION_TIMEOUT_MS` and at most the app's 120s request timeout. Permanent 400/401/403/404 errors are never retried. Concurrent identical taps are coalesced in one API process, and the mobile screen reuses its selected photo for a manual retry.
- `DISEASE_MODEL_ENDPOINT` must be an http(s) URL that accepts `POST { image: { data: base64, mimeType }, cropName }` and returns `{ label, confidence, alternatives: [] }`.
- No API key or model code is shipped in the mobile build. The mobile app reads no Gemini environment variables.

Run `npm run ai:check-vision` after editing `backend\.env`. With `DISEASE_PROVIDER=gemini` it now makes real inline-image request(s) through the same advisor and retry policy used by `/api/ai/diagnose`; set `AI_CHECK_IMAGE_PATH` to check a real crop photo instead of the built-in 1x1 PNG. It prints only operational metadata, never the key, prompt body or raw response. For `DISEASE_PROVIDER=external` it remains configuration-only. If the image diagnostic reports `AI_PROVIDER_UNAVAILABLE` with upstream `service_unavailable`, Gemini is temporarily overloaded; retry later rather than changing the model or adding a fake response. Backend logs keep the HTTP status, attempt number, retry decision and redacted upstream fields internally; no key, image or prompt body is logged. Run `npm run ai:check-text` only when you intentionally want a real Gemini request with the configured assistant key/model; it prints no key, prompt body or raw response, and provider failures are logged with the HTTP status and redacted upstream fields.

**Restart the backend after any AI env change.** The API reads `backend\.env` once when its process starts; `npm run ai:check-vision` is a separate fresh process, so it can succeed while an older still-running API returns `AI_NOT_CONFIGURED`. After restarting with `npm run dev` (or rebuilding and using `npm start`), check:

```powershell
curl.exe http://127.0.0.1:4000/api/health
```

The response includes secret-free `ai` flags. For Gemini, expect `"provider":"gemini"`, `"photoAdviceConfigured":true`, `"geminiApiKeyPresent":true` and `"geminiVisionModelPresent":true`. No key or model value is exposed. The same snapshot is available at authenticated `GET /api/ai/status`.

For a phone smoke test, sign in as a farmer, open **AI → Disease check**, accept the one-time consent, then take or choose a real crop photo. The app sends the compressed image inline to `/api/ai/diagnose`; no Cloudinary upload or signed URL is needed. A suggestion can take 30–90 seconds. Temporary failures show a translated “temporarily unavailable”, rate-limit or timeout message and keep the selected photo so **Retry with this photo** can send it again without picking a new image; repeated taps cannot start a second request. If the buttons are disabled or the screen says suggestions are not configured, recheck the `/api/health` flags and restart the API process before changing credentials.

**Output wording:** photo results are always **AI photo suggestions**, never diagnoses. Gemini returns an `unclear|possible|likely` uncertainty band, never a percentage. The backend rejects numeric doses, chemical names and product instructions before saving. Each result is stored with `source: "gemini_vision"` (or `external_classifier`), `verified: false` and an extension-officer disclaimer. A farmer must acknowledge a one-time consent screen before taking or choosing a photo.

**Testing with no keys:** leave the AI values empty, sign in as a farmer, open the **AI** tab and send a question. For photo suggestions with `DISEASE_PROVIDER=none`, the app shows “AI photo suggestions are not enabled on the server yet…” and the backend returns `503 AI_NOT_CONFIGURED`. Emulator and unit tests never contact a real provider: they inject test doubles.

**UNVERIFIED for AI photo suggestions:** quality or safety of suggestions for Bangladesh crops; behavior on a real infected crop photo rather than the tiny verification image; and mobile camera/gallery behavior on a physical device. Current diagnosis images are sent inline as base64, processed in memory and never stored; Cloudinary assets are read only for old diagnosis history. `npm run ai:check-vision` makes real Gemini request(s) with bounded retries for the Gemini provider; automated unit tests still use fakes and never contact a provider. Server-side EXIF removal is not implemented; the app relies on mobile re-encoding and the 5 MB/magic-byte checks, whose metadata behavior remains UNVERIFIED.

### Host by target

| Target | `EXPO_PUBLIC_API_BASE_URL` | Firebase emulator host |
|---|---|---|
| Web browser / iOS Simulator | `http://127.0.0.1:4000` | Auto: `127.0.0.1` |
| Android emulator | `http://10.0.2.2:4000` | Auto: `10.0.2.2` |
| Physical phone on the same Wi-Fi | `http://<LAN-IP>:4000` | Set `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=<LAN-IP>` |

For a physical phone, also set `"host": "0.0.0.0"` on each emulator in `firebase.json`, set the three backend emulator hosts to the same `<LAN-IP>`, and restart everything. Only do this on a trusted network. Expo inlines `EXPO_PUBLIC_*` values at build time, so perform a full app reload after changing `.env`.

## 4. Start in order: emulators, backend, mobile

Use three PowerShell terminals.

**Terminal 1 — Firebase emulators:**

```powershell
Set-Location 'E:\13 Trimester\AgroApp'
npm run emulators
```

Wait until the CLI reports that all emulators are ready. Auth is on `127.0.0.1:9099`, Firestore on `127.0.0.1:8080`, Storage on `127.0.0.1:9199`, and the UI on <http://127.0.0.1:4004>.

**Terminal 2 — backend:**

```powershell
Set-Location 'E:\13 Trimester\AgroApp\backend'
npm run dev
```

**Terminal 3 — Expo, then press `w`:**

```powershell
Set-Location 'E:\13 Trimester\AgroApp'
npm start
```

Press `w` in the Expo terminal to open the web app. Keep all three terminals open; use `Ctrl+C` to stop the mobile app, backend, then emulators.

### Persistent emulator data (optional)

In **Terminal 1**, use this instead of `npm run emulators` when you want users/products/orders/chats to survive an emulator restart:

```powershell
npm run emulators:persist
```

This runs `firebase emulators:start` with both `--import ./emulator-data` and `--export-on-exit ./emulator-data`. The command is a single plain `npm run` call — no Unix-only `&&`/`mkdir -p` chaining — so it works in Windows PowerShell. On the first run the `.\emulator-data` folder does not exist; the Firebase CLI skips the import with a warning and starts normally, then creates the folder during a clean exit. Do **not** pre-create the folder manually, because the CLI renames a temporary export directory into place. Every later start imports the saved data and exports it again on clean exit.

> **Important:** stop the emulators with `Ctrl+C` in that terminal. `Ctrl+C` is a clean signal (SIGINT) and triggers `--export-on-exit`. Closing the terminal window abruptly, killing the process, or a crash may lose data created since the last clean stop.

`emulator-data/` contains real local user data and is git-ignored — never commit, upload or share it. To start from an empty database, stop the emulators first, then delete the `emulator-data` folder and run `npm run emulators:persist` again.

`npm run test:emulators` deliberately starts fresh emulator instances without this folder; stop the persistent emulator before running the test suite to avoid port conflicts.

## 5. Confirm the backend and 401 response

In a fourth terminal:

```powershell
curl.exe -i http://127.0.0.1:4000/api/health
curl.exe -i http://127.0.0.1:4000/api/auth/me
```

`/api/health` should return HTTP `200` with `"status":"ok"`. `/api/auth/me` should return HTTP `401` with `UNAUTHORIZED`. Use `curl.exe`, not `curl`, because PowerShell aliases `curl` to `Invoke-WebRequest`.

## 6. Run checks

Stop the interactive emulators and backend first; `npm run test:emulators` starts its own emulator instances on the same ports.

```powershell
Set-Location 'E:\13 Trimester\AgroApp'
npx tsc --noEmit
npm run lint
npm run check:i18n
npm run test:mobile
npm run test:emulators
Push-Location backend
npm run typecheck
npm test
Pop-Location
```

`npm run check:i18n` fails on literal user-facing JSX text/string props with a small ignore list for format and unit tokens, so hardcoded copy cannot be reintroduced. `npm run test:mobile` runs the pure mobile helper tests (Phase 10 chat IDs/validation/templates/routing plus auth error mapping and locale key parity). `npm run test:emulators` starts Auth/Firestore/Storage, runs all TypeScript suites (including Phase 10A/10B and the Phase 10 gap suite) sequentially through a Node runner, and stops the emulators afterwards. It does not rely on Linux `&&` chaining. Emulator suites inject a push-provider test double; they never contact a real push service.

## 7. Manual buyer/farmer smoke test

### Phase 11 implemented smoke checks (local emulator)

- **Reputation (STEP 1):** as buyer, complete an eligible delivered order flow and submit a review; farmer profile/product detail shows backend-computed reputation or "New farmer" when below minimum reviews. Admin can POST `/api/admin/reputation/recompute`.
- **Harvest calendar (STEP 2):** farmer creates/edits/deletes harvest records; list/calendar views read backend data only.
- **QR traceability (STEP 3):** farmer creates a batch from owned harvest/product data and gets QR code; authenticated user scans trace code and sees only public trace fields (no private contact/internal IDs).
- **Emergency listings (STEP 4):** farmer creates/cancels emergency discount (5-50%, max 72h, one active per product/farmer). Buyer sees deal in marketplace/deals; cart/order snapshot uses server-computed effective emergency price.
- **Group buying (STEP 5):** farmer creates group (5-40%, max 7 days, max 50 participants). Buyers join idempotently; success creates/accepts real orders through canonical path; expiry/failure cancels through canonical path. Admin evaluate endpoint: `POST /api/admin/group-purchases/evaluate`.

### Phase 11 deferred by owner (NOT smoke-tested/implemented)

- **STEP 6 Crop price prediction:** DEFERRED by owner. No prediction endpoint/card/CSV prediction import behavior added in this scope.
- **STEP 7 Offline mode:** DEFERRED by owner. No TanStack Query persistence, offline banner, write-block queue, or bundled guides added.
- **STEP 8 Voice assistant:** DEFERRED by owner. No STT/TTS adapters, mic controls, or speech permissions added.

## 7c. Real Firebase on the Spark plan (no Firebase Storage; Cloudinary images)

Use this when testing against a real Firebase project on the free **Spark** plan. Firebase Auth/Firestore remain on Firebase. Product and crop-diagnosis images use Cloudinary (signed uploads from backend), so no Firebase Storage plan/rules are required.

### Exact env values

`E:\13 Trimester\AgroApp\.env` (mobile, public values only):

```text
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:4000
EXPO_PUBLIC_FIREBASE_API_KEY=<your-web-api-key>
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=<your-project>.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=<your-project-id>
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=<sender-id>
EXPO_PUBLIC_FIREBASE_APP_ID=<app-id>
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=
EXPO_PUBLIC_USE_EMULATOR=false
EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=
```

`E:\13 Trimester\AgroApp\backend\.env` (backend, never commit real secrets):

```text
PORT=4000
NODE_ENV=development
CORS_ORIGINS=http://localhost:8081,http://127.0.0.1:8081
FIREBASE_PROJECT_ID=<your-project-id>
FIREBASE_CLIENT_EMAIL=<service-account-email>
FIREBASE_PRIVATE_KEY=<service-account-private-key>
PRODUCT_IMAGE_REQUIRED=false
FIREBASE_AUTH_EMULATOR_HOST=
FIRESTORE_EMULATOR_HOST=
CLOUDINARY_CLOUD_NAME=<your-cloud-name>
CLOUDINARY_API_KEY=<your-api-key>
CLOUDINARY_API_SECRET=<your-api-secret>
```

Notes:

- Cloudinary secrets are backend-only. Never put `CLOUDINARY_API_SECRET` in mobile `.env` or any `EXPO_PUBLIC_*` variable.
- Mobile upload availability is backend-driven via `GET /api/uploads/config`. If Cloudinary is not configured, product/diagnosis upload UI shows a clear bn/en “not configured” message and the rest of the screen keeps working.
- `PRODUCT_IMAGE_REQUIRED=false` is the default. When `true`, active products require at least one valid Cloudinary image URL owned by that farmer/product; drafts may still have no image.
- Product images are public Cloudinary assets under `agroconnect/products/{uid}/{productId}`. Diagnosis images are uploaded as Cloudinary `authenticated` assets under `agroconnect/diagnoses/{uid}` and must be served through short-lived signed backend URLs; they are not public.

### Firebase deploy command on Spark

On Spark, deploy Firestore only (no Storage rules/targets):

```powershell
npx firebase deploy --only firestore:rules,firestore:indexes --project <your-project-id>
```

Do **not** use `--only storage` or include `storage` in deploy targets.

### Cloudinary setup (user creates values in Cloudinary console)

1. Create/use a free Cloudinary account and copy Cloud Name, API Key, and API Secret from the Cloudinary console/dashboard.
2. Put those values only in `backend/.env` as `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. Do not commit them.
3. Keep backend running with those env vars. Mobile calls `POST /api/uploads/sign` for signed upload params; backend decides folder and asset type.
4. UNVERIFIED (not run here): real Cloudinary upload/delete/signed-delivery behavior against your account; Cloudinary free-plan limits/enforcement for file size, format, quota, authenticated delivery, and rate limits.

## 7d. Manual buyer/farmer smoke test

1. Open <http://127.0.0.1:4004> and confirm the Auth and Firestore emulators are active.
2. In the app, register a **farmer**, create a product, set available stock, and publish it as active.
3. Log out and register a **buyer** (or use a separate browser profile). Open the marketplace, search/filter for the product, view its detail page, add it to the cart and wishlist, and open the checkout preview.
4. Confirm the cart shows the current backend price and grouped farmer summary. Real order submission is available (Phase 07A), but no order can become `paid` until deferred Phase 07B.

### Phase 08 dev seed (emulator only)

With the emulators running and the backend not required for the seed itself, create a real `paid` order plus its delivery job:

```powershell
npm run seed:dev-paid-order -- --verify-transporter
```

The script refuses to run unless `FIRESTORE_EMULATOR_HOST` is set and `NODE_ENV` is not `production`. It creates or reuses three demo users, a product, a paid order and one delivery job. Default credentials are printed after it finishes. It is a dev-only script and is never bundled into the app.

### Phase 08 mobile smoke test

1. Run the seed above, start the backend and Expo, and sign in as `transporter.demo@agroconnect.test` / `SeedDemo123!`.
2. Open the Transporter tab group. Complete the profile form first if it is empty; verification stays backend-controlled (`--verify-transporter` on the seed makes this demo user verified).
3. In **Jobs**, accept the seeded job. In **My Deliveries**, open it, confirm pickup, then start delivery. The six-digit code appears only after pickup.
4. Sign in as `buyer.demo@agroconnect.test` / `SeedDemo123!` in another profile, open the seeded order detail, and confirm the code and latest location appear. Give the code back to the transporter.
5. The transporter confirms delivery with the code; the buyer then sees the review prompt linking to each purchased product. Earnings appear on the transporter dashboard and profile.
6. Location sharing is foreground-only for about 15 seconds and uses `expo-location`; no background location permission is requested. Real-device GPS behavior must be checked manually on a phone or simulator.

## 8. Phase 10 communication smoke test

All steps below use the local emulators. Chat/message/notification writes are performed by the backend; the app only listens to Firestore. No sample message text is seeded by any script.

### 8.1 Two-user chat (buyer ↔ farmer, then buyer ↔ transporter)

1. Start emulators, backend and Expo as in section 4. Use two browser profiles or two devices so both accounts stay signed in.
2. Register a **farmer** in the first profile and a **buyer** in the second. As the farmer, publish at least one active product with stock.
3. As the buyer, open the marketplace, tap that product's farmer profile, then tap **Message farmer**. The thread opens with the farmer's display name only (no phone/email).
4. Send a short text. The farmer's **Messages** screen shows the thread and an unread badge; opening it shows the same message via the realtime listener and clears the unread count. Replies from either side appear live in both sessions.
5. For delivery chat, run `npm run seed:dev-paid-order -- --verify-transporter` (section 7) and sign in as the seeded buyer and verified transporter. The buyer opens the paid order detail and taps **Message transporter**; the transporter opens the assigned delivery detail and taps **Message buyer**. Exchange a text both ways to confirm the deterministic `bt_{orderId}` thread.
6. Try an empty or >1000-character draft: **Send** stays disabled. Only text is accepted; there are no attachment controls.

### 8.2 Admin support seed and thread

1. Sign in as a normal user (any role) in one profile. Open **Messages → Contact support** and send a support message. This creates the deterministic `support_{userId}` thread.
2. In the Auth emulator UI (<http://127.0.0.1:4004>), note the UID of an account to promote, or read your own `uid` from `GET /api/auth/me` with its bearer token. With the emulators running and `backend\.env` configured, provision that real user as an admin (no new seed script):

   ```powershell
   Push-Location backend
   npm run admin:provision -- <firebase-uid>
   Pop-Location
   ```

   The script grants the `admin`/`role: admin` custom claim, updates the Firestore profile and revokes refresh tokens. Sign out and sign in again so the new claim is in the ID token.
3. As the admin, open **Messages**. Only support threads are listed; the unread badge comes from the `support` pseudonym. Open the thread and reply — messages are sent as `AgroConnect Support`, not the admin's personal identity.
4. The originating user sees the reply live and a `support_reply` notification on **Messages**. Confirm an admin cannot open a non-support chat by URL or API (403/permission-denied) and that a non-admin cannot reply as support.

### 8.3 Notification center and order events

1. In any role dashboard, tap the **bell** in the header. The unread badge comes from the owner's realtime notification listener; the notification center itself uses the owner-only REST list/count endpoints with Previous/Next pagination.
2. Trigger real order/delivery actions with the seeded demo accounts from section 7: placing an order notifies the farmer; accept/reject/cancel notifies the buyer/farmer recipient; transporter accept, collect, ship and deliver notify the buyer/farmer recipients. The collected notification says only that the delivery code is ready — check the order detail screen for the actual code.
3. Tap an unread notification to mark it read and open its role-allowed target: buyers open `/buyer/orders/{id}`, farmers open `/farmer/orders/{id}`, and admins may open only `/chat/support_{userId}` threads. A wrong-role target is not opened and shows a localized message.
4. Use **Mark all as read** to clear the caller's unread count; another signed-in user's notifications are unaffected. An empty account shows the localized empty state.

### 8.4 Real FCM/APNs setup (not part of emulator mode)

1. Configure an actual Firebase project and add its EAS project ID (`extra.eas.projectId` in `app.json`, normally via `eas init`). Put real service-account values in `backend\.env`; never put keys or tokens in the mobile `.env`.
2. Enable Cloud Messaging for the project. Android needs a development/production build with Firebase credentials; iOS needs APNs credentials configured. Expo Go cannot receive remote push on Android from SDK 53 onward (`expo-notifications` still works for local notifications).
3. Build a development client: `npx expo run:android` / `npx expo run:ios`, or `eas build --profile development`. Install it on a physical device, sign in, and allow notification permission. The app uploads only the native device token to `users/{uid}/devices/{tokenHash}`; the backend sends via Firebase Admin Messaging. An Expo push token, when available, is not uploaded or used for delivery.
4. Send a chat message from a second account and observe the system notification on the recipient's device; tapping it opens the role-allowed `/chat/...` thread or order detail and marks the notification read. Notification text comes from `type` + `params` templates and never contains message content or a delivery code.

**Real push delivery is UNVERIFIED.** The automated suite uses a push-provider test double and the emulator has no FCM/APNs connection. No physical-device delivery has been observed in this repository.

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| `npm.ps1 cannot be loaded` | Run the process-scope `Set-ExecutionPolicy` command from section 1. |
| `Cannot find module '../lightningcss.win32-x64-msvc.node'` | The Windows NativeWind/lightningcss native binary is missing from `node_modules`. Close Expo, then run `Set-Location 'E:\13 Trimester\AgroApp'`, `npm install`, and `npx expo start -c`. The root `postinstall` script installs the exact nested binary when needed. To repair immediately without reinstalling everything, run `node scripts\ensure-lightningcss-windows.cjs` and retry `npx expo start -c`. |
| `'tsx'`, `firebase`, or `expo` is not recognized | Run both `npm ci --include=optional` commands from the repository root; check `Get-Location`. |
| `java is not recognized`, `JAVA_HOME is not defined correctly`, or `UnsupportedClassVersionError` | Install Java 21+, then run the `JAVA_HOME`/`PATH` commands from section 1 in that terminal. |
| `EADDRINUSE` on 8080, 9099, 9199, 4004 or 4000 | Stop the duplicate emulator/backend process (including a persistent `npm run emulators:persist` session before `npm run test:emulators`). Inspect with `Get-NetTCPConnection -LocalPort 8080,9099,9199,4004,4000 -State Listen`, then stop the identified PID. |
| `curl` returns a PowerShell formatting error or wrong result | Use `curl.exe` exactly as shown. |
| Web shows `Network request failed` or a CORS error | Confirm the backend is running, `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:4000`, and `CORS_ORIGINS` includes the Expo web origin printed by `npm start`. Reload the web app. |
| Android emulator cannot reach the API | Set `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:4000` and restart Expo. Do not use `127.0.0.1` from inside the Android emulator. Firebase emulator hosts are selected automatically. |
| Physical phone cannot reach the API or emulators | Use the PC's LAN IP everywhere, bind emulator hosts to `0.0.0.0`, and keep the phone on the same trusted network. |
| Firebase `auth/configuration-not-found` or invalid API key | Use the exact demo values in section 3 and `EXPO_PUBLIC_USE_EMULATOR=true`; the Firebase emulator accepts the fake API key. |
| Stale API/emulator settings in the app | Run `npx expo start --clear` and perform a full reload. |
| Routing and guards: a farmer More tools page opens the dashboard instead, a deep link/refresh bounces to the role home, or a wrong role lands in the wrong area | Farmer/buyer visible tabs are isolated in a `(tabs)` route group; tool/detail pages stay outside it and keep the same public URL. Do not add `href: null` for a reachable page in a tab navigator: Expo Router SDK 58 hides it and replaces the focused route with the initial tab. `resolveRouteAccess` owns loading, signed-out return-path login, profile-error retry/sign-out, exact-role allow, wrong-role home, unknown-page home and suspended sign-out states; clear app storage/session if a stale return path persists. |
| `Invalid backend environment configuration` | Verify `backend\.env` exists, contains no quotes around values, and `PORT` is numeric. |
| Chat list stays empty or shows a load error | Confirm `EXPO_PUBLIC_USE_EMULATOR=true`, both accounts are signed in, and the backend is running. All chat/message writes are backend-only; the client cannot create them directly. |
| Admin cannot see a support thread | Sign out and back in after `npm run admin:provision -- <uid>` so the refreshed admin claim is in the ID token. Admins see only `type == 'support'` threads. |
| No system notification on a device | Emulator mode cannot deliver remote push. Use a development build with real FCM/APNs credentials (section 8.3); in-app notifications still appear on the Messages screen. |
| App starts in English on an English device, or the language resets after reinstall | Bangla is now the first-launch default. A persisted device choice is restored from AsyncStorage; for a signed-in user who never chose locally, `preferredLanguage` is adopted from the profile. |
| Language changes only one screen, or fails after a profile save | Every screen subscribes to the Zustand locale store. A local change is mirrored through `PATCH /api/auth/profile` on a best-effort basis; a failed mirror is swallowed and the device choice still works. |
| English words still appear in the UI | Run `npm run check:i18n`. Move each reported string into `src/locales/en.ts` and `src/locales/bn.ts` and render it with `t()`. Only format/unit tokens are ignored. |
| Register role is preselected, a role tap does nothing, or no error appears when skipped | Use the `Pressable` radio cards. Only Farmer/Buyer/Transporter are offered (never Admin), no role is preselected, submitting without one shows the localized `roleRequired` error, and the chosen role is saved to the real profile. |
| Login reveals whether the email or password was wrong | All wrong-credential Firebase codes now render one generic message. Too many attempts has its own localized message. |
| Emulator/network outage shows a vague error | `auth/network-request-failed` and `auth/emulator-config-failed` map to the localized unreachable-service message. Confirm the emulators and backend are running. |
| Forgot-password confirms whether an email exists | Success is always the same neutral message. The reset-link note appears only when `EXPO_PUBLIC_USE_EMULATOR=true` and points to `http://127.0.0.1:9099/emulator/v1/projects/demo-agroconnect/oobCodes`; it is never rendered in production. |
| `firebase-export-*` folders appear as untracked | Both `emulator-data/` and `firebase-export-*` are git-ignored. Local emulator exports contain user data and must never be committed. |

## 10. Scope limits

Windows/PowerShell execution and physical-device access are not verified in this repository; they require a Windows machine and a device. Real Firebase projects, EAS builds, payment credentials and real FCM/APNs delivery are outside this local-emulator guide; Phase 10 real push is explicitly UNVERIFIED.
