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
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=demo-agroconnect.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=000000000000
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
FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199
```

Leave the AI values empty for emulator-only testing. Service-account credentials are not required in emulator mode.

### AI configuration (Phase 09)

Add these to `backend\.env` only when the owner has real credentials. Never put a key in `.env` for the mobile app (`EXPO_PUBLIC_*`) or commit either `.env` file:

```text
GEMINI_API_KEY=
GEMINI_MODEL=
GEMINI_REQUEST_TIMEOUT_MS=
GEMINI_RETRIES=
AI_DAILY_MESSAGE_LIMIT=
AI_MESSAGES_PER_MINUTE=
AI_HISTORY_LIMIT=
AI_PROMPT_MAX_CHARS=
AI_MAX_OUTPUT_TOKENS=
DISEASE_MODEL_ENDPOINT=
DISEASE_MODEL_API_KEY=
DISEASE_REQUEST_TIMEOUT_MS=
AI_DAILY_DIAGNOSIS_LIMIT=
AI_DIAGNOSES_PER_MINUTE=
```

`GEMINI_MODEL` is the exact model code chosen by the owner; the repository does not pick one. `DISEASE_MODEL_ENDPOINT` must be an http(s) URL that accepts `POST { image: { data: base64, mimeType }, cropName }` and returns `{ label, confidence, alternatives: [] }`. No API key or model code is shipped in the mobile build.

**Testing with no keys:** leave `GEMINI_API_KEY`/`GEMINI_MODEL` and `DISEASE_MODEL_ENDPOINT`/`DISEASE_MODEL_API_KEY` empty, sign in as a farmer, open the **AI** tab and send a question or submit a crop photo. The app shows “AI is not configured on the server yet…” and the backend returns `503 AI_NOT_CONFIGURED`. Emulator tests never contact a real provider: they inject test doubles.

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

## 7b. Manual buyer/farmer smoke test

1. Open <http://127.0.0.1:4004> and confirm the Auth, Firestore and Storage emulators are active.
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
