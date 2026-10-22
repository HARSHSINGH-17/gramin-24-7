# PahaadCare — Offline-first healthcare access prototype

A polished demonstration PWA for a healthcare access concept for remote Himalayan communities.

## Important prototype limits
- Patient and medicine entries are sample data.
- Profile and medicine log are stored in this browser's localStorage.
- This starter does not send medical records to a server.
- Doctor and pharmacy entries are sample listings, not verified live services.
- Appointment requests are demonstrations only.
- Emergency button opens the device dialler for 112; it cannot dispatch or track an ambulance.
- Medicine status logging is implemented; reliable background medicine alerts are not yet implemented.
- RPM clinician monitoring is a protected synthetic-data prototype; local authentication, SQLite persistence, and alert lifecycle actions are not production identity, privacy, or clinical controls.
- Do not use real patient health information in this prototype.


## Patient ID, caregiver view and doctor report demo
- Each browser profile gets a generated patient ID (for example `PC-A1B2C3`).
- The Patient Records page shows medicine stock estimates and flags low stock (5 or fewer remaining).
- Patients can share a family access code with a trusted caregiver to unlock the summary on the same browser/device.
- The doctor report form demonstrates addressing a report to a patient ID; the current demo only accepts the current profile's ID.
- Medicine activity is logged locally for the family summary.

**This is a front-end demonstration only, not a live medical-record service.** Local browser storage is not secure sharing and data will not appear on a family member's separate phone or a doctor's device. Before real use, build a backend with verified patient/doctor accounts, role-based access, explicit patient consent, encrypted storage and transfer, audit logs, secure report uploads, backups, and a way to revoke caregiver access. Do not enter real patient records in this prototype.

## Requirements
- Node.js 20.19+ or 22.12+
- npm
- VS Code recommended
- Android Chrome for installable PWA testing

## Run on Windows
1. Install Node.js LTS from https://nodejs.org/
2. Install VS Code from https://code.visualstudio.com/
3. Extract this ZIP to a folder such as `C:\Projects\pahaadcare`.
4. Open the folder in VS Code.
5. In VS Code select Terminal > New Terminal.
6. Run:

   ```bash
   npm install
   npm run dev
   ```

7. Open the local URL printed by Vite, usually `http://localhost:5173`.
8. To make a production build:

   ```bash
   npm run build
   npm run preview
   ```

## Test offline mode (important)
1. Keep internet ON for the first setup and run `npm install`.
2. Run `npm run build` and wait until it finishes successfully.
3. Run `npm run preview` and open the exact local URL printed in the terminal (usually `http://localhost:4173`).
4. Leave the page open for a few seconds so Chrome can install the service worker and cache the app files.
5. In Chrome, open DevTools (F12) > Application > Service Workers and confirm a service worker is registered. If needed, reload once while online.
6. Now use DevTools > Network > `Offline` and reload the same preview URL. The app shell should be served from cache.
7. Turn `Offline` off when finished.

Do not test production offline support by stopping the Vite development server (`npm run dev`) before the first cache is created. The `localhost` URL, browser profile, and service-worker cache must be the same. Offline access is not available on a fresh browser/device before the app has loaded online at least once. When deployed, HTTPS is required for service workers (except localhost).

## Install on Android
For a real install prompt, deploy the production build to an HTTPS host, open it in Chrome on Android, and use the browser menu > Install app / Add to Home screen. Some browsers may show different wording.

## Before any real pilot
Add a production identity provider, per-role access controls, encrypted transport and storage, consent management, independent audit logging, verified clinician onboarding, data backup/recovery, secret management, privacy/legal review, clinical safety review and operational agreements with healthcare providers. The local prototype authentication and audit trail are not regulatory compliance. Replace all demo listings and test with dummy data until those controls are ready.


## Multilingual and voice demo (added)
- The header language selector provides English, Hindi, and selected phrase samples labelled Garhwali, Kumaoni, and Himachali Pahadi.
- Speaker button reads a short welcome message using the closest available browser/device voice.
- Microphone button starts browser speech recognition for pharmacy search where supported (typically Chrome; permission required).
- Regional phrase spellings are a prototype and should be reviewed by native speakers before public/clinical use.
- Speech recognition and synthesized accent depend on installed browser/device engines. The dialect options do not guarantee dialect-specific speech recognition or native accent output.
- Some interface content remains English in this time-limited prototype; do not describe this as complete translation.


## Responsive navigation update
- On mobile, the bottom icon bar is replaced with a top-left Home menu.
- The Home menu contains main sections, profile settings/edit profile, and Log out.
- Online/offline detection and status text remain; only the Wi-Fi status icon is hidden.
- Existing PWA/offline configuration and local browser data logic are retained.
- Responsive mobile refinements preserve desktop sidebar navigation.


## Project structure (latest version)
- `src/main.jsx` - app start (renders the app)
- `src/App.jsx` - onboarding, patient/doctor screens, medicines, Find Care, SOS, GPS, reports, voice
- `src/Login.jsx` - login / create Patient ID screen
- `src/storageSafety.js` - keeps app working if browser storage is blocked
- `src/styles.css` - all design (colours, layout, mobile responsive)
- Tip: press Ctrl+F in `src/App.jsx` and search "MEDICINE LIST", "pcLocate", "SOS: send message", "FIRST-TIME ONBOARDING"
- Note: variable names inside App.jsx/Login.jsx are short (e.g. `jf`, `Qf`) because this version was recovered from the built app file.
