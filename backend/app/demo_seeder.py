"""Deterministic, repeatable, and idempotent synthetic-data initialization utility for Gramin 24*7.

ENVIRONMENT SEPARATION:
- In real-patient production (PAHAADCARE_ENV=production without explicit DEMO_ENABLED=true):
  Synthetic patient records and demo accounts are STRICTLY PROHIBITED.
- In demo, staging, or development environments:
  Seeds deterministic fictional patients, plausible timestamped vital measurements,
  representative alert states (open, acknowledged, resolved, stale), and clinician credentials.
- Idempotent: Can be run repeatedly without duplicating records or corrupting state.
"""

from datetime import datetime, timedelta, timezone
import logging
import os
from uuid import NAMESPACE_URL, UUID, uuid5

from .auth import hash_password, verify_password
from .models import (
    Alert,
    AlertCategory,
    AlertReason,
    AlertSeverity,
    AlertStatus,
    EventSource,
    MeasurementEvent,
    MeasurementType,
    MeasurementUnit,
)

logger = logging.getLogger("gramin247.demo_seeder")

DEMO_NAMESPACE = uuid5(NAMESPACE_URL, "https://gramin247.health/demo")


def make_deterministic_uuid(key: str) -> UUID:
    """Generate a stable UUID from a key string."""
    return uuid5(DEMO_NAMESPACE, key)


def is_demo_allowed() -> bool:
    """Check whether demo data seeding is allowed in the current environment."""
    env = os.environ.get("PAHAADCARE_ENV", "development").strip().lower()
    demo_enabled = os.environ.get("PAHAADCARE_DEMO_ENABLED", "").strip().lower() == "true"
    if env == "production" and not demo_enabled:
        return False
    return True


def seed_demo_data(store, now: datetime | None = None) -> dict:
    """Seed deterministic demo data into the repository (Postgres or SQLite).
    
    Safe, idempotent, and explicitly separated from production.
    """
    if not is_demo_allowed():
        logger.warning("[Gramin 24*7 Demo Seeder] Seeding rejected: production environment without explicit demo flag.")
        return {
            "status": "skipped",
            "reason": "Synthetic seeding is strictly disabled in production mode",
            "is_simulated": False,
        }

    now = now or datetime.now(timezone.utc)
    seeded_users = 0
    seeded_patients = 0
    seeded_measurements = 0
    seeded_alerts = 0

    # 1. Deterministic Clinicians and Demo Patients
    demo_users = [
        {
            "user_id": str(make_deterministic_uuid("usr-clinician-dr.sharma")),
            "username": "dr.sharma",
            "email": "dr.sharma@gramin247.local",
            "password": "Sharma@Gramin2026",
            "role": "clinician",
            "full_name": "Dr. Sunita Sharma (CMO)",
            "patient_id": None,
            "phone": "9811122233",
        },
        {
            "user_id": str(make_deterministic_uuid("usr-clinician-clinician1")),
            "username": "clinician1",
            "email": "clinician1@gramin247.local",
            "password": "demo-password-2026",
            "role": "clinician",
            "full_name": "Dr. Anil Rawat",
            "patient_id": None,
            "phone": "9822233344",
        },
        {
            "user_id": str(make_deterministic_uuid("usr-admin-system")),
            "username": "admin",
            "email": "admin@gramin247.local",
            "password": "DevAdminPassword2026!",
            "role": "administrator",
            "full_name": "System Administrator",
            "patient_id": None,
            "phone": "9800000000",
        },
        {
            "user_id": str(make_deterministic_uuid("usr-patient-kamla")),
            "username": "patient1",
            "email": "patient1@gramin247.local",
            "password": "demo-password-2026",
            "role": "patient",
            "full_name": "Kamla Devi",
            "patient_id": "PC-SYNTH01",
            "phone": "9812345678",
        },
        {
            "user_id": str(make_deterministic_uuid("usr-patient-rajendra")),
            "username": "patient2",
            "email": "patient2@gramin247.local",
            "password": "demo-password-2026",
            "role": "patient",
            "full_name": "Rajendra Prasad",
            "patient_id": "PC-DEMO01",
            "phone": "9876543210",
        },
    ]

    for u in demo_users:
        existing = store.get_user_by_username_or_email(u["username"])
        hashed = hash_password(u["password"])
        if not existing:
            store.create_user(
                user_id=u["user_id"],
                username=u["username"],
                email=u["email"],
                password_hash=hashed,
                role=u["role"],
                full_name=u["full_name"],
                patient_id=u["patient_id"],
                phone=u["phone"],
            )
            seeded_users += 1
        elif not verify_password(u["password"], existing["password_hash"]):
            if hasattr(store, "update_user_password"):
                store.update_user_password(existing["user_id"], hashed)

    # 2. Fictional Synthetic Patients (All Himalayan rural villages)
    demo_patients = [
        {
            "patient_id": "PC-SYNTH01",
            "display_name": "Kamla Devi",
            "age": 62,
            "gender": "Female",
            "phone": "9812345678",
            "village": "Majkhali",
            "district": "Almora",
            "status": "Active",
            "is_simulated": 1,
        },
        {
            "patient_id": "PC-DEMO01",
            "display_name": "Rajendra Prasad",
            "age": 58,
            "gender": "Male",
            "phone": "9876543210",
            "village": "Kausani Valley",
            "district": "Bageshwar",
            "status": "Active",
            "is_simulated": 1,
        },
        {
            "patient_id": "PC-DEMO02",
            "display_name": "Anandi Joshi",
            "age": 45,
            "gender": "Female",
            "phone": "9823456789",
            "village": "Joshimath",
            "district": "Chamoli",
            "status": "Active",
            "is_simulated": 1,
        },
        {
            "patient_id": "PC-DEMO03",
            "display_name": "Mohan Singh Rawat",
            "age": 71,
            "gender": "Male",
            "phone": "9834567890",
            "village": "Kedarnath",
            "district": "Rudraprayag",
            "status": "Active",
            "is_simulated": 1,
        },
        {
            "patient_id": "PC-DEMO04",
            "display_name": "Pooja Negi",
            "age": 29,
            "gender": "Female",
            "phone": "9845678901",
            "village": "Dharchula",
            "district": "Pithoragarh",
            "status": "Active",
            "is_simulated": 1,
        },
        {
            "patient_id": "PC-DEMO05",
            "display_name": "Vikram Negi",
            "age": 35,
            "gender": "Male",
            "phone": "9856789012",
            "village": "Munsiari",
            "district": "Pithoragarh",
            "status": "Active",
            "is_simulated": 1,
        },
    ]

    for p in demo_patients:
        existing_p = store.get_patient(p["patient_id"])
        if not existing_p:
            store.create_patient(
                patient_id=p["patient_id"],
                display_name=p["display_name"],
                age=p["age"],
                gender=p["gender"],
                phone=p["phone"],
                village=p["village"],
                district=p["district"],
                status=p["status"],
                is_simulated=p["is_simulated"],
            )
            seeded_patients += 1

    # 3. Deterministic Timestamped Measurements & Quality States
    # Format: (patient_id, measurement_type, value, unit, age_minutes, is_abnormal)
    demo_events = [
        # PC-SYNTH01: Stable normal telemetry (5-8 min ago)
        ("PC-SYNTH01", MeasurementType.HEART_RATE, 76.0, MeasurementUnit.BEATS_PER_MINUTE, 6),
        ("PC-SYNTH01", MeasurementType.OXYGEN_SATURATION, 98.0, MeasurementUnit.PERCENT, 6),
        ("PC-SYNTH01", MeasurementType.SYSTOLIC_BLOOD_PRESSURE, 122.0, MeasurementUnit.MMHG, 6),
        ("PC-SYNTH01", MeasurementType.DIASTOLIC_BLOOD_PRESSURE, 78.0, MeasurementUnit.MMHG, 6),
        ("PC-SYNTH01", MeasurementType.BODY_TEMPERATURE, 36.8, MeasurementUnit.CELSIUS, 6),

        # PC-DEMO01: Tachycardia (128 bpm) and Hypertension (156 mmHg) -> triggers Critical Alerts
        ("PC-DEMO01", MeasurementType.HEART_RATE, 128.0, MeasurementUnit.BEATS_PER_MINUTE, 8),
        ("PC-DEMO01", MeasurementType.SYSTOLIC_BLOOD_PRESSURE, 156.0, MeasurementUnit.MMHG, 8),
        ("PC-DEMO01", MeasurementType.DIASTOLIC_BLOOD_PRESSURE, 98.0, MeasurementUnit.MMHG, 8),
        ("PC-DEMO01", MeasurementType.OXYGEN_SATURATION, 93.0, MeasurementUnit.PERCENT, 8),
        ("PC-DEMO01", MeasurementType.BODY_TEMPERATURE, 38.2, MeasurementUnit.CELSIUS, 8),

        # PC-DEMO02: Stale telemetry (> 15 min ago, 45m old) -> demonstrates "Stale (>15m)" quality flag
        ("PC-DEMO02", MeasurementType.HEART_RATE, 82.0, MeasurementUnit.BEATS_PER_MINUTE, 45),
        ("PC-DEMO02", MeasurementType.OXYGEN_SATURATION, 95.0, MeasurementUnit.PERCENT, 45),
        ("PC-DEMO02", MeasurementType.SYSTOLIC_BLOOD_PRESSURE, 118.0, MeasurementUnit.MMHG, 45),
        ("PC-DEMO02", MeasurementType.DIASTOLIC_BLOOD_PRESSURE, 76.0, MeasurementUnit.MMHG, 45),
        ("PC-DEMO02", MeasurementType.BODY_TEMPERATURE, 36.7, MeasurementUnit.CELSIUS, 45),

        # PC-DEMO03: Bradycardia (38 bpm, 2h ago) followed by recovery (64 bpm, 18m ago)
        ("PC-DEMO03", MeasurementType.HEART_RATE, 38.0, MeasurementUnit.BEATS_PER_MINUTE, 120),
        ("PC-DEMO03", MeasurementType.HEART_RATE, 64.0, MeasurementUnit.BEATS_PER_MINUTE, 18),
        ("PC-DEMO03", MeasurementType.OXYGEN_SATURATION, 97.0, MeasurementUnit.PERCENT, 18),
        ("PC-DEMO03", MeasurementType.SYSTOLIC_BLOOD_PRESSURE, 112.0, MeasurementUnit.MMHG, 18),
        ("PC-DEMO03", MeasurementType.DIASTOLIC_BLOOD_PRESSURE, 72.0, MeasurementUnit.MMHG, 18),

        # PC-DEMO04: Hypoxemia (SpO2 88%) -> High alert
        ("PC-DEMO04", MeasurementType.OXYGEN_SATURATION, 88.0, MeasurementUnit.PERCENT, 10),
        ("PC-DEMO04", MeasurementType.HEART_RATE, 96.0, MeasurementUnit.BEATS_PER_MINUTE, 10),
        ("PC-DEMO04", MeasurementType.BODY_TEMPERATURE, 37.4, MeasurementUnit.CELSIUS, 10),
        ("PC-DEMO04", MeasurementType.SYSTOLIC_BLOOD_PRESSURE, 126.0, MeasurementUnit.MMHG, 10),

        # PC-DEMO05: Resolved pyrexia (39.2 C, 6h ago) -> normalized (36.9 C, 25m ago)
        ("PC-DEMO05", MeasurementType.BODY_TEMPERATURE, 39.2, MeasurementUnit.CELSIUS, 360),
        ("PC-DEMO05", MeasurementType.BODY_TEMPERATURE, 36.9, MeasurementUnit.CELSIUS, 25),
        ("PC-DEMO05", MeasurementType.HEART_RATE, 74.0, MeasurementUnit.BEATS_PER_MINUTE, 25),
        ("PC-DEMO05", MeasurementType.OXYGEN_SATURATION, 98.0, MeasurementUnit.PERCENT, 25),
    ]

    for item in demo_events:
        pid, m_type, val, unit, age_min = item
        measured_time = now - timedelta(minutes=age_min)
        event_id = make_deterministic_uuid(f"event-{pid}-{m_type.value}-{age_min}")

        event = MeasurementEvent(
            schema_version="1.0",
            event_id=event_id,
            patient_id=pid,
            measurement_type=m_type,
            value=val,
            unit=unit,
            measured_at=measured_time,
            source=EventSource.HEALTH_WORKER,
            is_simulated=True,
        )
        try:
            sub = store.submit(event, evaluate_alerts=True)
            if sub.status == "accepted":
                seeded_measurements += 1
                seeded_alerts += len(sub.alerts)
        except Exception:
            pass

    # 4. Acknowledge and Resolve representative alerts deterministically
    # Acknowledge PC-DEMO03 Bradycardia
    try:
        active_alerts = store.list_alerts(active_only=True)
        for a in active_alerts:
            if a.patient_id == "PC-DEMO03" and a.status == AlertStatus.OPEN:
                store.acknowledge_alert(
                    a.alert_id,
                    actor_id="dr.sharma",
                    note="Atropine and oral hydration administered. Telemetry stabilized to 64 bpm.",
                )
    except Exception:
        pass

    # Resolve PC-DEMO05 Pyrexia
    try:
        all_alerts = store.list_alerts(active_only=False)
        for a in all_alerts:
            if a.patient_id == "PC-DEMO05" and a.status in (AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED):
                store.resolve_alert(
                    a.alert_id,
                    actor_id="dr.sharma",
                    resolution_code="clinical_review_complete",
                    note="Fever responded to Paracetamol 650mg. Core temperature normalized to 36.9°C.",
                )
    except Exception:
        pass

    # Add Quality Alert for PC-DEMO02 (Stale Reading)
    stale_alert_id = make_deterministic_uuid("quality-alert-PC-DEMO02-stale")
    try:
        stale_alert = Alert(
            schema_version="1.0",
            alert_id=stale_alert_id,
            patient_id="PC-DEMO02",
            category=AlertCategory.STALE_READING,
            severity=AlertSeverity.LOW,
            reason=AlertReason(
                code="heart_rate_stale_reading",
                message="Telemetry for PC-DEMO02 is stale (>15 minutes since last transmission).",
                rule_version="demo-1",
                expected_measurement_type=MeasurementType.HEART_RATE,
            ),
            created_at=now - timedelta(minutes=45),
            status=AlertStatus.OPEN,
        )
        store.save_quality_alert(stale_alert)
    except Exception:
        pass

    logger.info(
        "[Gramin 24*7 Demo Seeder] Synthetic data initialized: %d users, %d patients, %d measurements.",
        seeded_users, seeded_patients, seeded_measurements
    )
    return {
        "status": "success",
        "is_simulated": True,
        "disclaimer": "SIMULATED DATA — DEMO ONLY",
        "seeded_users": seeded_users,
        "seeded_patients": seeded_patients,
        "seeded_measurements": seeded_measurements,
        "environment": os.environ.get("PAHAADCARE_ENV", "development"),
        "backend": getattr(store, "backend_name", "sqlite"),
    }


def seed_demo_data_if_needed(store) -> dict:
    """Helper called on app startup."""
    if is_demo_allowed():
        return seed_demo_data(store)
    return {"status": "skipped", "reason": "production_environment_protected"}
