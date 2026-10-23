from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import base64
import hashlib
import hmac
import os
import secrets
from collections.abc import Callable
from typing import Annotated
from uuid import uuid4

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer


class ConfigurationError(RuntimeError):
    pass


@dataclass(frozen=True)
class SecuritySettings:
    environment: str
    auth_secret: str
    issuer: str
    audience: str
    token_minutes: int
    demo_enabled: bool
    demo_username: str | None
    demo_password_hash: str | None
    demo_patient_ids: tuple[str, ...]
    cors_origins: tuple[str, ...]
    max_body_bytes: int
    demo_patient_username: str | None = None

    @classmethod
    def from_environment(cls) -> "SecuritySettings":
        environment = os.getenv("PAHAADCARE_ENV", "development").strip().lower()
        if environment not in {"development", "test", "production", "demo", "staging"}:
            raise ConfigurationError("PAHAADCARE_ENV must be development, test, production, demo, or staging")

        host = os.getenv("PAHAADCARE_HOST", "127.0.0.1").strip().lower()
        is_loopback = host in {"127.0.0.1", "localhost", "::1"}

        auth_secret = os.getenv("PAHAADCARE_AUTH_SECRET", "").strip()
        if environment == "production":
            if not auth_secret or len(auth_secret) < 32:
                raise ConfigurationError("PAHAADCARE_AUTH_SECRET must be at least 32 characters in production")
            demo_env_req = os.getenv("PAHAADCARE_DEMO_ENABLED")
            if (
                (demo_env_req is not None and demo_env_req.strip().lower() == "true")
                or os.getenv("PAHAADCARE_DEMO_USERNAME")
                or os.getenv("PAHAADCARE_DEMO_PASSWORD_HASH")
            ):
                raise ConfigurationError(
                    "Unsafe configuration: demo account and demo endpoints cannot be configured or enabled in production"
                )

        if not auth_secret:
            auth_secret = secrets.token_urlsafe(32)

        demo_value = os.getenv("PAHAADCARE_DEMO_ENABLED")
        demo_requested = demo_value.strip().lower() == "true" if demo_value is not None else False

        if environment == "production":
            demo_enabled = False
        elif environment in {"demo", "staging"}:
            demo_enabled = demo_requested if demo_value is not None else True
        else:
            if not is_loopback and (demo_requested or demo_value is not None):
                raise ConfigurationError("Demo account cannot be enabled on non-loopback deployment host")
            demo_enabled = is_loopback and (
                demo_requested if demo_value is not None else (environment in {"development", "test"})
            )

        origins_value = os.getenv(
            "PAHAADCARE_CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,http://localhost:4173,http://127.0.0.1:4173,http://localhost:3000,http://127.0.0.1:3000",
        )
        cors_origins = tuple(origin.strip() for origin in origins_value.split(",") if origin.strip())
        if environment == "production" and (not cors_origins or "*" in cors_origins):
            raise ConfigurationError("production CORS origins must be explicit and non-wildcard")

        demo_username = os.getenv("PAHAADCARE_DEMO_USERNAME")
        demo_password_hash = os.getenv("PAHAADCARE_DEMO_PASSWORD_HASH")
        if demo_enabled and environment in {"development", "test", "demo", "staging"}:
            if not demo_username:
                demo_username = "dr.sharma"
            if not demo_password_hash:
                demo_password_hash = hash_password("Sharma@Gramin2026")
        patient_ids = tuple(
            value.strip()
            for value in os.getenv("PAHAADCARE_DEMO_PATIENT_IDS", "PC-SYNTH01,PC-DEMO01,PC-DEMO02,PC-DEMO03,PC-DEMO04,PC-DEMO05").split(",")
            if value.strip()
        )
        if demo_enabled and (not demo_username or not demo_password_hash):
            raise ConfigurationError(
                "demo access requires PAHAADCARE_DEMO_USERNAME and PAHAADCARE_DEMO_PASSWORD_HASH"
            )

        token_minutes = int(os.getenv("PAHAADCARE_TOKEN_MINUTES", "30"))
        if token_minutes < 1 or token_minutes > 1440:
            raise ConfigurationError("PAHAADCARE_TOKEN_MINUTES must be bounded between 1 and 1440 minutes")

        demo_patient_username = os.getenv("PAHAADCARE_DEMO_PATIENT_USERNAME", "patient1") if demo_enabled else None

        return cls(
            environment=environment,
            auth_secret=auth_secret,
            issuer=os.getenv("PAHAADCARE_JWT_ISSUER", "pahaadcare-rpm"),
            audience=os.getenv("PAHAADCARE_JWT_AUDIENCE", "pahaadcare-client"),
            token_minutes=token_minutes,
            demo_enabled=demo_enabled,
            demo_username=demo_username,
            demo_password_hash=demo_password_hash,
            demo_patient_ids=patient_ids,
            cors_origins=cors_origins,
            max_body_bytes=int(os.getenv("PAHAADCARE_MAX_BODY_BYTES", "65536")),
            demo_patient_username=demo_patient_username,
        )


def hash_password(password: str) -> str:
    if not password or len(password) < 12:
        raise ValueError("password must be at least 12 characters")
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
    encode = lambda value: base64.urlsafe_b64encode(value).decode("ascii")
    return f"scrypt$16384$8$1${encode(salt)}${encode(digest)}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, n, r, p, salt_encoded, digest_encoded = encoded.split("$")
        if algorithm != "scrypt":
            return False
        salt = base64.urlsafe_b64decode(salt_encoded.encode("ascii"))
        expected = base64.urlsafe_b64decode(digest_encoded.encode("ascii"))
        actual = hashlib.scrypt(
            password.encode("utf-8"), salt=salt, n=int(n), r=int(r), p=int(p)
        )
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError, UnicodeError):
        return False


def issue_token(
    username: str,
    role: str,
    settings: SecuritySettings,
    now: datetime | None = None,
    patient_ids: tuple[str, ...] | None = None,
) -> str:
    issued_at = now or datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": username,
            "role": role,
            "patient_ids": list(patient_ids or settings.demo_patient_ids),
            "jti": str(uuid4()),
            "iss": settings.issuer,
            "aud": settings.audience,
            "iat": issued_at,
            "exp": issued_at + timedelta(minutes=settings.token_minutes),
        },
        settings.auth_secret,
        algorithm="HS256",
    )


bearer = HTTPBearer(auto_error=False)


def unauthorized(detail: str = "Authentication required") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def decode_token(
    raw_token: str,
    settings: SecuritySettings,
    is_revoked: Callable[[str], bool] | None = None,
) -> dict[str, object]:
    try:
        claims = jwt.decode(
            raw_token,
            settings.auth_secret,
            algorithms=["HS256"],
            issuer=settings.issuer,
            audience=settings.audience,
            options={"require": ["sub", "role", "patient_ids", "jti", "iss", "aud", "iat", "exp"]},
        )
    except jwt.PyJWTError as error:
        raise unauthorized("Invalid or expired access token") from error
    username = claims.get("sub")
    role = claims.get("role")
    patient_ids = claims.get("patient_ids")
    jti = claims.get("jti")
    if not isinstance(username, str) or not isinstance(role, str) or not isinstance(jti, str):
        raise unauthorized("Invalid access token claims")
    if not isinstance(patient_ids, list) or not all(isinstance(value, str) for value in patient_ids):
        raise unauthorized("Invalid access scope claims")
    if is_revoked is not None and is_revoked(jti):
        raise unauthorized("Access token has been revoked")
    return {
        "sub": username,
        "role": role,
        "jti": jti,
        "patient_ids": patient_ids,
        "exp": claims["exp"],
    }


def current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    settings: SecuritySettings,
    is_revoked: Callable[[str], bool] | None = None,
) -> dict[str, object]:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise unauthorized()
    return decode_token(credentials.credentials, settings, is_revoked)


def require_user(
    settings: SecuritySettings | Callable[[], SecuritySettings],
    is_revoked: Callable[[str], bool] | None = None,
):
    def dependency(
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    ) -> dict[str, object]:
        effective_settings = settings() if callable(settings) else settings
        return current_user(credentials, effective_settings, is_revoked)

    return dependency


def require_role(
    role: str | tuple[str, ...] | set[str] | list[str],
    settings: SecuritySettings | Callable[[], SecuritySettings],
    is_revoked: Callable[[str], bool] | None = None,
):
    user_dependency = require_user(settings, is_revoked)
    allowed_roles = {role} if isinstance(role, str) else set(role)
    allowed_roles.add("administrator")

    def dependency(
        user: Annotated[dict[str, object], Depends(user_dependency)],
    ) -> dict[str, object]:
        if str(user.get("role", "")) not in allowed_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        return user

    return dependency


def has_patient_access(user: dict[str, object], patient_id: str) -> bool:
    if not isinstance(user, dict) or not patient_id:
        return False
    role = str(user.get("role", "")).strip().lower()
    patient_ids = user.get("patient_ids")
    if role == "administrator":
        # Administrator has broad clinical oversight scope unless explicitly restricted
        if patient_ids is None or not isinstance(patient_ids, list):
            return True
        if "*" in patient_ids or len(patient_ids) == 0 or patient_id in patient_ids:
            return True
        return False

    if not isinstance(patient_ids, list):
        return False

    # Wildcard access is strictly reserved for clinicians and administrators
    if "*" in patient_ids:
        if role == "clinician":
            return True
        # Patients and family members can NEVER receive wildcard patient access
        return False

    # For patients and family members, patient_id must explicitly be in their authorized patient_ids
    return patient_id in patient_ids

