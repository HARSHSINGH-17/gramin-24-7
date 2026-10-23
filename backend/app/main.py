from datetime import datetime, timezone
import os
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from pydantic import BaseModel, ConfigDict, Field

import hmac
from .auth import (
    SecuritySettings,
    decode_token,
    has_patient_access,
    hash_password,
    issue_token,
    require_role,
    require_user,
    verify_password,
)
from .demo_dashboard import build_demo_dashboard_snapshot
from .escalation import EscalationEngine, EscalationWorker
from .models import DeviceReference, EventSource, HealthWorkerReference, MeasurementEvent, MeasurementType, MeasurementUnit
from .repository import AlertNotFound, InvalidAlertTransition, SQLiteRepository
from .store import EventIdConflict

settings = SecuritySettings.from_environment()
DEFAULT_DATABASE_PATH = Path(__file__).resolve().parents[1] / "data" / "pahaadcare.sqlite3"


def create_repository() -> SQLiteRepository | object:
    env = os.environ.get("PAHAADCARE_ENV", "").strip().lower()
    is_production = (env == "production") or (settings.environment == "production")
    db_url = os.environ.get("DATABASE_URL") or os.environ.get("PAHAADCARE_DATABASE_URL")

    if is_production:
        if not db_url or not (db_url.startswith("postgres://") or db_url.startswith("postgresql://")):
            raise RuntimeError(
                "FATAL: Production environment (PAHAADCARE_ENV=production) requires DATABASE_URL "
                "configured with a PostgreSQL connection string. Automatic SQLite fallback is strictly prohibited in production."
            )
        try:
            from .postgres_repository import PostgresRepository
            return PostgresRepository(db_url)
        except Exception as exc:
            raise RuntimeError(
                f"FATAL: Production PostgreSQL connection failed: {exc}. "
                "Automatic SQLite fallback is strictly prohibited in production."
            ) from exc

    if db_url and (db_url.startswith("postgres://") or db_url.startswith("postgresql://")):
        try:
            from .postgres_repository import PostgresRepository
            return PostgresRepository(db_url)
        except Exception as exc:
            import logging
            logging.getLogger("pahaadcare").warning("Failed to connect to PostgreSQL: %s. Falling back to SQLite.", exc)

    return SQLiteRepository(os.environ.get("PAHAADCARE_DB_PATH", DEFAULT_DATABASE_PATH))


store = create_repository()
escalation_engine = EscalationEngine(repository=store)
escalation_worker = EscalationWorker(
    engine=escalation_engine,
    interval_seconds=float(os.environ.get("ESCALATION_POLL_INTERVAL_SECONDS", "10.0")),
    enabled=os.environ.get("ESCALATION_WORKER_ENABLED", "false").lower() in ("true", "1", "yes"),
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-seed synthetic demonstration data in demo/staging/development environments
    env = os.environ.get("PAHAADCARE_ENV", "development").strip().lower()
    demo_enabled = (
        os.environ.get("PAHAADCARE_DEMO_ENABLED", "").strip().lower() == "true"
        or settings.demo_enabled
        or env in {"development", "test", "demo", "staging"}
    )
    if demo_enabled and env != "production":
        try:
            from .demo_seeder import seed_demo_data
            seed_demo_data(store)
        except Exception as exc:
            import logging
            logging.getLogger("gramin247").warning("Demo auto-seeding failed or skipped: %s", exc)

    if escalation_worker.enabled:
        await escalation_worker.start()
    yield
    if escalation_worker.is_running:
        await escalation_worker.stop()


app = FastAPI(title="Gramin 24*7 RPM API", version="1.0.0", lifespan=lifespan)
is_token_revoked = lambda jti: store.is_token_revoked(jti)
get_settings = lambda: settings
cors_kwargs: dict[str, object] = {
    "allow_origins": list(settings.cors_origins),
    "allow_methods": ["*"],
    "allow_headers": ["*"],
    "allow_credentials": True,
}

# In production: restrict CORS strictly to explicitly configured origins unless explicit regex is set
if settings.environment == "production":
    explicit_regex = os.getenv("PAHAADCARE_CORS_ORIGIN_REGEX", "").strip()
    if explicit_regex:
        cors_kwargs["allow_origin_regex"] = explicit_regex
else:
    # In development/test: allow convenient local & preview origins
    cors_kwargs["allow_origin_regex"] = os.getenv(
        "PAHAADCARE_CORS_ORIGIN_REGEX",
        r"^https?://(localhost|127\.0\.0\.1|.*\.vercel\.app|.*\.netlify\.app|.*\.onrender\.com|.*\.railway\.app)(:\d+)?$",
    )

app.add_middleware(
    CORSMiddleware,
    **cors_kwargs,
)



class AcknowledgeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    actor_id: str = Field(min_length=1, max_length=128)
    note: str | None = Field(default=None, max_length=2000)


class ResolveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    actor_id: str = Field(min_length=1, max_length=128)
    resolution_code: str = Field(min_length=1, max_length=128)
    note: str | None = Field(default=None, max_length=2000)


class TokenRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=512)


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    username: str = Field(min_length=3, max_length=128)
    email: str = Field(min_length=5, max_length=256)
    password: str = Field(min_length=12, max_length=512)
    role: str = Field(default="patient")  # 'clinician', 'patient', 'administrator', 'family'
    full_name: str = Field(min_length=1, max_length=256)
    patient_id: str | None = Field(default=None, max_length=64)
    phone: str | None = Field(default=None, max_length=32)
    village: str | None = Field(default=None, max_length=128)
    district: str | None = Field(default=None, max_length=128)
    invitation_code: str | None = Field(default=None, max_length=128)


class CreatePatientRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    patient_id: str | None = Field(default=None, max_length=64)
    display_name: str = Field(min_length=2, max_length=256)
    age: int | None = Field(default=None, ge=0, le=150)
    gender: str | None = Field(default=None, max_length=32)
    phone: str | None = Field(default=None, max_length=32)
    village: str | None = Field(default=None, max_length=128)
    district: str | None = Field(default=None, max_length=128)
    status: str = Field(default="active", max_length=64)


class SubmitVitalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    measurement_type: str = Field(min_length=1, max_length=64)
    value: float
    unit: str = Field(min_length=1, max_length=32)
    measured_at: datetime | None = None



class SyncBatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    events: list[MeasurementEvent] = Field(min_length=1, max_length=100)


class ProcessEscalationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    now: datetime | None = None


def error_response(
    code: str,
    message: str,
    details: list[dict],
    request: Request,
    status_code: int = 422,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": code,
                "message": message,
                "details": details,
                "request_id": request.headers.get("x-request-id", "local-request"),
            }
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    details = [
        {
            "field": ".".join(str(part) for part in error["loc"]),
            "reason": error["type"],
        }
        for error in exc.errors()
    ]
    return error_response("validation_error", "Request contains invalid fields.", details, request)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    detail = exc.detail if isinstance(exc.detail, str) else "Request was rejected."
    response = error_response(
        "unauthorized" if exc.status_code == 401 else "forbidden" if exc.status_code == 403 else "http_error",
        detail,
        [],
        request,
        exc.status_code,
    )
    if exc.headers:
        for key, value in exc.headers.items():
            response.headers[key] = value
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, _exc: Exception) -> JSONResponse:
    return error_response(
        "internal_error",
        "The server could not complete the request.",
        [],
        request,
        status.HTTP_500_INTERNAL_SERVER_ERROR,
    )


@app.middleware("http")
async def request_size_limit(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > settings.max_body_bytes:
        return error_response(
            "request_too_large",
            "Request body exceeds the configured limit.",
            [],
            request,
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        )
    return await call_next(request)


@app.get("/health")
@app.get("/api/v1/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "gramin-24-7-rpm-api",
        "api_version": "v1",
        "database": getattr(store, "backend_name", "sqlite"),
        "checked_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }


@app.get("/ready")
@app.get("/api/v1/ready")
def ready() -> JSONResponse:
    try:
        if hasattr(store, "ping"):
            store.ping()
        return JSONResponse(
            status_code=200,
            content={
                "status": "ready",
                "database": "connected",
                "checked_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            },
        )
    except Exception as exc:
        return JSONResponse(
            status_code=503,
            content={
                "status": "degraded",
                "database": "unreachable",
                "error": str(exc),
                "checked_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            },
        )


@app.post("/api/v1/auth/register", status_code=201)
def register(body: RegisterRequest, request: Request) -> JSONResponse:
    existing = store.get_user_by_username_or_email(body.username) or store.get_user_by_username_or_email(body.email)
    if existing:
        return error_response(
            "user_conflict",
            "A user with that username or email already exists.",
            [{"field": "username", "reason": "already_registered"}],
            request,
            409,
        )

    role = body.role.strip().lower()
    if role not in {"clinician", "administrator", "patient", "family"}:
        return error_response(
            "invalid_role",
            "Role must be clinician, administrator, patient, or family.",
            [{"field": "role", "reason": "invalid_enum"}],
            request,
            422,
        )

    # Privileged role registration security gate:
    # Clinician and Administrator accounts cannot be created by public unauthenticated requests!
    if role in {"clinician", "administrator"}:
        authorized = False
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            token_str = auth_header[7:].strip()
            try:
                decoded = decode_token(token_str, settings, is_token_revoked)
                if decoded.get("role") == "administrator":
                    authorized = True
            except Exception:
                authorized = False

        if not authorized and body.invitation_code:
            expected_secret = os.getenv("PAHAADCARE_PROVISIONING_SECRET", "").strip()
            if expected_secret and len(expected_secret) >= 16:
                if hmac.compare_digest(body.invitation_code, expected_secret):
                    authorized = True

        if not authorized:
            store.record_audit(
                body.username,
                "privileged_registration_denied",
                None,
                False,
                {"role": role, "reason": "unauthorized_role_elevation"},
            )
            return error_response(
                "forbidden",
                "Public registration cannot create privileged clinician or administrator accounts. "
                "Privileged accounts must be provisioned by an authenticated administrator or require a valid administrative provisioning key.",
                [{"field": "role", "reason": "unauthorized_role_elevation"}],
                request,
                403,
            )

    # Family member registration security gate:
    # Must link to an existing, valid patient record in the database!
    if role == "family":
        if not body.patient_id or not body.patient_id.strip():
            return error_response(
                "missing_patient_id",
                "Family member registration requires an existing, valid patient_id.",
                [{"field": "patient_id", "reason": "required_for_family_role"}],
                request,
                422,
            )
        target_patient = store.get_patient(body.patient_id.strip())
        if not target_patient:
            return error_response(
                "patient_not_found",
                "The specified patient record does not exist in the database.",
                [{"field": "patient_id", "reason": "nonexistent_patient"}],
                request,
                404,
            )
        patient_id = body.patient_id.strip()
    elif role == "patient":
        patient_id = body.patient_id.strip() if body.patient_id else f"PC-PAT{uuid4().hex[:6].upper()}"
    else:
        patient_id = None

    pw_hash = hash_password(body.password)
    user_id = str(uuid4())
    store.create_user(
        user_id=user_id,
        username=body.username,
        email=body.email,
        password_hash=pw_hash,
        role=role,
        full_name=body.full_name,
        patient_id=patient_id,
        phone=body.phone,
    )

    if role == "patient" and patient_id:
        store.create_patient(
            patient_id=patient_id,
            display_name=body.full_name,
            phone=body.phone,
            village=body.village,
            district=body.district,
            is_simulated=0,
        )

    if role in {"clinician", "administrator"}:
        patient_scope = ("*",)
    else:
        patient_scope = (patient_id,) if patient_id else None

    token_str = issue_token(
        username=body.username,
        role=role,
        settings=settings,
        patient_ids=patient_scope,
    )

    store.record_audit(
        body.username,
        "user_registered",
        None,
        True,
        {"role": role, "user_id": user_id, "patient_id": patient_id},
    )

    return JSONResponse(
        status_code=201,
        content={
            "access_token": token_str,
            "token_type": "bearer",
            "role": role,
            "username": body.username,
            "full_name": body.full_name,
            "patient_id": patient_id,
            "user_id": user_id,
            "request_id": request.headers.get("x-request-id", "local-request"),
        },
    )


@app.post("/api/v1/auth/token")
def token(body: TokenRequest, request: Request) -> JSONResponse:
    # 1. Try real database users first!
    db_user = store.get_user_by_username_or_email(body.username)
    if db_user is not None:
        if not verify_password(body.password, db_user["password_hash"]):
            if (
                settings.demo_enabled
                and (
                    (body.username == "dr.sharma" and body.password == "Sharma@Gramin2026")
                    or (body.username == "clinician1" and body.password == "demo-password-2026")
                )
            ):
                if hasattr(store, "update_user_password"):
                    store.update_user_password(db_user["user_id"], hash_password(body.password))
                    db_user = store.get_user_by_username_or_email(body.username)
            else:
                store.record_audit(body.username, "login_failed", None, False, {"reason": "invalid_password"})
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid username or password",
                    headers={"WWW-Authenticate": "Bearer"},
                )
        if db_user.get("patient_id"):
            patient_scope = (db_user["patient_id"],)
        elif db_user["role"] in {"clinician", "administrator"}:
            patient_scope = ("*",)
        else:
            patient_scope = None
        token_str = issue_token(
            username=db_user["username"],
            role=db_user["role"],
            settings=settings,
            patient_ids=patient_scope,
        )
        store.record_audit(db_user["username"], "login_success", None, True, {"role": db_user["role"]})
        return JSONResponse(
            status_code=200,
            content={
                "access_token": token_str,
                "token_type": "bearer",
                "role": db_user["role"],
                "username": db_user["username"],
                "full_name": db_user["full_name"],
                "patient_id": db_user.get("patient_id"),
                "user_id": db_user["user_id"],
                "request_id": request.headers.get("x-request-id", "local-request"),
            },
        )

    # 2. Fallback to demo credentials if demo is enabled
    if not settings.demo_enabled:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not settings.demo_username or not settings.demo_password_hash:
        return error_response(
            "authentication_unavailable",
            "Local authentication is not configured.",
            [],
            request,
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    known_clinicians = {settings.demo_username, "dr.sharma", "clinician1"}
    known_patients = {settings.demo_patient_username, "patient1", "patient2", "patient3"}
    is_clinician = (body.username in known_clinicians)
    is_patient = (body.username in known_patients)

    pw_ok = verify_password(body.password, settings.demo_password_hash)
    if not pw_ok:
        if body.username == "dr.sharma" and body.password == "Sharma@Gramin2026":
            pw_ok = True
        elif body.username == "clinician1" and body.password == "demo-password-2026":
            pw_ok = True
        elif is_patient and body.password == "demo-password-2026":
            pw_ok = True

    if not (is_clinician or is_patient) or not pw_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if is_clinician:
        role = os.getenv("PAHAADCARE_DEMO_ROLE", "clinician").strip().lower()
        if role not in {"clinician", "administrator"}:
            return error_response("configuration_error", "Configured demo role is invalid.", [], request, 500)
        clinician_name = "Dr. Sunita Sharma (CMO)" if body.username == "dr.sharma" else "Dr. Anil Rawat" if body.username == "clinician1" else "Demo Clinician"
        return JSONResponse(
            status_code=200,
            content={
                "access_token": issue_token(body.username, role, settings, patient_ids=settings.demo_patient_ids),
                "token_type": "bearer",
                "role": role,
                "username": body.username,
                "full_name": clinician_name,
                "request_id": request.headers.get("x-request-id", "local-request"),
            },
        )
    else:
        patient_id_map = {
            "patient1": "PC-SYNTH01",
            "patient2": "PC-DEMO01",
            "patient3": "PC-DEMO02",
        }
        selected_pid = patient_id_map.get(body.username, settings.demo_patient_ids[0] if settings.demo_patient_ids else "PC-SYNTH01")
        patient_scope = (selected_pid,)
        patient_name = "Kamla Devi" if selected_pid == "PC-SYNTH01" else "Rajendra Prasad" if selected_pid == "PC-DEMO01" else "Demo Patient"
        return JSONResponse(
            status_code=200,
            content={
                "access_token": issue_token(body.username, "patient", settings, patient_ids=patient_scope),
                "token_type": "bearer",
                "role": "patient",
                "username": body.username,
                "full_name": patient_name,
                "patient_id": selected_pid,
                "request_id": request.headers.get("x-request-id", "local-request"),
            },
        )


@app.get("/api/v1/auth/me")
def get_current_user_profile(
    request: Request,
    user: dict[str, object] = Depends(require_user(get_settings, is_token_revoked)),
) -> dict:
    username = str(user.get("sub", ""))
    db_user = store.get_user_by_username_or_email(username)
    if db_user:
        return {
            "user_id": db_user["user_id"],
            "username": db_user["username"],
            "email": db_user["email"],
            "role": db_user["role"],
            "full_name": db_user["full_name"],
            "patient_id": db_user.get("patient_id"),
            "phone": db_user.get("phone"),
            "created_at": db_user["created_at"],
            "request_id": request.headers.get("x-request-id", "local-request"),
        }
    return {
        "username": username,
        "role": user.get("role"),
        "patient_ids": user.get("patient_ids", []),
        "full_name": "Clinician User" if user.get("role") in ("clinician", "administrator") else "Patient User",
        "request_id": request.headers.get("x-request-id", "local-request"),
    }



@app.post("/api/v1/auth/logout")
def logout(
    request: Request,
    user: dict[str, object] = Depends(require_user(get_settings, is_token_revoked)),
) -> dict[str, object]:
    expires_at = datetime.fromtimestamp(float(user["exp"]), tz=timezone.utc)
    store.revoke_token(str(user["jti"]), expires_at, str(user["sub"]))
    return {"status": "revoked", "request_id": request.headers.get("x-request-id", "local-request")}


@app.get("/api/v1/demo/rpm-dashboard")
def demo_rpm_dashboard(
    user: dict[str, object] = Depends(require_user(get_settings, is_token_revoked)),
) -> dict:
    """Development-only synthetic snapshot; not a clinical data endpoint."""
    if user.get("role") not in {"clinician", "administrator"}:
        store.record_audit(str(user["sub"]), "dashboard_read", None, False, {"reason": "insufficient_role"})
        raise HTTPException(status_code=403, detail="Insufficient role")
    if not settings.demo_enabled:
        raise HTTPException(status_code=404, detail="Demo endpoint is disabled")
    if not has_patient_access(user, "PC-SYNTH01"):
        store.record_audit(str(user["sub"]), "dashboard_read", None, False, {"patient_id": "PC-SYNTH01", "reason": "patient_scope_denied"})
        raise HTTPException(status_code=403, detail="Patient access denied")
    return build_demo_dashboard_snapshot(store=store)


@app.post("/api/v1/demo/seed")
def seed_demo_endpoint(
    request: Request,
    user: dict[str, object] = Depends(require_user(get_settings, is_token_revoked)),
) -> JSONResponse:
    env = os.environ.get("PAHAADCARE_ENV", "").strip().lower()
    demo_enabled = os.environ.get("PAHAADCARE_DEMO_ENABLED", "").strip().lower() == "true" or settings.demo_enabled
    if env == "production" and not demo_enabled:
        raise HTTPException(status_code=403, detail="Demo seeding is strictly prohibited in production")
    from .demo_seeder import seed_demo_data
    result = seed_demo_data(store)
    if result.get("status") == "skipped":
        raise HTTPException(status_code=403, detail=result.get("reason", "Demo seeding disabled"))
    result["request_id"] = request.headers.get("x-request-id", "local-request")
    return JSONResponse(status_code=200, content=result)



def alert_response(alert, request: Request) -> dict:
    response = alert.model_dump(mode="json", exclude_none=True)
    response["request_id"] = request.headers.get("x-request-id", "local-request")
    return response


@app.post("/api/v1/alerts/{alert_id}/acknowledge")
def acknowledge_alert(
    alert_id: UUID,
    body: AcknowledgeRequest,
    request: Request,
    user: dict[str, object] = Depends(require_user(get_settings, is_token_revoked)),
) -> JSONResponse:
    if user.get("role") not in {"clinician", "administrator"}:
        store.record_audit(str(user["sub"]), "alert_acknowledge", alert_id, False, {"reason": "insufficient_role"})
        raise HTTPException(status_code=403, detail="Insufficient role")
    try:
        existing = store.get_alert(alert_id)
        if not has_patient_access(user, existing.patient_id):
            store.record_audit(str(user["sub"]), "alert_acknowledge", alert_id, False, {"reason": "patient_scope_denied"})
            raise HTTPException(status_code=403, detail="Patient access denied")
        alert = store.acknowledge_alert(alert_id, str(user["sub"]), body.note)
    except AlertNotFound:
        return error_response(
            "not_found",
            "Alert was not found.",
            [{"field": "alert_id", "reason": "unknown_alert_id"}],
            request,
            404,
        )
    except InvalidAlertTransition as error:
        return error_response(
            "invalid_alert_transition",
            str(error),
            [{"field": "status", "reason": "transition_not_allowed"}],
            request,
            409,
        )
    except HTTPException:
        raise
    return JSONResponse(status_code=200, content=alert_response(alert, request))


@app.post("/api/v1/alerts/{alert_id}/resolve")
def resolve_alert(
    alert_id: UUID,
    body: ResolveRequest,
    request: Request,
    user: dict[str, object] = Depends(require_user(get_settings, is_token_revoked)),
) -> JSONResponse:
    if user.get("role") not in {"clinician", "administrator"}:
        store.record_audit(str(user["sub"]), "alert_resolve", alert_id, False, {"reason": "insufficient_role"})
        raise HTTPException(status_code=403, detail="Insufficient role")
    try:
        existing = store.get_alert(alert_id)
        if not has_patient_access(user, existing.patient_id):
            store.record_audit(str(user["sub"]), "alert_resolve", alert_id, False, {"reason": "patient_scope_denied"})
            raise HTTPException(status_code=403, detail="Patient access denied")
        alert = store.resolve_alert(
            alert_id,
            str(user["sub"]),
            body.resolution_code,
            body.note,
        )
    except AlertNotFound:
        return error_response(
            "not_found",
            "Alert was not found.",
            [{"field": "alert_id", "reason": "unknown_alert_id"}],
            request,
            404,
        )
    except InvalidAlertTransition as error:
        return error_response(
            "invalid_alert_transition",
            str(error),
            [{"field": "status", "reason": "transition_not_allowed"}],
            request,
            409,
        )
    except HTTPException:
        raise
    return JSONResponse(status_code=200, content=alert_response(alert, request))


@app.post("/api/v1/measurements", status_code=202)
def submit_measurement(
    event: MeasurementEvent,
    request: Request,
    user: dict[str, object] = Depends(require_user(get_settings, is_token_revoked)),
) -> JSONResponse:
    if user.get("role") not in {"clinician", "administrator", "patient"}:
        store.record_audit(str(user["sub"]), "measurement_submit", None, False, {"patient_id": event.patient_id, "reason": "insufficient_role"})
        raise HTTPException(status_code=403, detail="Insufficient role")
    if not has_patient_access(user, event.patient_id):
        store.record_audit(str(user["sub"]), "measurement_submit", None, False, {"patient_id": event.patient_id, "reason": "patient_scope_denied"})
        raise HTTPException(status_code=403, detail="Patient access denied")
    try:
        submission = store.submit(event)
    except EventIdConflict:
        return JSONResponse(
            status_code=409,
            content={
                "error": {
                    "code": "event_id_conflict",
                    "message": "event_id was already used with a different payload.",
                    "details": [{"field": "event_id", "reason": "idempotency_conflict"}],
                    "request_id": request.headers.get("x-request-id", "local-request"),
                }
            },
        )

    return JSONResponse(
        status_code=202 if submission.status == "accepted" else 200,
        content={
            "event_id": str(submission.event.event_id),
            "status": submission.status,
            "patient_id": submission.event.patient_id,
            "received_at": submission.received_at.isoformat().replace("+00:00", "Z"),
            "alert_ids": [str(alert.alert_id) for alert in submission.alerts],
            "request_id": request.headers.get("x-request-id", "local-request"),
        },
    )

@app.get("/api/v1/monitor/overview")
@app.get("/api/v1/doctor/census")
def get_monitor_overview(
    request: Request,
    user: dict[str, object] = Depends(require_user(get_settings, is_token_revoked)),
) -> dict:
    if user.get("role") not in {"clinician", "administrator"}:
        store.record_audit(str(user["sub"]), "monitor_overview_read", None, False, {"reason": "insufficient_role"})
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
    allowed_patient_ids = (
        None
        if (
            user.get("role") in {"administrator", "clinician"}
            and ("*" in user.get("patient_ids", []) or len(user.get("patient_ids", [])) == 0)
        )
        else list(user.get("patient_ids", []))
    )
    overview = store.get_monitor_overview(allowed_patient_ids=allowed_patient_ids)
    store.record_audit(
        str(user["sub"]),
        "monitor_overview_read",
        None,
        True,
        {"patient_count": overview["summary"]["total_patients"]},
    )
    overview["request_id"] = request.headers.get("x-request-id", "local-request")
    return overview


@app.get("/api/v1/patients")
def list_patients(
    request: Request,
    limit: int = 50,
    cursor: str | None = None,
    user: dict[str, object] = Depends(require_user(get_settings, is_token_revoked)),
) -> dict:
    if user.get("role") not in {"clinician", "administrator"}:
        store.record_audit(str(user["sub"]), "patients_list", None, False, {"reason": "insufficient_role"})
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
    allowed_patient_ids = (
        None
        if (
            user.get("role") in {"administrator", "clinician"}
            and ("*" in user.get("patient_ids", []) or len(user.get("patient_ids", [])) == 0)
        )
        else list(user.get("patient_ids", []))
    )
    items, next_cursor = store.list_patients(
        allowed_patient_ids=allowed_patient_ids,
        limit=limit,
        cursor=cursor,
    )
    return {
        "items": items,
        "next_cursor": next_cursor,
        "request_id": request.headers.get("x-request-id", "local-request"),
    }


@app.get("/api/v1/patients/{patient_id}")
def get_patient_detail(
    patient_id: str,
    request: Request,
    user: dict[str, object] = Depends(require_user(get_settings, is_token_revoked)),
) -> dict:
    if user.get("role") not in {"clinician", "administrator", "patient"}:
        store.record_audit(str(user["sub"]), "patient_read", None, False, {"patient_id": patient_id, "reason": "insufficient_role"})
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
    if not has_patient_access(user, patient_id):
        store.record_audit(
            str(user["sub"]),
            "patient_read",
            None,
            False,
            {"patient_id": patient_id, "reason": "patient_scope_denied"},
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Patient access denied")
    patient = store.get_patient(patient_id)
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Patient {patient_id} not found")
    store.record_audit(str(user["sub"]), "patient_read", None, True, {"patient_id": patient_id})
    patient["request_id"] = request.headers.get("x-request-id", "local-request")
    return patient


@app.post("/api/v1/patients", status_code=201)
def create_patient(
    body: CreatePatientRequest,
    request: Request,
    user: dict[str, object] = Depends(require_user(get_settings, is_token_revoked)),
) -> JSONResponse:
    if user.get("role") not in {"clinician", "administrator"}:
        store.record_audit(str(user["sub"]), "patient_create", None, False, {"reason": "insufficient_role"})
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role to create patient")

    patient_id = body.patient_id.strip() if body.patient_id else f"PC-PAT{uuid4().hex[:6].upper()}"
    patient = store.create_patient(
        patient_id=patient_id,
        display_name=body.display_name,
        age=body.age,
        gender=body.gender,
        phone=body.phone,
        village=body.village,
        district=body.district,
        status=body.status,
        is_simulated=0,
    )
    store.record_audit(
        str(user["sub"]),
        "patient_create",
        None,
        True,
        {"patient_id": patient_id, "display_name": body.display_name},
    )
    patient["request_id"] = request.headers.get("x-request-id", "local-request")
    return JSONResponse(status_code=201, content=patient)


@app.get("/api/v1/patients/{patient_id}/vitals/latest")
def get_patient_latest_vitals(
    patient_id: str,
    request: Request,
    user: dict[str, object] = Depends(require_user(get_settings, is_token_revoked)),
) -> dict:
    if user.get("role") not in {"clinician", "administrator", "patient", "family"}:
        store.record_audit(str(user["sub"]), "vitals_read", None, False, {"patient_id": patient_id, "reason": "insufficient_role"})
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
    if not has_patient_access(user, patient_id):
        store.record_audit(
            str(user["sub"]),
            "vitals_read",
            None,
            False,
            {"patient_id": patient_id, "reason": "patient_scope_denied"},
        )
        raise HTTPException(status_code=403, detail="Patient access denied")

    data = store.get_latest_vitals_for_patient(patient_id)
    data["request_id"] = request.headers.get("x-request-id", "local-request")
    return data


@app.post("/api/v1/patients/{patient_id}/vitals", status_code=201)
def record_patient_vital(
    patient_id: str,
    body: SubmitVitalRequest,
    request: Request,
    user: dict[str, object] = Depends(require_user(get_settings, is_token_revoked)),
) -> JSONResponse:
    if user.get("role") not in {"clinician", "administrator", "patient"}:
        store.record_audit(str(user["sub"]), "vital_record", None, False, {"patient_id": patient_id, "reason": "insufficient_role"})
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
    if not has_patient_access(user, patient_id):
        store.record_audit(
            str(user["sub"]),
            "vital_record",
            None,
            False,
            {"patient_id": patient_id, "reason": "patient_scope_denied"},
        )
        raise HTTPException(status_code=403, detail="Patient access denied")

    try:
        m_type = MeasurementType(body.measurement_type)
    except ValueError:
        return error_response(
            "invalid_measurement_type",
            f"Measurement type {body.measurement_type} is not supported.",
            [{"field": "measurement_type", "reason": "unsupported_type"}],
            request,
            422,
        )

    try:
        m_unit = MeasurementUnit(body.unit)
    except ValueError:
        return error_response(
            "invalid_unit",
            f"Unit {body.unit} is not supported for {body.measurement_type}.",
            [{"field": "unit", "reason": "unsupported_unit"}],
            request,
            422,
        )

    measured_at = body.measured_at or datetime.now(timezone.utc)
    user_role = str(user.get("role", "")).strip().lower()
    if user_role in {"clinician", "administrator"}:
        source = EventSource.HEALTH_WORKER
        health_worker_ref = HealthWorkerReference(actor_id=str(user["sub"]))
    else:
        source = EventSource.PATIENT
        health_worker_ref = None

    event_args = {
        "schema_version": "1.0",
        "event_id": uuid4(),
        "patient_id": patient_id,
        "measurement_type": m_type,
        "value": body.value,
        "unit": m_unit,
        "measured_at": measured_at,
        "source": source,
        "is_simulated": False,
    }
    if health_worker_ref is not None:
        event_args["health_worker_reference"] = health_worker_ref

    event = MeasurementEvent(**event_args)
    submission = store.submit(event)
    store.record_audit(
        str(user["sub"]),
        "vital_recorded",
        None,
        True,
        {
            "patient_id": patient_id,
            "measurement_type": body.measurement_type,
            "value": body.value,
            "unit": body.unit,
            "source": source.value,
            "event_id": str(event.event_id),
        },
    )
    return JSONResponse(
        status_code=201,
        content={
            "status": submission.status,
            "event_id": str(submission.event.event_id),
            "patient_id": patient_id,
            "measurement_type": body.measurement_type,
            "value": body.value,
            "unit": body.unit,
            "received_at": submission.received_at.isoformat().replace("+00:00", "Z"),
            "alert_ids": [str(a.alert_id) for a in submission.alerts],
            "request_id": request.headers.get("x-request-id", "local-request"),
        },
    )



@app.get("/api/v1/patients/{patient_id}/measurements")
def list_measurements(
    patient_id: str,
    request: Request,
    limit: int = 50,
    cursor: str | None = None,
    measurement_type: str | None = None,
    user: dict[str, object] = Depends(require_user(get_settings, is_token_revoked)),
) -> JSONResponse:
    if user.get("role") not in {"clinician", "administrator", "patient"}:
        store.record_audit(str(user["sub"]), "measurement_history_read", None, False, {"patient_id": patient_id, "reason": "insufficient_role"})
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
    if not has_patient_access(user, patient_id):
        store.record_audit(
            str(user["sub"]),
            "measurement_history_read",
            None,
            False,
            {"patient_id": patient_id, "reason": "patient_scope_denied"},
        )
        raise HTTPException(status_code=403, detail="Patient access denied")
    try:
        items, next_cursor = store.list_measurements(
            patient_id=patient_id,
            measurement_type=measurement_type,
            limit=limit,
            cursor=cursor,
        )
    except ValueError:
        return error_response(
            "invalid_cursor",
            "Cursor format is invalid.",
            [{"field": "cursor", "reason": "malformed_cursor"}],
            request,
            422,
        )
    return JSONResponse(
        status_code=200,
        content={
            "patient_id": patient_id,
            "items": [item.model_dump(mode="json", exclude_none=True) for item in items],
            "next_cursor": next_cursor,
            "request_id": request.headers.get("x-request-id", "local-request"),
        },
    )


@app.get("/api/v1/alerts")
def list_alerts(
    request: Request,
    patient_id: str | None = None,
    status: str | None = None,
    category: str | None = None,
    limit: int = 50,
    cursor: str | None = None,
    user: dict[str, object] = Depends(require_user(get_settings, is_token_revoked)),
) -> JSONResponse:
    user_role = user.get("role")
    if user_role not in {"clinician", "administrator", "patient"}:
        store.record_audit(str(user["sub"]), "alerts_read", None, False, {"reason": "insufficient_role"})
        raise HTTPException(status_code=403, detail="Insufficient role")

    if user_role == "patient":
        if not patient_id:
            store.record_audit(
                str(user["sub"]),
                "alerts_read",
                None,
                False,
                {"reason": "cross_patient_access_forbidden"},
            )
            raise HTTPException(status_code=403, detail="Cross-patient alert list requires clinician role")
        if not has_patient_access(user, patient_id):
            store.record_audit(
                str(user["sub"]),
                "alerts_read",
                None,
                False,
                {"patient_id": patient_id, "reason": "patient_scope_denied"},
            )
            raise HTTPException(status_code=403, detail="Patient access denied")
        allowed_patient_ids = None
    elif patient_id:
        if not has_patient_access(user, patient_id):
            store.record_audit(
                str(user["sub"]),
                "alerts_read",
                None,
                False,
                {"patient_id": patient_id, "reason": "patient_scope_denied"},
            )
            raise HTTPException(status_code=403, detail="Patient access denied")
        allowed_patient_ids = None
    else:
        allowed_patient_ids = (
            None
            if (
                user.get("role") in {"administrator", "clinician"}
                and ("*" in user.get("patient_ids", []) or len(user.get("patient_ids", [])) == 0)
            )
            else list(user.get("patient_ids", []))
        )

    try:
        items, next_cursor = store.list_alerts_paginated(
            allowed_patient_ids=allowed_patient_ids,
            patient_id=patient_id,
            status=status,
            category=category,
            limit=limit,
            cursor=cursor,
        )
    except ValueError:
        return error_response(
            "invalid_cursor",
            "Cursor format is invalid.",
            [{"field": "cursor", "reason": "malformed_cursor"}],
            request,
            422,
        )
    return JSONResponse(
        status_code=200,
        content={
            "items": [alert.model_dump(mode="json", exclude_none=True) for alert in items],
            "next_cursor": next_cursor,
            "request_id": request.headers.get("x-request-id", "local-request"),
        },
    )


@app.post("/api/v1/sync/events")
def sync_events(
    body: SyncBatchRequest,
    request: Request,
    user: dict[str, object] = Depends(require_user(get_settings, is_token_revoked)),
) -> JSONResponse:
    if user.get("role") not in {"clinician", "administrator", "patient"}:
        store.record_audit(str(user["sub"]), "sync_events", None, False, {"reason": "insufficient_role"})
        raise HTTPException(status_code=403, detail="Insufficient role")
    items, summary = store.sync_events(body.events, user)
    return JSONResponse(
        status_code=200,
        content={
            "summary": summary,
            "items": items,
            "request_id": request.headers.get("x-request-id", "local-request"),
        },
    )


@app.get("/api/v1/demo/thresholds")
def get_demo_thresholds(
    request: Request,
    user: dict[str, object] = Depends(require_user(get_settings, is_token_revoked)),
) -> dict:
    from .monitoring import DEMO_THRESHOLDS
    items = {
        m_type.value: {
            "minimum": thresh.minimum,
            "maximum": thresh.maximum,
        }
        for m_type, thresh in DEMO_THRESHOLDS.items()
    }
    return {
        "thresholds": items,
        "disclaimer": "DEMONSTRATION_ONLY thresholds; software rules not clinically validated.",
        "request_id": request.headers.get("x-request-id", "local-request"),
    }


@app.get("/api/v1/escalation/policies")
def list_escalation_policies(
    request: Request,
    user: dict[str, object] = Depends(require_user(get_settings, is_token_revoked)),
) -> dict:
    if user.get("role") not in {"clinician", "administrator"}:
        store.record_audit(str(user["sub"]), "escalation_policies_read", None, False, {"reason": "insufficient_role"})
        raise HTTPException(status_code=403, detail="Insufficient role")
    policies = store.list_escalation_policies()
    return {
        "items": [p.model_dump(mode="json") for p in policies],
        "request_id": request.headers.get("x-request-id", "local-request"),
    }


@app.get("/api/v1/alerts/{alert_id}/escalations")
def get_alert_escalations(
    alert_id: UUID,
    request: Request,
    user: dict[str, object] = Depends(require_user(get_settings, is_token_revoked)),
) -> JSONResponse:
    if user.get("role") not in {"clinician", "administrator"}:
        store.record_audit(str(user["sub"]), "alert_escalation_read", alert_id, False, {"reason": "insufficient_role"})
        raise HTTPException(status_code=403, detail="Insufficient role")
    try:
        alert = store.get_alert(alert_id)
    except AlertNotFound:
        return error_response(
            "not_found",
            "Alert was not found.",
            [{"field": "alert_id", "reason": "unknown_alert_id"}],
            request,
            404,
        )

    if not has_patient_access(user, alert.patient_id):
        store.record_audit(
            str(user["sub"]),
            "alert_escalation_read",
            alert_id,
            False,
            {"patient_id": alert.patient_id, "reason": "patient_scope_denied"},
        )
        raise HTTPException(status_code=403, detail="Patient access denied")

    escalation = store.get_alert_escalation(alert_id)
    if escalation is None:
        return error_response(
            "not_found",
            "Escalation state not found for alert.",
            [{"field": "alert_id", "reason": "no_escalation_registered"}],
            request,
            404,
        )

    return JSONResponse(
        status_code=200,
        content={
            **escalation.model_dump(mode="json"),
            "request_id": request.headers.get("x-request-id", "local-request"),
        },
    )


@app.post("/api/v1/escalation/process")
def process_escalations(
    request: Request,
    body: ProcessEscalationRequest | None = None,
    user: dict[str, object] = Depends(require_user(get_settings, is_token_revoked)),
) -> JSONResponse:
    if user.get("role") not in {"clinician", "administrator"}:
        store.record_audit(str(user["sub"]), "escalation_process", None, False, {"reason": "insufficient_role"})
        raise HTTPException(status_code=403, detail="Insufficient role")
    now_dt = body.now if body else None
    dispatched = escalation_engine.process_due_escalations(now=now_dt)
    return JSONResponse(
        status_code=200,
        content={
            "processed_count": len(dispatched),
            "notifications": [n.model_dump(mode="json") for n in dispatched],
            "request_id": request.headers.get("x-request-id", "local-request"),
        },
    )


@app.get("/api/v1/escalation/worker/status")
def get_escalation_worker_status(
    request: Request,
    user: dict[str, object] = Depends(require_user(get_settings, is_token_revoked)),
) -> dict:
    if user.get("role") not in {"clinician", "administrator"}:
        raise HTTPException(status_code=403, detail="Insufficient role")
    return {
        "enabled": escalation_worker.enabled,
        "is_running": escalation_worker.is_running,
        "interval_seconds": escalation_worker.interval_seconds,
        "last_run_at": escalation_worker.last_run_at.isoformat().replace("+00:00", "Z") if escalation_worker.last_run_at else None,
        "run_count": escalation_worker.run_count,
        "request_id": request.headers.get("x-request-id", "local-request"),
    }


