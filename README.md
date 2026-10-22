# PahaadCare — Offline-First Remote Patient Monitoring (RPM) & Healthcare Platform

A demonstration Remote Patient Monitoring (RPM) and healthcare access Progressive Web Application (PWA) designed for remote and underserved Himalayan communities.

> [!IMPORTANT]
> **Hackathon Demonstration Prototype**
> This application is built exclusively for hackathon evaluation, offline synchronization demonstrations, and technical review. It is not clinically validated or intended for actual medical care. All patient profiles, biometric thresholds, and contact targets are synthetic demonstration fixtures. All alerts and escalations use local simulation and SQLite persistence without real external telecommunications (no real SMS, email, or telephone calls).

---

## Clean Installation and Startup Procedure

Follow these step-by-step instructions for a clean setup and launch from a freshly cloned repository.

### Prerequisites

- **Node.js**: v18.0+ or v20.0+ (with npm)
- **Python**: v3.11+ (Python 3.14 verified)
- **Git**
- Recommended OS: Windows 10/11, macOS, or Linux

---

### Step 1: Clone the Repository

```bash
git clone https://github.com/HARSHSINGH-17/pahadcare.git
cd pahadcare
```

---

### Step 2: Backend Setup (Python Virtual Environment)

Open a terminal in the project root:

#### Windows (PowerShell):
```powershell
# Create virtual environment
python -m venv .venv

# Activate virtual environment
.\.venv\Scripts\Activate.ps1

# Install backend dependencies
pip install -r backend/requirements.txt
```

#### macOS / Linux:
```bash
# Create virtual environment
python3 -m venv .venv

# Activate virtual environment
source .venv/bin/activate

# Install backend dependencies
pip install -r backend/requirements.txt
```

---

### Step 3: Frontend Setup (npm)

In the same project root directory:

```bash
npm install
```

---

### Step 4: Launching the Application

Run the backend and frontend in two separate terminal windows.

#### Terminal 1 — Backend API Server & Escalation Worker:

**Windows (PowerShell):**
```powershell
.\.venv\Scripts\Activate.ps1
$env:ESCALATION_WORKER_ENABLED="true"
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

**macOS / Linux:**
```bash
source .venv/bin/activate
export ESCALATION_WORKER_ENABLED=true
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

- **API Base URL**: `http://127.0.0.1:8000`
- **Interactive Swagger Documentation**: `http://127.0.0.1:8000/docs`
- **System Health Endpoint**: `http://127.0.0.1:8000/health`

#### Terminal 2 — Frontend Development Server:

```bash
npm run dev
```

- **Web Dashboard**: `http://localhost:5173`

---

### Step 5: Demonstration Login & Credentials

1. Open `http://localhost:5173` in Google Chrome or your modern browser.
2. Log in using the pre-configured synthetic clinician credentials:
   - **Username**: `clinician1`
   - **Password**: `demo-password-2026`
   - **Assigned Patients**: `PC-SYNTH01`, `PC-DEMO01`
3. Explore the live RPM dashboard, simulate vital readings, test offline IndexedDB queueing, and observe durable alert escalations.

---

### Step 6: Quick Automated Verification (Optional)

To verify all system components deterministically on a fresh install:

```powershell
# Run full backend pytest suite (160 tests)
pytest -v

# Run browser E2E test suite
pytest backend/tests/test_browser.py -v

# Run frontend unit & offline queue account isolation suite (16 tests)
npm test

# Run 10-scenario end-to-end validation runner
python backend/validate_10_scenarios.py

# Verify production single-file build
npm run build
```

---

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
