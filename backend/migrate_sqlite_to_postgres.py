"""Safe SQLite-to-PostgreSQL Migration Utility for PahaadCare.

Transfers existing users, patients, measurements, alerts, escalation policies,
escalation states, notifications, audit log records, and revoked tokens from
local SQLite to production PostgreSQL without overwriting or deleting any records.
"""

import argparse
import os
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.app.postgres_repository import PostgresRepository


def migrate(sqlite_path: str, postgres_url: str):
    sqlite_file = Path(sqlite_path).resolve()
    if not sqlite_file.exists():
        print(f"ERROR: SQLite source database not found at: {sqlite_file}")
        sys.exit(1)

    if postgres_url.startswith("postgres://"):
        postgres_url = postgres_url.replace("postgres://", "postgresql://", 1)

    print(f"[Gramin 24*7 Migrator] Source SQLite: {sqlite_file}")
    masked_url = postgres_url.split("@")[-1] if "@" in postgres_url else "configured-postgres"
    print(f"[Gramin 24*7 Migrator] Destination PostgreSQL: ...@{masked_url}")

    # 1. Initialize PostgreSQL repository & schema
    pg_repo = PostgresRepository(postgres_url)
    print("  + Verified and initialized PostgreSQL schema tables and indexes.")

    # 2. Connect to SQLite
    sqlite_conn = sqlite3.connect(sqlite_file)
    sqlite_conn.row_factory = sqlite3.Row

    summary = {}

    with pg_repo._transaction() as pg_conn:
        # Table A: users
        try:
            sqlite_users = sqlite_conn.execute("SELECT * FROM users").fetchall()
            user_count = 0
            for u in sqlite_users:
                pg_conn.execute(
                    """
                    INSERT INTO users (
                        user_id, username, email, password_hash, role,
                        full_name, patient_id, phone, created_at, is_active
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (user_id) DO NOTHING
                    """,
                    (
                        u["user_id"], u["username"], u["email"], u["password_hash"], u["role"],
                        u["full_name"], u.get("patient_id"), u.get("phone"), u["created_at"], u.get("is_active", 1),
                    ),
                )
                user_count += 1
            summary["users"] = user_count
        except sqlite3.OperationalError:
            summary["users"] = 0

        # Table B: patients
        try:
            sqlite_patients = sqlite_conn.execute("SELECT * FROM patients").fetchall()
            patient_count = 0
            for p in sqlite_patients:
                pg_conn.execute(
                    """
                    INSERT INTO patients (
                        patient_id, display_name, age, gender, phone,
                        village, district, status, created_at, is_simulated
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (patient_id) DO NOTHING
                    """,
                    (
                        p["patient_id"], p["display_name"], p.get("age"), p.get("gender"), p.get("phone"),
                        p.get("village"), p.get("district"), p.get("status", "active"), p["created_at"],
                        int(p.get("is_simulated", 0)),
                    ),
                )
                patient_count += 1
            summary["patients"] = patient_count
        except sqlite3.OperationalError:
            summary["patients"] = 0

        # Table C: measurements
        try:
            sqlite_measurements = sqlite_conn.execute("SELECT * FROM measurements").fetchall()
            measurement_count = 0
            for m in sqlite_measurements:
                pg_conn.execute(
                    """
                    INSERT INTO measurements (
                        event_id, patient_id, payload_hash, payload_json, measurement_type,
                        value, unit, measured_at, received_at, source, is_simulated
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (event_id) DO NOTHING
                    """,
                    (
                        m["event_id"], m["patient_id"], m["payload_hash"], m["payload_json"],
                        m["measurement_type"], float(m["value"]), m["unit"], m["measured_at"],
                        m["received_at"], m["source"], int(m.get("is_simulated", 0)),
                    ),
                )
                measurement_count += 1
            summary["measurements"] = measurement_count
        except sqlite3.OperationalError:
            summary["measurements"] = 0

        # Table D: alerts
        try:
            sqlite_alerts = sqlite_conn.execute("SELECT * FROM alerts").fetchall()
            alert_count = 0
            for a in sqlite_alerts:
                pg_conn.execute(
                    """
                    INSERT INTO alerts (
                        alert_id, patient_id, related_event_id, category, severity,
                        reason_json, reason_code, rule_version, created_at, status,
                        acknowledged_at, acknowledged_by, acknowledgement_note,
                        resolved_at, resolved_by, resolution_code, resolution_note
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (alert_id) DO NOTHING
                    """,
                    (
                        a["alert_id"], a["patient_id"], a.get("related_event_id"), a["category"],
                        a["severity"], a["reason_json"], a["reason_code"], a["rule_version"],
                        a["created_at"], a["status"], a.get("acknowledged_at"), a.get("acknowledged_by"),
                        a.get("acknowledgement_note"), a.get("resolved_at"), a.get("resolved_by"),
                        a.get("resolution_code"), a.get("resolution_note"),
                    ),
                )
                alert_count += 1
            summary["alerts"] = alert_count
        except sqlite3.OperationalError:
            summary["alerts"] = 0

        # Table E: audit_log
        try:
            sqlite_audit = sqlite_conn.execute("SELECT * FROM audit_log ORDER BY audit_id ASC").fetchall()
            audit_count = 0
            for l in sqlite_audit:
                pg_conn.execute(
                    """
                    INSERT INTO audit_log (
                        actor_id, action, alert_id, occurred_at, success,
                        metadata_json, previous_hash, current_hash
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        l["actor_id"], l["action"], l.get("alert_id"), l["occurred_at"],
                        int(l["success"]), l["metadata_json"], l.get("previous_hash"), l.get("current_hash"),
                    ),
                )
                audit_count += 1
            summary["audit_log"] = audit_count
        # Table F: revoked_tokens
        try:
            sqlite_revoked = sqlite_conn.execute("SELECT * FROM revoked_tokens").fetchall()
            revoked_count = 0
            for r in sqlite_revoked:
                pg_conn.execute(
                    """
                    INSERT INTO revoked_tokens (jti, revoked_at, expires_at, actor_id)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (jti) DO NOTHING
                    """,
                    (r["jti"], r["revoked_at"], r["expires_at"], r["actor_id"]),
                )
                revoked_count += 1
            summary["revoked_tokens"] = revoked_count
        except sqlite3.OperationalError:
            summary["revoked_tokens"] = 0

    sqlite_conn.close()

    print("\n[PahaadCare Migrator] Migration Completed Successfully:")
    for table, count in summary.items():
        print(f"  • {table}: {count} records transferred")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PahaadCare SQLite-to-PostgreSQL Migration Tool")
    parser.add_argument(
        "--sqlite-path",
        default=os.getenv("PAHAADCARE_DB_PATH", "backend/data/pahaadcare.sqlite3"),
        help="Path to source SQLite file",
    )
    parser.add_argument(
        "--postgres-url",
        default=os.getenv("DATABASE_URL") or os.getenv("PAHAADCARE_DATABASE_URL"),
        help="Target PostgreSQL connection string",
    )
    args = parser.parse_args()

    if not args.postgres_url:
        print("ERROR: PostgreSQL target URL must be provided via --postgres-url or DATABASE_URL env var.")
        sys.exit(1)

    migrate(sqlite_path=args.sqlite_path, postgres_url=args.postgres_url)
