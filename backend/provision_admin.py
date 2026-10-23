"""Secure CLI utility to provision administrative and clinician accounts in PahaadCare.

Can be run on the production server or in a release task.
Prompts for password interactively or reads from environment variable.
"""

import argparse
import getpass
import os
import sys
from uuid import uuid4

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.app.auth import hash_password
from backend.app.main import create_repository


def provision_user(username: str, email: str, role: str, full_name: str, password: str | None = None):
    clean_role = role.strip().lower()
    if clean_role not in {"administrator", "clinician"}:
        print(f"ERROR: Role must be 'administrator' or 'clinician' (got {clean_role})")
        sys.exit(1)

    if not password:
        password = os.environ.get("NEW_USER_PASSWORD")
        if not password:
            password = getpass.getpass(f"Enter password for {username} (min 12 chars): ")

    if len(password) < 12:
        print("ERROR: Password must be at least 12 characters long.")
        sys.exit(1)

    store = create_repository()
    backend_name = getattr(store, "backend_name", "sqlite")
    print(f"[Gramin 24*7 Provisioner] Connected to: {backend_name.upper()}")

    existing = store.get_user_by_username_or_email(username) or store.get_user_by_username_or_email(email)
    if existing:
        print(f"ERROR: User '{username}' or email '{email}' already exists.")
        sys.exit(1)

    user_id = f"usr-{clean_role[:5]}-{uuid4().hex[:8]}"
    hashed = hash_password(password)

    store.create_user(
        user_id=user_id,
        username=username.strip().lower(),
        email=email.strip().lower(),
        password_hash=hashed,
        role=clean_role,
        full_name=full_name.strip(),
    )

    store.record_audit(
        "system_cli",
        "user_provisioned",
        None,
        True,
        {"user_id": user_id, "username": username, "role": clean_role},
    )

    print(f"SUCCESS: Created {clean_role} '{username}' ({email}) with ID {user_id}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PahaadCare Account Provisioner")
    parser.add_argument("--username", required=True, help="Username for the new account")
    parser.add_argument("--email", required=True, help="Email address for the new account")
    parser.add_argument("--role", default="clinician", choices=["clinician", "administrator"], help="User role")
    parser.add_argument("--full-name", required=True, help="Display/full name")
    parser.add_argument("--password", default=None, help="Password (optional; will prompt if not provided)")
    args = parser.parse_args()

    provision_user(
        username=args.username,
        email=args.email,
        role=args.role,
        full_name=args.full_name,
        password=args.password,
    )
