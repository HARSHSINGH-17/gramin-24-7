from datetime import datetime, timezone
import os
from pathlib import Path
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from pydantic import BaseModel, ConfigDict, Field

from .auth import SecuritySettings, has_patient_access, issue_token, require_role, require_user, verify_password
from .demo_dashboard import build_demo_dashboard_snapshot
from .escalation import EscalationEngine, EscalationWorker
from .models import MeasurementEvent
from .repository import AlertNotFound, InvalidAlertTransition, SQLiteRepository
from .store import EventIdConflict

settings = SecuritySettings.from_environment()
DEFAULT_DATABASE_PATH = Path(__file__).resolve().parents[1] / "data" / "pahaadcare.sqlite3"
store = SQLiteRepository(os.environ.get("PAHAADCARE_DB_PATH", DEFAULT_DATABASE_PATH))
escalation_engine = EscalationEngine(repository=store)
escalation_worker = EscalationWorker(
    engine=escalation_engine,
    interval_seconds=float(os.environ.get("ESCALATION_POLL_INTERVAL_SECONDS", "10.0")),
    enabled=os.environ.get("ESCALATION_WORKER_ENABLED", "false").lower() in ("true", "1", "yes"),
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if escalation_worker.enabled:
        await escalation_worker.start()
    yield
    if escalation_worker.is_running:
        await escalation_worker.stop()


app = FastAPI(title="PahaadCare RPM API", version="1.0.0", lifespan=lifespan)
is_token_revoked = lambda jti: store.is_token_revoked(jti)
get_settings = lambda: settings
cors_kwargs: dict[str, object] = {
    "allow_origins": list(settings.cors_origins),
    "allow_methods": ["GET", "POST", "OPTIONS"],
    "allow_headers": ["*"],
    "allow_credentials": True,
}
if settings.environment in {"development", "test"}:
    cors_kwargs["allow_origin_regex"] = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"
    cors_kwargs["allow_methods"] = ["*"]

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
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "pahaadcare-rpm-api",
        "api_version": "v1",
        "checked_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }


@app.post("/api/v1/auth/token")
def token(body: TokenRequest, request: Request) -> JSONResponse:
    if not settings.demo_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Demo authentication is not permitted in this environment",
        )
    if not settings.demo_username or not settings.demo_password_hash:
        return error_response(
            "authentication_unavailable",
            "Local authentication is not configured.",
            [],
            request,
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    if body.username != settings.demo_username or not verify_password(
        body.password, settings.demo_password_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    role = os.getenv("PAHAADCARE_DEMO_ROLE", "clinician").strip().lower()
    if role not in {"clinician", "administrator"}:
        return error_response("configuration_error", "Configured demo role is invalid.", [], request, 500)
    return {"access_token": issue_token(body.username, role, settings), "token_type": "bearer"}


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
    user: dict[str, object] = Depends(require_role("clinician", get_settings, is_token_revoked)),
) -> dict:
    """Development-only synthetic snapshot; not a clinical data endpoint."""
    if not settings.demo_enabled:
        raise HTTPException(status_code=404, detail="Demo endpoint is disabled")
    if not has_patient_access(user, "PC-SYNTH01"):
        store.record_audit(str(user["sub"]), "dashboard_read", None, False, {"patient_id": "PC-SYNTH01", "reason": "patient_scope_denied"})
        raise HTTPException(status_code=403, detail="Patient access denied")
    return build_demo_dashboard_snapshot(store=store)


def alert_response(alert, request: Request) -> dict:
    response = alert.model_dump(mode="json", exclude_none=True)
    response["request_id"] = request.headers.get("x-request-id", "local-request")
    return response


@app.post("/api/v1/alerts/{alert_id}/acknowledge")
def acknowledge_alert(
    alert_id: UUID,
    body: AcknowledgeRequest,
    request: Request,
    user: dict[str, object] = Depends(require_role("clinician", get_settings, is_token_revoked)),
) -> JSONResponse:
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
    user: dict[str, object] = Depends(require_role("clinician", get_settings, is_token_revoked)),
) -> JSONResponse:
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
    user: dict[str, object] = Depends(require_role("clinician", get_settings, is_token_revoked)),
) -> JSONResponse:
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


@app.get("/api/v1/patients")
def list_patients(
    request: Request,
    limit: int = 50,
    cursor: str | None = None,
    user: dict[str, object] = Depends(require_role("clinician", get_settings, is_token_revoked)),
) -> dict:
    allowed_patient_ids = (
        None
        if (
            user.get("role") == "administrator"
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


@app.get("/api/v1/patients/{patient_id}/measurements")
def list_measurements(
    patient_id: str,
    request: Request,
    limit: int = 50,
    cursor: str | None = None,
    measurement_type: str | None = None,
    user: dict[str, object] = Depends(require_role("clinician", get_settings, is_token_revoked)),
) -> JSONResponse:
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
    user: dict[str, object] = Depends(require_role("clinician", get_settings, is_token_revoked)),
) -> JSONResponse:
    if patient_id:
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
                user.get("role") == "administrator"
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
    user: dict[str, object] = Depends(require_role("clinician", get_settings, is_token_revoked)),
) -> JSONResponse:
    items, summary = store.sync_events(body.events, user)
    return JSONResponse(
        status_code=200,
        content={
            "summary": summary,
            "items": items,
            "request_id": request.headers.get("x-request-id", "local-request"),
        },
    )


@app.get("/api/v1/escalation/policies")
def list_escalation_policies(
    request: Request,
    user: dict[str, object] = Depends(require_role("clinician", get_settings, is_token_revoked)),
) -> dict:
    policies = store.list_escalation_policies()
    return {
        "items": [p.model_dump(mode="json") for p in policies],
        "request_id": request.headers.get("x-request-id", "local-request"),
    }


@app.get("/api/v1/alerts/{alert_id}/escalations")
def get_alert_escalations(
    alert_id: UUID,
    request: Request,
    user: dict[str, object] = Depends(require_role("clinician", get_settings, is_token_revoked)),
) -> JSONResponse:
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
    user: dict[str, object] = Depends(require_role("clinician", get_settings, is_token_revoked)),
) -> JSONResponse:
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
    user: dict[str, object] = Depends(require_role("clinician", get_settings, is_token_revoked)),
) -> dict:
    return {
        "enabled": escalation_worker.enabled,
        "is_running": escalation_worker.is_running,
        "interval_seconds": escalation_worker.interval_seconds,
        "last_run_at": escalation_worker.last_run_at.isoformat().replace("+00:00", "Z") if escalation_worker.last_run_at else None,
        "run_count": escalation_worker.run_count,
        "request_id": request.headers.get("x-request-id", "local-request"),
    }


