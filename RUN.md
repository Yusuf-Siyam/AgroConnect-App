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
npm run test:emulators
Push-Location backend
npm run typecheck
npm test
Pop-Location
```

`npm run test:emulators` starts Auth/Firestore/Storage, runs all TypeScript suites (including Phase 08) sequentially through a Node runner, and stops the emulators afterwards. It does not rely on Linux `&&` chaining.

## 7. Manual buyer/farmer smoke test

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

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `npm.ps1 cannot be loaded` | Run the process-scope `Set-ExecutionPolicy` command from section 1. |
| `Cannot find module '../lightningcss.win32-x64-msvc.node'` | The Windows NativeWind/lightningcss native binary is missing from `node_modules`. Close Expo, then run `Set-Location 'E:\13 Trimester\AgroApp'`, `npm install`, and `npx expo start -c`. The root `postinstall` script installs the exact nested binary when needed. To repair immediately without reinstalling everything, run `node scripts\ensure-lightningcss-windows.cjs` and retry `npx expo start -c`. |
| `'tsx'`, `firebase`, or `expo` is not recognized | Run both `npm ci --include=optional` commands from the repository root; check `Get-Location`. |
| `java is not recognized`, `JAVA_HOME is not defined correctly`, or `UnsupportedClassVersionError` | Install Java 21+, then run the `JAVA_HOME`/`PATH` commands from section 1 in that terminal. |
| `EADDRINUSE` on 8080, 9099, 9199, 4004 or 4000 | Stop the duplicate emulator/backend process. Inspect with `Get-NetTCPConnection -LocalPort 8080,9099,9199,4004,4000 -State Listen`, then stop the identified PID. |
| `curl` returns a PowerShell formatting error or wrong result | Use `curl.exe` exactly as shown. |
| Web shows `Network request failed` or a CORS error | Confirm the backend is running, `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:4000`, and `CORS_ORIGINS` includes the Expo web origin printed by `npm start`. Reload the web app. |
| Android emulator cannot reach the API | Set `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:4000` and restart Expo. Do not use `127.0.0.1` from inside the Android emulator. Firebase emulator hosts are selected automatically. |
| Physical phone cannot reach the API or emulators | Use the PC's LAN IP everywhere, bind emulator hosts to `0.0.0.0`, and keep the phone on the same trusted network. |
| Firebase `auth/configuration-not-found` or invalid API key | Use the exact demo values in section 3 and `EXPO_PUBLIC_USE_EMULATOR=true`; the Firebase emulator accepts the fake API key. |
| Stale API/emulator settings in the app | Run `npx expo start --clear` and perform a full reload. |
| `Invalid backend environment configuration` | Verify `backend\.env` exists, contains no quotes around values, and `PORT` is numeric. |

## 9. Scope limits

Windows/PowerShell execution and physical-device access are not verified in this repository; they require a Windows machine and a device. Real Firebase projects, EAS builds and payment credentials are outside this local-emulator guide.
