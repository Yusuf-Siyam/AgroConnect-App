# AgroConnect

**Connecting Farmers. Empowering Agriculture.**

An AI-powered agricultural marketplace connecting farmers, buyers, and transporters in Bangladesh.
Farm-to-consumer trading with AI crop support and smart logistics, in Bangla and English.

> This README is the **main project specification**. Human developers and AI agents must follow it. See [Section 13](#13-ai-agent-working-rules) for agent rules and [Section 11](#11-development-phases) for the build order.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Progress Tracker](#2-progress-tracker)
3. [Technology Stack](#3-technology-stack)
4. [Architecture and Roles](#4-architecture-and-roles)
5. [Features](#5-features)
6. [Order Workflow](#6-order-workflow)
7. [Database Structure](#7-database-structure)
8. [Backend API](#8-backend-api)
9. [Project Structure](#9-project-structure)
10. [UI/UX and Localization](#10-uiux-and-localization)
11. [Development Phases](#11-development-phases)
12. [Standards, Security and Testing](#12-standards-security-and-testing)
13. [AI Agent Working Rules](#13-ai-agent-working-rules)
14. [Configuration and Setup](#14-configuration-and-setup)
15. [Open Decisions](#15-open-decisions)
16. [Initial AI Prompt](#16-initial-ai-prompt)

---

## 1. Project Overview

### Core Concept
Farm-to-consumer marketplace with AI crop support and smart logistics.

### Main Objectives
- Direct farmer-to-buyer trading.
- Transparent agricultural pricing.
- AI-based crop disease detection.
- AI farming assistance (Bangla and English).
- Smart delivery with GPS tracking.
- Secure payments.
- Full Bangla and English support.

### Success Goal
Deliver a secure, scalable, bilingual, AI-powered agricultural marketplace for Bangladesh.

---

## 2. Progress Tracker

Update this table at the end of every phase.

| Phase | Name | Status |
|------:|------|--------|
| 01 | Project Foundation | Complete |
| 02 | Firebase Integration | Complete |
| 03 | Authentication | Complete |
| 04 | UI Foundation | Complete |
| 05 | Farmer Module | Complete |
| 06 | Buyer Module | Complete |
| 07 | Order and Payment | Not started |
| 08 | Transporter Module | Not started |
| 09 | AI Integration | Not started |
| 10 | Communication | Not started |
| 11 | Advanced Features | Not started |
| 12 | Admin and Deployment | Not started |

Status values: `Not started` / `In progress` / `Complete` / `Blocked`.

---

## 3. Technology Stack

### Mobile Application
React Native, Expo, TypeScript, Expo Router, NativeWind, Zustand, TanStack Query, Axios, React Hook Form, Zod.

### Backend
Node.js, Express.js, TypeScript, Firebase Admin SDK, REST API.

### Firebase
Authentication, Cloud Firestore, Storage, Cloud Messaging (FCM), Firestore Security Rules.

### External Services

| Service | Purpose |
|---------|---------|
| Gemini API | AI farming assistant |
| Verified image classification model | Plant disease detection |
| Google Maps | Maps and GPS |
| Open-Meteo | Weather |
| bKash / Nagad | Payment gateway |

---

## 4. Architecture and Roles

One mobile application with four role-based dashboards.

```text
React Native App  ->  Express REST API  ->  Firebase / External Services
   (Expo Router)       (Zod, auth,           (Auth, Firestore, Storage,
                        rate limiting)         FCM, Gemini, Maps, Payments)
```

- Login uses **Firebase Authentication**. Express middleware verifies Firebase ID tokens.
- **Firestore** holds application data and powers realtime features.
- All sensitive business operations are validated by the **backend**.
- Authorization is enforced by backend middleware **and** Firestore Security Rules. Never rely on frontend role checks alone.
- **Admin accounts are provisioned securely** (e.g., server-side script or claim assignment), never through public registration.

### User Roles

| Role | Registration | Dashboard |
|------|--------------|-----------|
| Farmer | Public | `(farmer)` |
| Buyer | Public | `(buyer)` |
| Transporter | Public (with vehicle details, subject to verification) | `(transporter)` |
| Admin | Secure provisioning only | `(admin)` |

After authentication, users are redirected to the dashboard for their role.

---

## 5. Features

### A. Authentication
Splash screen, onboarding, registration, login, OTP verification where supported, password recovery, role-based navigation, profile management.

### B. Farmer Module
Dashboard, product add/edit/delete, product images, harvest information, inventory management, accept/reject orders, sales analytics, earnings summary, weather forecast, market price information, harvest calendar.

### C. Buyer Module
Marketplace, categories, search and filters, product details, farmer profiles, cart, wishlist, checkout, order history, ratings and reviews, group buying, emergency listings.

### D. Transporter Module
Registration, vehicle information, available delivery jobs, accept/reject jobs, pickup confirmation, GPS tracking, delivery status, earnings and commission.

### E. AI Features
1. Plant disease detection from leaf images.
2. Bangla and English AI farming assistant.
3. Disease symptoms and prevention guidance.
4. Fertilizer and irrigation guidance.
5. Crop price prediction (**only with sufficient historical data**).

> AI results are **advisory, not guaranteed diagnoses**. Low-confidence results must be shown as uncertain.

### F. Logistics
Distance-based pricing, weight-based pricing, local unit conversion, pickup and drop-off locations, live tracking during active delivery, delivery confirmation.

### G. Communication
Buyer-Farmer chat, Buyer-Transporter chat, admin support, realtime messages, push notifications, unread indicators.

### H. Admin Module
User verification, user management, product moderation, complaint management, order monitoring, payment monitoring, commission management, platform analytics.

### I. Advanced Features
Bangla voice assistant, QR product traceability, farmer reputation score, smart group buying, offline farming information, smart demand forecasting.

---

## 6. Order Workflow

### Statuses

```text
pending -> accepted -> paid -> shipment_accepted -> collected -> shipped -> delivered
```

Also supported: `rejected`, `cancelled`.

### Farmer transitions implemented in Phase 05B

A product-owning farmer may move an order only from `pending` to `accepted` or `rejected`. Acceptance runs in a Firestore transaction, re-checks product ownership and available stock, decrements stock, and writes a stock-history entry. Rejection requires a 3–200 character reason. Farmers never set `paid`, `shipped` or `delivered`; those transitions remain Phase 07 system/transporter rules.

### Proposed Transition Rules (finalize in Phase 07)

| From | To | Allowed actor |
|------|----|---------------|
| pending | accepted / rejected | Farmer (owner of the products) |
| pending | cancelled | Buyer |
| accepted | paid | **System only**, after server-side payment verification |
| accepted | cancelled | Buyer, Farmer, Admin |
| paid | shipment_accepted | Transporter (accepts the delivery job) |
| shipment_accepted | collected | Transporter (pickup confirmation) |
| collected | shipped | Transporter |
| shipped | delivered | Transporter (delivery confirmation) |
| paid or later | cancelled | Admin only (refund handling) |

### Rules
- Validate **every** status transition on the backend.
- Users must never be able to set payment or delivery status arbitrarily.
- Store order item price snapshots at order time.
- Use Firestore transactions for stock updates.
- Prevent duplicate orders and duplicate payments (idempotency keys).
- Verify payment gateway callbacks server-side.

---

## 7. Database Structure

Cloud Firestore collections:

```text
users/                  products/              orders/
carts/                  wishlists/             transporters/
deliveryJobs/           payments/              chats/
messages/               notifications/         reviews/
cropDiagnoses/          farmingConversations/  priceHistory/
groupPurchases/         harvestRecords/        productBatches/
reports/
```

### Data Rules
- Use document IDs consistently.
- Store timestamps; maintain `createdAt` and `updatedAt` on every document.
- Paginate large collections.
- Create required Firestore indexes.
- Snapshot prices in order items.
- Use transactions for stock updates.
- Prevent duplicate payments and orders.
- Restrict all access through Security Rules.

---

## 8. Backend API

REST modules:

```text
/api/auth      /api/users     /api/products   /api/cart
/api/orders    /api/payments  /api/delivery   /api/ai
/api/weather   /api/market    /api/chat       /api/reviews
/api/admin
```

Required middleware and practices:
- Authentication middleware (Firebase ID token verification).
- Role authorization middleware.
- Zod request validation.
- Central error handling with a consistent error format.
- Rate limiting.
- Secure environment variables.
- Server-side verification of payment callbacks.

---

## 9. Project Structure

```text
AgroConnect/
├── app/
│   ├── (auth)/
│   ├── (farmer)/
│   ├── (buyer)/
│   ├── (transporter)/
│   ├── (admin)/
│   ├── chat/
│   └── profile/
├── components/
│   ├── common/
│   ├── product/
│   ├── order/
│   └── dashboard/
├── features/
│   ├── authentication/   ├── farmer/        ├── buyer/
│   ├── transporter/      ├── marketplace/   ├── orders/
│   ├── payments/         ├── logistics/     ├── ai/
│   ├── notifications/    └── admin/
├── services/
├── hooks/
├── store/
├── types/
├── utils/
├── constants/
├── assets/
└── backend/
    └── src/
        ├── config/
        ├── middleware/
        ├── modules/
        ├── routes/
        ├── services/
        ├── validators/
        ├── types/
        └── server.ts
```

Adapt the structure when necessary, without creating unnecessary complexity.

**Phase 01 adaptation:** Expo Router routes live in `src/app/` (the Expo SDK 58 default), with the remaining mobile code under `src/`. The backend lives in `backend/src/`. Empty folders contain `.gitkeep` files until their phases are implemented.

**Phase 02 additions:** Firebase client initialization and push-token helpers live in `src/services/`. The Admin SDK initializer lives in `backend/src/config/firebase.ts`. Security Rules and their Firebase CLI configuration live in `firebase/firestore.rules`, `firebase/storage.rules`, and `firebase.json`.

**Phase 03 additions:** Auth forms and profile parsing live in `src/features/authentication/`; session state is provided by `src/providers/AuthProvider.tsx`. Backend verification is in `backend/src/middleware/auth.ts`, profile endpoints in `backend/src/routes/auth.ts`, and secure admin provisioning in `backend/src/scripts/provision-admin.ts`. Rule-based role screens live under the `(farmer)`, `(buyer)`, `(transporter)`, and `(admin)` route groups.

**Phase 04 additions:** Design tokens live in `src/theme/` and `tailwind.config.js`. Reusable UI lives in `src/components/common/`, shared dashboard chrome in `src/components/navigation/`, and typed Bangla/English dictionaries in `src/locales/` with the locale store in `src/store/locale.ts`.

**Phase 05A additions:** Farmer-only tabs live in `src/components/navigation/FarmerTabs.tsx` with screens under `src/app/(farmer)/`. Product forms, services and upload helpers live in `src/features/farmer/` and `src/components/product/`. The backend product API is in `backend/src/routes/products.ts` and `backend/src/services/product.ts`. Product writes are backend-only in Firestore rules; images must be uploaded to `products/{uid}/{productId}/...` and validated server-side. Composite indexes are declared in `firebase/firestore.indexes.json`.

---

## 10. UI/UX and Localization

### Design Guidelines
- Primary color: green. Secondary color: dark green.
- Clean white/light background.
- Consistent spacing, reusable components.
- Rounded cards and buttons.
- Clear typography, accessible touch targets.
- Loading, error, and empty states on every data screen.

### Localization
- Bangla (default) and English.
- Centralized translation files. **No hardcoded UI text.**
- Localized notifications and order statuses.
- Supported units: kg, gram, মণ (maund), ton, with conversion.
- **Confirmation needed:** the conversion utility currently uses the common Bangladesh value `1 mon = 40 kg` (`MAUND_TO_KG` in `backend/src/utils/units.ts` and `src/features/farmer/types.ts`). Confirm this before production pricing.

---

## 11. Development Phases

**Follow phases in order. Never generate the whole application in one response.**

For every phase:
1. Inspect existing project files.
2. Understand the existing architecture.
3. Implement only the requested phase.
4. Write complete, working code.
5. Install only necessary dependencies.
6. Explain changed files briefly.
7. Run TypeScript checks and relevant tests.
8. Fix errors before finishing.
9. Update the Progress Tracker above.
10. Wait for approval before starting the next phase.

Do not use fake APIs, hardcoded production data, or mock success responses. If credentials are unavailable, create safe configuration placeholders and document the setup.

### Phase 01 - Project Foundation
- [x] Create Expo TypeScript project
- [x] Configure Expo Router
- [x] Configure NativeWind
- [x] Install essential dependencies
- [x] Create folder structure
- [x] Configure environment variables
- [x] Set up Git
- [x] Prepare Node.js Express TypeScript backend

**Result:** clean, runnable mobile and backend projects.

### Phase 02 - Firebase Integration
- [x] Configure Firebase, Authentication, Firestore, Storage, FCM
- [x] Set up Firebase Admin SDK
- [x] Create Security Rules

**Result:** working Firebase connection (code and configuration complete; live verification requires project credentials — see §14).

### Phase 03 - Authentication
- [x] Login, registration, OTP (where available), password recovery
- [x] User profile and role selection
- [x] Backend token verification
- [x] Protected routes

**Result:** role-based authentication is implemented end to end and verified against the local Firebase Auth/Firestore emulators. Live sign-in against a real Firebase project still requires real credentials (see §14). Phone OTP is documented as unavailable on this Expo Go-compatible stack rather than simulated.

### Phase 04 - UI Foundation
- [x] Global theme and reusable components
- [x] Common navigation
- [x] Bangla/English localization
- [x] Loading and error components

**Result:** consistent mobile design system with Bangla as the default language, English switching, shared role-dashboard chrome, and reusable state components.

### Phase 05 - Farmer Module
- [x] Dashboard
- [x] Product CRUD and image uploads (Part 5A)
- [x] Inventory (Part 5B)
- [x] Order management (Part 5B)
- [x] Sales analytics (Part 5B)
- [x] Weather and market prices (Part 5B)

**Result:** Phase 05 complete. Part 5A delivered the farmer tabs, real-count dashboard, product CRUD, ownership checks and image uploads. Part 5B delivered transactional stock adjustments and history, pending-order accept/reject with stock re-checks, real order/payment analytics, an Open-Meteo weather proxy with caching and GPS/district fallback, and read-only `priceHistory` market screens with an explicit “no data yet” state. Order creation and all `paid`/`shipped`/`delivered` transitions remain Phase 07.

### Phase 06 - Buyer Module
- [x] Marketplace, categories, search and filters (Part 6A)
- [x] Product details (Part 6A)
- [x] Cart and wishlist (Part 6B)
- [x] Checkout (Part 6B)
- [x] Reviews (Part 6B)

**Result:** Phase 06 complete. Part 6A delivered buyer tabs, a real marketplace with localized categories, search, filters, sorting and pagination, buyer-only product detail, and a privacy-safe public farmer profile. Part 6B delivered backend-managed cart and wishlist operations with live prices and stock/min-order checks, a React Hook Form + Zod checkout preview grouped by farmer, and transactionally aggregated reviews gated by a real delivered order containing the product. Order submission and all `paid`/`shipped`/`delivered` transitions remain Phase 07.

### Phase 07 - Order and Payment
- [ ] Order creation and stock validation
- [ ] Order status management
- [ ] Payment initiation and verification
- [ ] Transaction history

**Result:** secure order and payment workflow.

### Phase 08 - Transporter Module
- [ ] Transporter profile and vehicle information
- [ ] Delivery jobs and job acceptance
- [ ] Delivery status and GPS tracking
- [ ] Delivery pricing
- [ ] Earnings

**Result:** working Transporter Dashboard.

### Phase 09 - AI Integration
- [ ] Crop image upload
- [ ] Disease classification
- [ ] Gemini farming assistant with Bangla responses
- [ ] Diagnosis history
- [ ] Confidence handling

**Result:** working AI farming features.

### Phase 10 - Communication
- [ ] Realtime chat and message history
- [ ] Unread indicators
- [ ] Push notifications
- [ ] Admin support

**Result:** working communication system.

### Phase 11 - Advanced Features
Implement individually:
- [ ] Voice assistant
- [ ] Crop price prediction
- [ ] Group buying
- [ ] QR traceability
- [ ] Harvest calendar
- [ ] Offline mode
- [ ] Farmer reputation

**Result:** advanced AgroConnect features.

### Phase 12 - Admin and Deployment
- [ ] Admin dashboard
- [ ] User verification
- [ ] Product moderation
- [ ] Complaint management
- [ ] Order monitoring
- [ ] Analytics
- [ ] Security audit
- [ ] Testing
- [ ] Production deployment

**Result:** production-ready application.

### Cross-Phase Dependencies

- **Phases 05 and 06 depend on Phase 07 for order data.** Build the order screens and checkout UI in their phases, but keep order submission disabled (clearly labeled, not mocked) until Phase 07 delivers the real order API.
- **Phase 07 payments need gateway credentials** (bKash/Nagad merchant or sandbox access).
- **Phase 08 delivery jobs** require orders from Phase 07 to reach `paid`.
- **Phase 10 push notifications** require the FCM setup from Phase 02.

---

## 12. Standards, Security and Testing

### Coding Standards
- TypeScript throughout; avoid unnecessary `any`.
- Modular architecture; reusable components.
- Separate UI, business logic, and API calls.
- Zustand for client state; TanStack Query for server state.
- Zod for validation; React Hook Form for forms.
- Consistent API error handling.
- Transactions for critical operations.
- Tests for important business logic.

### Security Baseline
- Never expose API secrets. Gemini, payment, and Firebase Admin credentials live **only** on the backend.
- Verify ID tokens on every protected route.
- Enforce roles on the backend and in Firestore Rules.
- Validate all input with Zod.
- Rate limit public and AI endpoints.
- Verify payment callbacks server-side.
- Provision admins through a secure channel only.

### Testing Requirements

| Area | Must cover |
|------|-----------|
| Authentication | Valid and invalid login, role permissions, unauthorized access, session persistence |
| Marketplace | Product creation and updates, search and filters, image uploads |
| Orders | Stock validation, duplicate order prevention, status transitions, payment verification |
| Logistics | Job acceptance, location permissions, tracking, delivery confirmation |
| AI | Image upload, prediction handling, Bangla responses, invalid and uncertain results |
| Security | Unauthorized API access, role escalation, data validation, Firestore Rules, secret protection |

---

## 13. AI Agent Working Rules

You are the senior full-stack developer for AgroConnect.

1. Follow this README as the main specification.
2. Inspect existing code before changing anything.
3. Work on one phase at a time; do not start future phases.
4. Keep existing working features intact.
5. Generate complete, runnable code.
6. Never skip necessary configuration.
7. Never invent API credentials. Never expose secrets.
8. Test each completed phase and never fabricate test results.
9. Maintain project documentation.
10. If blocked, report the exact blocker instead of claiming completion.
11. If a requirement conflicts with an earlier instruction, state the conflict before proceeding.

### Token Optimization
- Do not repeat project explanations.
- Do not regenerate unchanged files.
- Show only relevant code and file changes.
- Keep progress summaries short.
- Reuse existing components; avoid unnecessary dependencies.

### Completion Report (after each phase)

```text
STATUS: COMPLETE / BLOCKED
Phase:
Completed:
Files Created:
Files Updated:
Dependencies:
Tests:            (label each: TESTED / REVIEWED / UNVERIFIED)
Errors:
Assumptions:
Remaining Tasks:
Next Phase:
```

**STOP after each phase and wait for user approval.**

---

## 14. Configuration and Setup

> Commands and scripts are added here as each phase is completed. Do not document commands that do not exist yet.

### Prerequisites
- Node.js (current LTS) and npm
- Git
- Firebase project (Authentication, Firestore, Storage, Cloud Messaging enabled)
- Android Studio and/or Xcode for device builds

### Environment Variables (placeholders only, never commit real values)

**Mobile (`.env`)**: only non-secret, public configuration.

```text
EXPO_PUBLIC_API_BASE_URL=
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=       # restrict by app and API in Google Cloud
# Development only: true connects the app to local Auth/Firestore emulators
EXPO_PUBLIC_USE_EMULATOR=
```

**Backend (`backend/.env`)**: secrets, server only.

```text
PORT=
NODE_ENV=
CORS_ORIGINS=
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
# Optional: defaults to <FIREBASE_PROJECT_ID>.appspot.com
FIREBASE_STORAGE_BUCKET=
# Local emulators only; leave empty for a real project
FIREBASE_AUTH_EMULATOR_HOST=
FIRESTORE_EMULATOR_HOST=
GEMINI_API_KEY=
DISEASE_MODEL_ENDPOINT=
DISEASE_MODEL_API_KEY=
BKASH_APP_KEY=
BKASH_APP_SECRET=
BKASH_USERNAME=
BKASH_PASSWORD=
BKASH_BASE_URL=
NAGAD_MERCHANT_ID=
NAGAD_PUBLIC_KEY=
NAGAD_PRIVATE_KEY=
NAGAD_BASE_URL=
```

Add `.env` and service-account files to `.gitignore`. Provide `.env.example` files with empty values.

### Phase 01 setup and scripts

Copy `.env.example` to `.env` (mobile) and `backend/.env.example` to `backend/.env` (backend), then fill in only the values needed for the environment. Real credentials and service-account files are never committed.

Mobile (project root):

```bash
npm install
npm start              # Expo dev server
npm run web            # Metro web dev server
npm run android        # Android
npm run ios            # iOS
npm run typecheck      # tsc --noEmit
npm run lint           # expo lint
npx expo-doctor        # dependency/config diagnostics
```

Backend (`backend/`):

```bash
npm install
npm run dev            # tsx watch src/server.ts
npm run build          # TypeScript -> dist/
npm start              # node dist/server.js
npm run typecheck      # tsc --noEmit
npm test               # built-in node:test suite
```

The backend exposes `GET /api/health` and a consistent JSON 404/error format. After installing native dependencies, use a development build if Expo Go reports a missing native module; later phases will add more native modules.

### Phase 02 setup (Firebase)

1. Create a Firebase project and enable **Authentication**, **Cloud Firestore**, **Cloud Storage**, and **Cloud Messaging**.
2. Register a **web app** in that project; copy its config values into the root `.env` as `EXPO_PUBLIC_FIREBASE_*` (the Firebase JS SDK uses this web-style config on native too).
3. Create a least-privilege service account in Firebase **Settings → Service accounts**. Store the downloaded JSON outside the repository and copy its `project_id`, `client_email`, and `private_key` into `backend/.env` (the supported method in this phase). Keep `FIREBASE_STORAGE_BUCKET` empty unless a non-default bucket is used.
4. Deploy the rules with the Firebase CLI (external tool, not a project script): `firebase use --add <project-id>`, then `firebase deploy --only firestore:rules,firestore:indexes,storage`. The source of truth is `firebase/firestore.rules` and `firebase/storage.rules`, wired through `firebase.json`.
5. Admin access is a server-assigned custom claim (`admin: true`). Never add admins through public registration or client-side code.
6. FCM: `expo-notifications` is installed and configured via the app config plugin with a `default` Android channel. Remote push requires a development/production build (not Expo Go on Android, SDK 53+). Configure Android FCM V1 credentials per <https://docs.expo.dev/push-notifications/fcm-credentials.md> and iOS APNs credentials via Expo EAS. Set `extra.eas.projectId` in the app config when the EAS project exists so Expo push tokens can be issued; no placeholder ID is committed.

Firebase initialization is lazy: the app and backend start without credentials, and `getFirebase()` / `getFirebaseAdmin()` fail with explicit configuration errors only when a Firebase service is actually requested. Backend configuration is covered by `npm test` in `backend/`. A live Firebase connection and push delivery can only be verified after real credentials and a device build are available.

### Phase 03 setup (Authentication)

1. In Firebase **Authentication → Sign-in method**, enable **Email/Password**. Add your web/mobile auth domains to **Authorized domains** when deploying.
2. Fill the root `.env` Firebase public values and `backend/.env` Admin SDK values described above. The mobile app works without `EXPO_PUBLIC_API_BASE_URL`, but backend token-verification/profile calls require it.
3. Public registration accepts `farmer`, `buyer`, and `transporter`. Transporter registration also stores vehicle type and registration number; all new accounts start with `isVerified: false`. Admin is never offered in public registration.
4. To create an admin, first register the user normally and copy its Firebase UID. Then run from `backend/`: `npm run admin:provision -- <firebase-uid>`. This sets the trusted `admin` and `role: admin` custom claims and updates the user's Firestore profile. The user must sign in again (or refresh the token) to receive the claim.
5. Protected backend endpoints are `GET /api/auth/me` and `PATCH /api/auth/profile`; both require `Authorization: Bearer <Firebase ID token>`. The mobile Axios client injects the token automatically. These routes are rate limited (60 requests/minute per client) and validated with Zod; role escalation through `PATCH /api/auth/profile` is rejected because roles are never accepted in the request body.
6. Protected screens use Expo Router guards and role checks. Frontend guards improve UX only; the backend and Firestore Rules remain the real authorization boundary.
7. **Phone OTP:** the installed Firebase JS SDK does not support native phone authentication in Expo Go. The OTP screen states this explicitly and no mock verification is performed. Native OTP would require `@react-native-firebase/auth`, `expo-dev-client`, configuration files, and a development build.

Verification performed in this repository: mobile `npm run typecheck`, `npm run lint`, `npx expo-doctor`, and web/iOS/Android exports; backend `npm run typecheck`, `npm run build`, and 12 `npm test` assertions. `npm run test:emulators` additionally verifies registration/login, valid/invalid tokens, protected-role responses, admin claim propagation, and Firestore Rules locally. Live email/password sign-in and token verification against a real Firebase project are **UNVERIFIED** without real Firebase credentials.

### Phase 04 setup (UI Foundation)

- Design tokens are centralized in `src/theme/index.ts`; Tailwind class tokens are declared in `tailwind.config.js`. Primary green, dark-green secondary, light canvas, rounded cards/buttons, and accessible touch targets are the baseline.
- Reusable components: `AppText`, `Button`, `TextField`, `Card`, `Screen`, `StateView`, `RoleBadge`, `RolePicker`, `LanguageSwitcher`, `RoleGuard`, and `SplashScreen` in `src/components/common/`.
- Common navigation is provided by `src/components/navigation/RoleNavigator.tsx` and `DashboardHeader.tsx`, giving all four role dashboards the same header, role badge, profile action, and language switcher.
- Localization uses typed flat dictionaries in `src/locales/en.ts` and `src/locales/bn.ts`. Bangla is the default; a device locale of `en` selects English on first launch. A user's choice is persisted with Zustand and can be changed from Profile. `app.json` declares `bn` and `en` as supported locales and disables RTL (both languages are LTR). Web text receives the matching `lang` attribute.
- Loading, error, and empty states use `StateView`; profile mutations show a real loading/error state with retry. No simulated data or mock success responses were added.
- This phase needs no new credentials. Verification: mobile `npm run typecheck`, `npm run lint`, `npx expo-doctor` (20/20), and web/iOS/Android exports. Visual review on physical devices is **UNVERIFIED** in this environment.

### Local Firebase emulator verification (Auth + Firestore + Storage)

The Firebase CLI is a root dev dependency. Install Java 21+ (required by the current Firestore emulator), then install both dependency trees. Windows/PowerShell users should follow [RUN.md](RUN.md) for exact commands and platform-specific host settings:

```bash
npm install
cd backend && npm install && cd ..
```

Start the emulators for interactive use:

```bash
npm run emulators
```

This starts Auth on `127.0.0.1:9099`, Firestore on `127.0.0.1:8080`, Storage on `127.0.0.1:9199`, and the Emulator Suite UI on <http://127.0.0.1:4004> (4004 avoids the backend's default port 4000). The project is `demo-agroconnect` from `.firebaserc`; Firestore loads `firebase/firestore.rules` and indexes from `firebase/firestore.indexes.json`, and Storage loads `firebase/storage.rules` through `firebase.json`.

Run the automated Phase 3 checks (emulators start and stop automatically):

```bash
npm run test:emulators
```

The suite uses real emulator tokens and real HTTP calls. Phase 3 covers registration/login, a valid token returning 200 from `GET /api/auth/me`, 401 for missing/invalid tokens, 403 for a non-admin token on `GET /api/auth/admin-status`, trusted Admin SDK claim propagation, rejection of public admin creation, and Firestore rules denial for unauthorized reads/writes. Phase 05A additionally verifies buyer 403s, Zod validation, product ownership, image-URL ownership, pagination/search/status filtering/soft delete, signed-in active-product reads, backend-only Firestore writes, and owner-only Storage uploads. Phase 05B verifies Zod validation on every new endpoint, product ownership, negative-stock rejection, stock-history entries, pending-only order transitions, stock re-checks, no payment/delivery fields written by accept/reject, analytics from real orders/payments, read-only market history, and weather caching/fallback against a local fake provider. Phase 06A verifies buyer-only marketplace access, hidden drafts/out-of-stock products, category/price/district/unit/search filters, sorting, pagination, and privacy-safe farmer profiles. Phase 06B verifies buyer-only cart/wishlist/review access, Zod validation, live cart prices, stock/min-order checks, own/inactive product blocks, multiple-farmer carts, wishlist duplicate prevention, delivered-order review eligibility, one review per buyer/product, and transactional product/farmer rating aggregates.

For manual mobile/backend testing against the emulators, set `EXPO_PUBLIC_USE_EMULATOR=true` in the root `.env` and restart Expo. The client connects Auth, Firestore and Storage to emulators **only** when this value is exactly `true`; real-project `.env` files must leave it empty or set it to `false`. The client selects `127.0.0.1` on web/iOS and `10.0.2.2` on Android; set `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST` to override it for a physical device. Set these in `backend/.env` (no service account is needed in emulator mode):

`backend/.env`:

```text
FIREBASE_PROJECT_ID=demo-agroconnect
FIREBASE_STORAGE_BUCKET=demo-agroconnect.appspot.com
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199
CORS_ORIGINS=http://localhost:8081,http://127.0.0.1:8081
```

Root `.env`, when the mobile app also calls the local backend:

```text
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:4000
```

Use `http://10.0.2.2:4000` as `EXPO_PUBLIC_API_BASE_URL` on an Android emulator. Physical devices cannot reach `127.0.0.1` or `10.0.2.2` on the development machine; use this computer's LAN IP, bind the emulators to `0.0.0.0` in `firebase.json`, and set `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST` to that LAN IP. Expo inlines `EXPO_PUBLIC_*` values at build time, so perform a full app reload after changing `.env`.

### Phase 05A setup (Products)

1. The farmer dashboard, products list, product form and image picker are available under `/farmer`. The dashboard calls `GET /api/products/stats`; no counts are hard-coded.
2. Product images are compressed on device and uploaded to `products/{uid}/{productId}/...`. Storage rules allow owner writes only, accept JPEG/PNG/WebP, and cap files at 5 MB. The backend rejects image URLs outside the authenticated farmer's UID/product path.
3. Firestore product documents are written only through the backend. Signed-in users can read `active` products; owners and admins can also read their drafts. `GET /api/products` supports `search`, `status`, `limit` and `offset`.
4. Deploy indexes with the rules: `npx firebase deploy --only firestore:rules,firestore:indexes,storage`.

### Phase 05B setup (Orders, stock, analytics, weather, market)

1. Farmer navigation exposes Inventory, Orders, Sales analytics, Weather and Market prices through the More tab. All screens call the authenticated backend; no app data is hard-coded or mocked.
2. `PATCH /api/products/:id/stock` sets an absolute non-negative quantity in a transaction, automatically sets `out_of_stock` at zero, reactivates an `out_of_stock` product when stock is added, and appends to `products/{id}/stockHistory`. Accepting an order performs the same transactional stock update with a server-generated history reason.
3. `GET /api/orders` supports `status`, `limit` and `offset`; `GET /api/orders/:id`, `POST /api/orders/:id/accept` and `POST /api/orders/:id/reject` are ownership-scoped. Only `pending` orders can be accepted or rejected, and rejected orders require a reason.
4. `GET /api/analytics/farmer` derives counts from `orders` and revenue from completed `payments` that belong to a matching order. No analytics figures are cached or invented.
5. `GET /api/weather` proxies Open-Meteo from the backend, so no provider key or URL is embedded in the app. It tries GPS coordinates first, then the profile `district` (editable in Profile), then a manually entered district. Requests time out after `WEATHER_REQUEST_TIMEOUT_MS` (default 7 s) and successful responses are cached in memory for `WEATHER_CACHE_TTL_MS` (default 10 min). Override `OPEN_METEO_FORECAST_URL` and `OPEN_METEO_GEOCODING_URL` in `backend/.env` only for a trusted proxy or tests.
6. `GET /api/market` reads **only** real documents in `priceHistory`; it never seeds or invents prices. Until data is imported, the screen shows “No data yet”. Load verified observations from a trusted JSON file:

```bash
cd backend
npm run market:import -- path/to/price-history.json
```

The file must be a non-empty array of `{ "crop", "district", "date" (YYYY-MM-DD), "price", "unit" (kg|mon|ton), "source" }`. These are observed historical prices, not forecasts. Deploy the added `priceHistory` indexes with the Firestore indexes.

### Real Firebase project setup (after emulator verification)

1. Leave `EXPO_PUBLIC_USE_EMULATOR` empty/false and remove both emulator host variables from `backend/.env`. Fill the real public Firebase values in root `.env` and service-account values in `backend/.env`; never commit either file.
2. Authenticate and select the real project, then deploy the same rules used by the emulator:

```bash
npx firebase login
npx firebase use --add <your-firebase-project-id>
npx firebase deploy --only firestore:rules,firestore:indexes,storage
```

3. Enable Email/Password sign-in, add authorized domains, and provision admins only with `cd backend && npm run admin:provision -- <firebase-uid>`. Live Firebase behavior remains unverified until these real credentials and project settings are supplied.

---

## 15. Open Decisions

Resolve these early; record the outcome here.

| # | Decision | Needed by | Outcome |
|--:|----------|-----------|---------|
| 1 | Firebase client library: Firebase JS SDK vs React Native Firebase (affects Expo Go vs development builds, FCM, phone OTP) | Phase 02 | **Firebase JS SDK v13** for Auth/Firestore/Storage (Expo Go compatible) + `expo-notifications` for FCM/APNs tokens. React Native Firebase is not used. Native phone OTP is not supported by this JS-SDK path on mobile, so Phase 03 ships email/password + recovery and provides an explicit informational OTP screen; revisit if phone OTP/Crashlytics become mandatory. |
| 2 | Disease classification model: which verified model or hosted service, supported crops, and licensing | Phase 09 | Pending |
| 3 | Payment gateway access: bKash/Nagad merchant or sandbox credentials and callback URL hosting | Phase 07 | Pending |
| 4 | Admin provisioning method (script vs custom claims) | Phase 03 | **Server-side CLI script** that sets the trusted `admin` / `role: admin` custom claim on an existing Firebase Auth user and updates its Firestore profile. There is no public admin registration route. |
| 5 | Backend hosting and deployment target | Phase 12 | Pending |
| 6 | Source of market price and price history data (price prediction requires sufficient history) | Phase 05 / 11 | **Partially unblocked:** Phase 05B provides a real `priceHistory` schema, authenticated read API, importer for trusted observations and an explicit empty state. The trusted source itself remains to be selected; no sample prices are bundled. |
| 7 | Commission rates and delivery pricing formula | Phase 07 / 08 | Pending |

---

## 16. Initial AI Prompt

Start the build with this instruction:

> Read README.md completely. Inspect the existing repository. Understand the architecture and requirements. Start Phase 01 only. Build the Expo TypeScript mobile foundation and Node.js Express TypeScript backend. Do not implement future phases. Test everything, update documentation, report changed files and wait for approval.

---

## License

To be decided by the project owner.

**AgroConnect - Connecting Farmers. Empowering Agriculture.**
