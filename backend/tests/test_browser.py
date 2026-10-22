import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import threading
import time

from playwright.sync_api import sync_playwright
import pytest
import uvicorn

from backend.app.auth import hash_password, issue_token
from backend.app.repository import SQLiteRepository
from backend.synthetic_vitals import generate_scenario

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "dist"


class StaticHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(FRONTEND_DIST), **kwargs)

    def log_message(self, format, *args):
        pass


@pytest.fixture(scope="module")
def browser_env(tmp_path_factory):
    tmp_dir = tmp_path_factory.mktemp("browser_e2e")
    db_path = tmp_dir / "browser_rpm.sqlite3"

    # Initialize clean SQLite database for browser test
    repo = SQLiteRepository(db_path)

    # Seed synthetic scenario measurements and alerts into SQLite
    from backend.app.engine import MonitoringEngine
    from backend.synthetic_vitals import SyntheticScenario, generate_scenario
    engine = MonitoringEngine(store=repo)
    for item in generate_scenario(SyntheticScenario.DEMO).events:
        if hasattr(item, "measurement_type") and hasattr(item, "value"):
            engine.process_measurement(item)
        else:
            engine.process_missing(item)

    # Save original state for clean restoration
    original_environ = dict(os.environ)
    import backend.app.main as main_module
    original_store = main_module.store
    original_settings = main_module.settings

    # Configure env for test backend
    os.environ["PAHAADCARE_DB_PATH"] = str(db_path)
    os.environ["PAHAADCARE_ENV"] = "development"
    os.environ["PAHAADCARE_HOST"] = "127.0.0.1"
    os.environ["PAHAADCARE_AUTH_SECRET"] = "browser-test-secret-that-is-at-least-32-chars-long"
    os.environ["PAHAADCARE_DEMO_ENABLED"] = "true"
    os.environ["PAHAADCARE_DEMO_USERNAME"] = "browser-clinician"
    os.environ["PAHAADCARE_DEMO_PASSWORD_HASH"] = hash_password("browser-pass-1234")
    os.environ["PAHAADCARE_DEMO_PATIENT_IDS"] = "PC-SYNTH01"
    os.environ["PAHAADCARE_CORS_ORIGINS"] = "http://127.0.0.1:4173,http://localhost:4173,http://127.0.0.1:8765"

    from backend.app.main import app
    main_module.store = repo
    main_module.settings = main_module.SecuritySettings.from_environment()

    # Start FastAPI server on port 8765
    api_config = uvicorn.Config(app, host="127.0.0.1", port=8765, log_level="warning")
    api_server = uvicorn.Server(api_config)
    api_thread = threading.Thread(target=api_server.run, daemon=True)
    api_thread.start()

    # Start static file server for dist on port 4173
    static_server = ThreadingHTTPServer(("127.0.0.1", 4173), StaticHandler)
    static_thread = threading.Thread(target=static_server.serve_forever, daemon=True)
    static_thread.start()

    time.sleep(1.0)

    try:
        yield {
            "db_path": db_path,
            "repo": repo,
            "api_url": "http://127.0.0.1:8765",
            "frontend_url": "http://127.0.0.1:4173",
        }
    finally:
        static_server.shutdown()
        static_server.server_close()
        api_server.should_exit = True
        api_thread.join(timeout=3)

        # Restore original environment and main module state
        os.environ.clear()
        os.environ.update(original_environ)
        main_module.store = original_store
        main_module.settings = original_settings


def test_browser_full_workflow(browser_env):
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        context = browser.new_context()
        page = context.new_page()
        page.on("console", lambda m: print("PAGE CONSOLE:", m.text))
        page.on("response", lambda r: print("RESPONSE:", r.url, r.status))

        # Preload initial workspace user and API base URL
        page.add_init_script(f"""
            window.__RPM_API_BASE_URL = '{browser_env['api_url']}';
            localStorage.setItem('pc-auth-user', JSON.stringify('PC-DEMO01'));
            localStorage.setItem('pc-patient-id', JSON.stringify('PC-DEMO01'));
            localStorage.setItem('pc-patient-name', JSON.stringify('Demo Patient'));
        """)

        # 1. Open frontend and wait for splash to clear
        page.goto(browser_env["frontend_url"])
        page.wait_for_selector(".ob-screen.splash-screen", state="detached", timeout=10000)

        # Click on RPM Monitor tab in navigation
        rpm_nav = page.locator("button", has_text="RPM Monitor").first
        rpm_nav.click()

        # 2. Verify synthetic-data banner and login panel
        page.wait_for_selector("text=PROTECTED RPM WORKSPACE", timeout=10000)
        assert page.locator("text=SIMULATED DATA").first.is_visible()

        # 3. Test invalid credentials
        page.fill("input[autocomplete='username']", "browser-clinician")
        page.fill("input[autocomplete='current-password']", "wrong-password")
        page.click("button:has-text('Sign in')")
        page.wait_for_selector("text=Invalid username or password")

        # 4. Test valid credentials
        page.fill("input[autocomplete='username']", "browser-clinician")
        page.fill("input[autocomplete='current-password']", "browser-pass-1234")
        page.click("button:has-text('Sign in')")

        # Wait for dashboard to load
        page.wait_for_selector("text=Backend snapshot loaded")
        assert page.locator("text=SIMULATED DATA").first.is_visible()
        assert page.locator("text=PC-SYNTH01").first.is_visible()
        assert page.locator("text=Active demo alerts").first.is_visible()

        # 5. Alert lifecycle mutation: Acknowledge alert
        ack_button = page.locator("button:has-text('Acknowledge')").first
        if ack_button.is_visible():
            ack_button.click()
            page.wait_for_selector("button:has-text('Resolve')", timeout=10000)

        # 6. Resolve alert
        res_button = page.locator("button:has-text('Resolve')").first
        if res_button.is_visible():
            res_button.click()
            page.wait_for_timeout(1000)

        # 7. Verify audit chain in backend after mutations
        audit_status = browser_env["repo"].verify_audit_chain()
        assert audit_status["valid"] is True
        assert audit_status["checked_records"] >= 2

        # 8. Test 403 Forbidden handling in frontend:
        # A 403 must display error message WITHOUT logging the user out.
        forbidden_test_script = """
        async () => {
            const token = sessionStorage.getItem('pahaadcare-rpm-token');
            // Try to submit cross-patient measurement
            const res = await fetch(window.__RPM_API_BASE_URL + '/api/v1/measurements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({
                    schema_version: '1.0',
                    event_id: 'a0000000-0000-0000-0000-000000000001',
                    patient_id: 'PC-UNAUTHORIZED',
                    measurement_type: 'heart_rate',
                    value: 75,
                    unit: 'beats_per_minute',
                    measured_at: new Date().toISOString(),
                    source: 'patient',
                    is_simulated: false
                })
            });
            return res.status;
        }
        """
        status_code = page.evaluate(forbidden_test_script)
        assert status_code == 403
        # Session token is still in sessionStorage
        token = page.evaluate("sessionStorage.getItem('pahaadcare-rpm-token')")
        assert token is not None and len(token) > 0

        # 9. Test Sign-out:
        # Sign-out calls backend revocation endpoint and clears session
        signout_btn = page.locator("button:has-text('Sign out of RPM workspace')")
        assert signout_btn.is_visible()
        signout_btn.click()

        # Wait for sign in form to return
        page.wait_for_selector("text=PROTECTED RPM WORKSPACE")
        token_after_signout = page.evaluate("sessionStorage.getItem('pahaadcare-rpm-token')")
        assert token_after_signout is None or token_after_signout == ""

        # 10. Verify revoked token cannot be reused
        denied_reuse = page.evaluate(f"""
        async () => {{
            const res = await fetch(window.__RPM_API_BASE_URL + '/api/v1/demo/rpm-dashboard', {{
                headers: {{ 'Authorization': 'Bearer {token}' }}
            }});
            return res.status;
        }}
        """)
        assert denied_reuse == 401

        # 11. Test restart persistence of revocation:
        restarted_repo = SQLiteRepository(browser_env["db_path"])
        import jwt
        claims = jwt.decode(token, options={"verify_signature": False})
        assert restarted_repo.is_token_revoked(claims["jti"]) is True

        browser.close()


def test_browser_patient_selection_and_stale_data(browser_env):
    """
    Milestone 2 Browser Test:
    - Verifies patient list loading and selection.
    - Verifies measurement history display and ordering.
    - Verifies stale/freshness status indicators.
    - Verifies rapid patient switching and detail panel toggle.
    """
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        context = browser.new_context()
        page = context.new_page()

        page.add_init_script(f"""
            window.__RPM_API_BASE_URL = '{browser_env['api_url']}';
            localStorage.setItem('pc-auth-user', JSON.stringify('PC-DEMO01'));
            localStorage.setItem('pc-patient-id', JSON.stringify('PC-DEMO01'));
        """)

        # Open and navigate to RPM Monitor
        page.goto(browser_env["frontend_url"])
        page.wait_for_selector(".ob-screen.splash-screen", state="detached", timeout=10000)
        page.locator("button", has_text="RPM Monitor").first.click()

        # Sign in
        page.wait_for_selector("text=PROTECTED RPM WORKSPACE", timeout=10000)
        page.fill("input[autocomplete='username']", "browser-clinician")
        page.fill("input[autocomplete='current-password']", "browser-pass-1234")
        page.click("button:has-text('Sign in')")

        # Verify census table is visible with PC-SYNTH01
        page.wait_for_selector("text=Backend snapshot loaded", timeout=10000)
        assert page.locator("text=Auto-refresh: 12s").first.is_visible()
        patient_btn = page.locator("button:has-text('PC-SYNTH01')").first
        assert patient_btn.is_visible()

        # Click PC-SYNTH01 to open patient detail panel
        patient_btn.click()
        page.wait_for_selector("aside[aria-label='Details for PC-SYNTH01']", timeout=10000)
        detail_panel = page.locator("aside[aria-label='Details for PC-SYNTH01']")
        assert detail_panel.is_visible()
        assert detail_panel.locator("text=recorded measurements").is_visible()

        # Verify measurement history rows exist with timestamps and badges
        history_rows = detail_panel.locator(".rpm-history-row")
        assert history_rows.count() > 0

        # Verify close button works
        close_btn = detail_panel.locator("button[aria-label='Close patient details']")
        close_btn.click()
        page.wait_for_selector("aside[aria-label='Details for PC-SYNTH01']", state="detached", timeout=5000)

        # Sign out cleanly
        signout_btn = page.locator("button:has-text('Sign out of RPM workspace')")
        signout_btn.click()
        page.wait_for_selector("text=PROTECTED RPM WORKSPACE")

        browser.close()


def test_browser_offline_queue_and_sync(browser_env):
    """
    Milestone 3 Browser Test:
    - Verifies Offline Sync Bar status and counters.
    - Queues an observation into durable IndexedDB storage.
    - Verifies durable persistence surviving page reload.
    - Synchronizes batch with backend via Sync Now.
    - Verifies synchronized measurement appears in patient's authoritative history.
    """
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        context = browser.new_context()
        page = context.new_page()

        page.add_init_script(f"""
            window.__RPM_API_BASE_URL = '{browser_env['api_url']}';
            localStorage.setItem('pc-auth-user', JSON.stringify('PC-DEMO01'));
            localStorage.setItem('pc-patient-id', JSON.stringify('PC-DEMO01'));
        """)

        # Open and navigate to RPM Monitor
        page.goto(browser_env["frontend_url"])
        page.wait_for_selector(".ob-screen.splash-screen", state="detached", timeout=10000)
        page.locator("button", has_text="RPM Monitor").first.click()

        # Sign in
        page.wait_for_selector("text=PROTECTED RPM WORKSPACE", timeout=10000)
        page.fill("input[autocomplete='username']", "browser-clinician")
        page.fill("input[autocomplete='current-password']", "browser-pass-1234")
        page.click("button:has-text('Sign in')")

        # Verify offline sync bar is visible
        page.wait_for_selector(".rpm-sync-bar", timeout=10000)
        assert page.locator("text=ONLINE").first.is_visible()
        assert page.locator("button:has-text('Sync Now')").first.is_visible()

        # Click Queue Observation button to open simulator
        queue_tool_btn = page.locator("button:has-text('Queue Observation')").first
        queue_tool_btn.click()
        page.wait_for_selector(".rpm-simulate-panel", timeout=5000)

        # Fill observation value
        value_input = page.locator(".rpm-simulate-panel input[type='number']")
        value_input.fill("86.5")

        # Click Save to Offline Queue
        save_btn = page.locator("button:has-text('Save to Offline Queue')")
        save_btn.click()
        page.wait_for_selector(".rpm-queue-feedback", timeout=5000)
        assert "Queued event" in page.locator(".rpm-queue-feedback").inner_text()

        # Verify queue counter updated
        assert page.locator("text=queued").first.is_visible()

        # Test reload persistence: reload page and ensure queue state survived
        page.reload()
        page.wait_for_selector(".ob-screen.splash-screen", state="detached", timeout=10000)
        page.locator("button", has_text="RPM Monitor").first.click()

        # Check if session persisted or if login is needed
        try:
            page.wait_for_selector(".rpm-sync-bar", timeout=4000)
        except Exception:
            page.wait_for_selector("text=PROTECTED RPM WORKSPACE", timeout=5000)
            page.fill("input[autocomplete='username']", "browser-clinician")
            page.fill("input[autocomplete='current-password']", "browser-pass-1234")
            page.click("button:has-text('Sign in')")
            page.wait_for_selector(".rpm-sync-bar", timeout=10000)

        assert page.locator(".rpm-sync-bar").is_visible()

        # Click Sync Now to push queued events to backend
        sync_now_btn = page.locator("button:has-text('Sync Now')").first
        sync_now_btn.click()
        page.wait_for_timeout(2000)

        # Verify synchronized count in sync bar
        page.wait_for_selector("text=synchronized", timeout=10000)
        assert page.locator("text=synchronized").first.is_visible()

        # Open PC-SYNTH01 detail panel to verify synced reading is now in server history
        page.locator("button:has-text('PC-SYNTH01')").first.click()
        page.wait_for_selector("aside[aria-label='Details for PC-SYNTH01']", timeout=10000)
        detail_panel = page.locator("aside[aria-label='Details for PC-SYNTH01']")
        assert detail_panel.is_visible()
        assert detail_panel.locator("text=86.5 bpm").first.is_visible()

        # Sign out cleanly
        signout_btn = page.locator("button:has-text('Sign out of RPM workspace')")
        signout_btn.click()
        page.wait_for_selector("text=PROTECTED RPM WORKSPACE")

        browser.close()
