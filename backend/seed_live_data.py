"""Database seeding utility for PahaadCare.

SAFETY GATE:
In production (PAHAADCARE_ENV=production):
- Synthetic/demo patients and hardcoded default credentials are STRICTLY PROHIBITED.
- Passwords must be explicitly provided via environment variables (e.g. SEED_ADMIN_PASSWORD).
- Requires the explicit flag: --allow-production-seeding.

In development/test mode:
- Seeds initial development test accounts and sample baseline patients for offline verification.
"""

import argparse
from datetime import datetime, timezone, timedelta
import os
import sys
from uuid import uuid4

# Ensure backend package can be imported
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.app.auth import hash_password
from backend.app.main import create_repository
from backend.app.models import EventSource, MeasurementEvent, MeasurementType, MeasurementUnit


def seed_database(allow_production: bool = False):
    env = os.environ.get("PAHAADCARE_ENV", "development").strip().lower()
    is_production = env == "production"

    if is_production and not allow_production:
        print(
            "ERROR: Seeding is blocked in production mode.\n"
            "To seed initial administrative accounts in production, you must:\n"
            "  1. Pass the --allow-production-seeding flag\n"
            "  2. Set SEED_ADMIN_PASSWORD and SEED_CLINICIAN_PASSWORD environment variables\n"
            "No fictional demonstration patients will be created."
        )
        sys.exit(1)

    store = create_repository()
    backend_name = getattr(store, "backend_name", "sqlite")
    print(f"[Gramin 24*7 Seeder] Environment: {env.upper()} | Backend: {backend_name.upper()}")

    # Determine credentials
    if is_production:
        admin_pw = os.environ.get("SEED_ADMIN_PASSWORD")
        clinician_pw = os.environ.get("SEED_CLINICIAN_PASSWORD")
        if not admin_pw or len(admin_pw) < 12:
            print("ERROR: In production, SEED_ADMIN_PASSWORD environment variable must be set (min 12 chars).")
            sys.exit(1)
        if not clinician_pw or len(clinician_pw) < 12:
            print("ERROR: In production, SEED_CLINICIAN_PASSWORD environment variable must be set (min 12 chars).")
            sys.exit(1)

        users_to_seed = [
            {
                "user_id": f"usr-admin-{uuid4().hex[:8]}",
                "username": os.environ.get("SEED_ADMIN_USERNAME", "admin"),
                "email": os.environ.get("SEED_ADMIN_EMAIL", "admin@hospital.org"),
                "password": admin_pw,
                "role": "administrator",
                "full_name": "Production Administrator",
            },
            {
                "user_id": f"usr-clinician-{uuid4().hex[:8]}",
                "username": os.environ.get("SEED_CLINICIAN_USERNAME", "clinician_lead"),
                "email": os.environ.get("SEED_CLINICIAN_EMAIL", "clinician@hospital.org"),
                "password": clinician_pw,
                "role": "clinician",
                "full_name": "Chief Medical Officer",
            },
        ]
    else:
        # Development / Test defaults (never used in production)
        users_to_seed = [
            {
                "user_id": f"usr-admin-{uuid4().hex[:8]}",
                "username": "admin",
                "email": "admin@gramin247.local",
                "password": "DevAdminPassword2026!",
                "role": "administrator",
                "full_name": "Development Administrator",
            },
            {
                "user_id": f"usr-clinician-{uuid4().hex[:8]}",
                "username": "dr.sharma",
                "email": "dr.sharma@gramin247.local",
                "password": "Sharma@Gramin2026",
                "role": "clinician",
                "full_name": "Dr. Sunita Sharma (CMO)",
            },
            {
                "user_id": f"usr-clinician2-{uuid4().hex[:8]}",
                "username": "clinician1",
                "email": "clinician1@gramin247.local",
                "password": "demo-password-2026",
                "role": "clinician",
                "full_name": "Dr. Anil Rawat",
            },
        ]

    for u in users_to_seed:
        existing = store.get_user_by_username_or_email(u["username"])
        if not existing:
            hashed = hash_password(u["password"])
            store.create_user(
                user_id=u["user_id"],
                username=u["username"],
                email=u["email"],
                password_hash=hashed,
                role=u["role"],
                full_name=u["full_name"],
            )
            print(f"  + Seeded user: {u['username']} ({u['role']})")
        else:
            print(f"  ~ User already exists: {u['username']}")

    # In production, DO NOT seed fictional demonstration patients!
    if is_production:
        print("[Gramin 24*7 Seeder] Production account provisioning complete. Fictional demo patients skipped.")
        return

    # Seed deterministic demonstration patients & vitals
    from backend.app.demo_seeder import seed_demo_data
    demo_result = seed_demo_data(store)
    print(f"[Gramin 24*7 Seeder] Demo dataset seeded: {demo_result}")
    return


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PahaadCare Database Seeder")
    parser.add_argument(
        "--allow-production-seeding",
        action="store_true",
        help="Explicitly permit seeding administrative users in production with environment variables",
    )
    args = parser.parse_args()
    seed_database(allow_production=args.allow_production_seeding)
