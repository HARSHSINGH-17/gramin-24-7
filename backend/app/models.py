from datetime import datetime
from enum import Enum
from math import isfinite
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictFloat, field_validator, model_validator


class MeasurementType(str, Enum):
    HEART_RATE = "heart_rate"
    OXYGEN_SATURATION = "oxygen_saturation"
    BODY_TEMPERATURE = "body_temperature"
    SYSTOLIC_BLOOD_PRESSURE = "systolic_blood_pressure"
    DIASTOLIC_BLOOD_PRESSURE = "diastolic_blood_pressure"


class MeasurementUnit(str, Enum):
    BEATS_PER_MINUTE = "beats_per_minute"
    PERCENT = "percent"
    CELSIUS = "celsius"
    MMHG = "mmHg"


class EventSource(str, Enum):
    DEVICE = "device"
    HEALTH_WORKER = "health_worker"
    PATIENT = "patient"
    SIMULATOR = "simulator"
    IMPORT = "import"


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def reject_explicit_nulls(data: object, fields: tuple[str, ...]) -> object:
    if isinstance(data, dict):
        null_fields = [field for field in fields if field in data and data[field] is None]
        if null_fields:
            raise ValueError(
                "fields do not accept null: " + ", ".join(sorted(null_fields))
            )
    return data


class DeviceReference(ContractModel):
    device_id: str | None = Field(default=None, min_length=1, max_length=128)
    model: str | None = Field(default=None, min_length=1, max_length=128)
    firmware: str | None = Field(default=None, min_length=1, max_length=128)

    @model_validator(mode="before")
    @classmethod
    def reject_null_properties(cls, data: object) -> object:
        return reject_explicit_nulls(data, ("device_id", "model", "firmware"))

    @model_validator(mode="after")
    def require_reference_value(self) -> "DeviceReference":
        if not any((self.device_id, self.model, self.firmware)):
            raise ValueError("device_reference must contain at least one value")
        return self


class HealthWorkerReference(ContractModel):
    actor_id: str = Field(min_length=1, max_length=128)
    facility_id: str | None = Field(default=None, min_length=1, max_length=128)

    @model_validator(mode="before")
    @classmethod
    def reject_null_properties(cls, data: object) -> object:
        return reject_explicit_nulls(data, ("actor_id", "facility_id"))


class MeasurementEvent(ContractModel):
    schema_version: Literal["1.0"]
    event_id: UUID
    patient_id: str = Field(pattern=r"^PC-[A-Z0-9]{4,32}$")
    measurement_type: MeasurementType
    value: StrictFloat
    unit: MeasurementUnit
    measured_at: datetime
    received_at: datetime | None = None
    source: EventSource
    is_simulated: bool
    device_reference: DeviceReference | None = None
    health_worker_reference: HealthWorkerReference | None = None

    @model_validator(mode="before")
    @classmethod
    def reject_null_properties(cls, data: object) -> object:
        return reject_explicit_nulls(
            data, ("received_at", "device_reference", "health_worker_reference")
        )

    @field_validator("value")
    @classmethod
    def require_finite_value(cls, value: float) -> float:
        if not isfinite(value):
            raise ValueError("value must be finite")
        return value

    @field_validator("measured_at", "received_at")
    @classmethod
    def require_timezone(cls, value: datetime | None) -> datetime | None:
        if value is not None and (value.tzinfo is None or value.utcoffset() is None):
            raise ValueError("timestamp must include timezone information")
        return value

    @model_validator(mode="after")
    def validate_measurement_contract(self) -> "MeasurementEvent":
        expected_units = {
            MeasurementType.HEART_RATE: MeasurementUnit.BEATS_PER_MINUTE,
            MeasurementType.OXYGEN_SATURATION: MeasurementUnit.PERCENT,
            MeasurementType.BODY_TEMPERATURE: MeasurementUnit.CELSIUS,
            MeasurementType.SYSTOLIC_BLOOD_PRESSURE: MeasurementUnit.MMHG,
            MeasurementType.DIASTOLIC_BLOOD_PRESSURE: MeasurementUnit.MMHG,
        }
        ranges = {
            MeasurementType.HEART_RATE: (20, 300),
            MeasurementType.OXYGEN_SATURATION: (0, 100),
            MeasurementType.BODY_TEMPERATURE: (-50, 60),
            MeasurementType.SYSTOLIC_BLOOD_PRESSURE: (40, 300),
            MeasurementType.DIASTOLIC_BLOOD_PRESSURE: (20, 200),
        }
        expected_unit = expected_units[self.measurement_type]
        if self.unit != expected_unit:
            raise ValueError(
                f"unit {self.unit.value!r} is incompatible with "
                f"measurement_type {self.measurement_type.value!r}"
            )
        minimum, maximum = ranges[self.measurement_type]
        if not minimum <= self.value <= maximum:
            raise ValueError(
                f"value must be between {minimum} and {maximum} for "
                f"{self.measurement_type.value}"
            )
        if self.source is EventSource.SIMULATOR and not self.is_simulated:
            raise ValueError("simulator events must set is_simulated=true")
        return self


class MissingDataCategory(str, Enum):
    MISSING_MEASUREMENT = "missing_measurement"
    STALE_READING = "stale_reading"
    INGESTION_FAILURE = "ingestion_failure"


class MissingDataEvent(ContractModel):
    event_id: UUID
    patient_id: str = Field(pattern=r"^PC-[A-Z0-9]{4,32}$")
    category: MissingDataCategory
    expected_measurement_type: MeasurementType
    expected_window_start: datetime
    expected_window_end: datetime
    observed_at: datetime
    status: Literal["missing", "stale", "failed"]

    @field_validator(
        "expected_window_start", "expected_window_end", "observed_at"
    )
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timestamp must include timezone information")
        return value

    @model_validator(mode="after")
    def validate_window(self) -> "MissingDataEvent":
        if self.expected_window_end <= self.expected_window_start:
            raise ValueError("expected measurement window must have positive duration")
        return self


class AlertCategory(str, Enum):
    ABNORMAL_MEASUREMENT = "abnormal_measurement"
    MISSING_MEASUREMENT = "missing_measurement"
    STALE_READING = "stale_reading"
    INGESTION_FAILURE = "ingestion_failure"


class AlertSeverity(str, Enum):
    INFO = "info"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AlertStatus(str, Enum):
    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"


class AlertReason(ContractModel):
    code: str = Field(min_length=1, max_length=128)
    message: str = Field(min_length=1, max_length=1000)
    rule_version: str = Field(min_length=1, max_length=64)
    expected_measurement_type: MeasurementType | None = None

    @model_validator(mode="before")
    @classmethod
    def reject_null_properties(cls, data: object) -> object:
        return reject_explicit_nulls(data, ("expected_measurement_type",))


class Acknowledgement(ContractModel):
    acknowledged_at: datetime
    acknowledged_by: str = Field(min_length=1, max_length=128)
    note: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="before")
    @classmethod
    def reject_null_properties(cls, data: object) -> object:
        return reject_explicit_nulls(data, ("acknowledged_at", "acknowledged_by", "note"))

    @field_validator("acknowledged_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timestamp must include timezone information")
        return value


class Resolution(ContractModel):
    resolved_at: datetime
    resolved_by: str = Field(min_length=1, max_length=128)
    resolution_code: str = Field(min_length=1, max_length=128)
    note: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="before")
    @classmethod
    def reject_null_properties(cls, data: object) -> object:
        return reject_explicit_nulls(
            data, ("resolved_at", "resolved_by", "resolution_code", "note")
        )

    @field_validator("resolved_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timestamp must include timezone information")
        return value


class Alert(ContractModel):
    schema_version: Literal["1.0"]
    alert_id: UUID
    patient_id: str = Field(pattern=r"^PC-[A-Z0-9]{4,32}$")
    related_event_id: UUID | None = None
    category: AlertCategory
    severity: AlertSeverity
    reason: AlertReason
    created_at: datetime
    status: AlertStatus
    acknowledgement: Acknowledgement | None = None
    resolution: Resolution | None = None

    @model_validator(mode="before")
    @classmethod
    def reject_null_properties(cls, data: object) -> object:
        return reject_explicit_nulls(data, ("related_event_id", "acknowledgement", "resolution"))

    @field_validator("created_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timestamp must include timezone information")
        return value

    @model_validator(mode="after")
    def validate_lifecycle(self) -> "Alert":
        if (
            self.category is AlertCategory.ABNORMAL_MEASUREMENT
            and self.related_event_id is None
        ):
            raise ValueError("abnormal measurement alerts require related_event_id")
        if self.status in {AlertStatus.ACKNOWLEDGED, AlertStatus.RESOLVED}:
            if self.acknowledgement is None:
                raise ValueError("acknowledged and resolved alerts require acknowledgement")
        if self.status is AlertStatus.RESOLVED and self.resolution is None:
            raise ValueError("resolved alerts require resolution metadata")
        return self


class EscalationRole(str, Enum):
    COMMUNITY_HEALTH_WORKER = "community_health_worker"
    SUPERVISOR = "supervisor"


class NotificationDeliveryStatus(str, Enum):
    DELIVERED = "delivered"
    FAILED = "failed"
    RETRYING = "retrying"


class EscalationStatus(str, Enum):
    PENDING = "pending"
    ESCALATED = "escalated"
    ACKNOWLEDGED_STOPPED = "acknowledged_stopped"
    RESOLVED_STOPPED = "resolved_stopped"
    MAX_REACHED = "max_reached"


class EscalationPolicy(ContractModel):
    policy_id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=128)
    category: AlertCategory | None = None
    min_severity: AlertSeverity = AlertSeverity.MEDIUM
    initial_target_role: EscalationRole = EscalationRole.COMMUNITY_HEALTH_WORKER
    escalation_delay_seconds: int = Field(ge=1, le=86400)
    subsequent_target_role: EscalationRole | None = EscalationRole.SUPERVISOR
    max_attempts: int = Field(ge=1, le=10, default=3)
    retry_delay_seconds: int = Field(ge=1, le=3600, default=60)
    stop_on_acknowledge: bool = True
    stop_on_resolve: bool = True
    is_demo: bool = True


class MockNotification(ContractModel):
    notification_id: UUID
    alert_id: UUID
    patient_id: str = Field(pattern=r"^PC-[A-Z0-9]{4,32}$")
    escalation_level: int = Field(ge=1, le=5)
    recipient_role: EscalationRole
    recipient_target: str = Field(min_length=1, max_length=128)
    channel: str = Field(default="mock_sms", max_length=32)
    message_body: str = Field(min_length=1, max_length=1000)
    created_at: datetime
    attempted_at: datetime
    delivery_status: NotificationDeliveryStatus
    retry_count: int = Field(ge=0, default=0)
    failure_reason: str | None = None
    is_simulated: bool = True

    @field_validator("created_at", "attempted_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timestamp must include timezone information")
        return value


class AlertEscalationState(ContractModel):
    alert_id: UUID
    policy_id: str
    patient_id: str = Field(pattern=r"^PC-[A-Z0-9]{4,32}$")
    current_level: int = Field(ge=0, le=5, default=0)
    status: EscalationStatus
    created_at: datetime
    next_due_at: datetime | None = None
    last_escalated_at: datetime | None = None
    attempts_count: int = Field(ge=0, default=0)
    updated_at: datetime
    notifications: list[MockNotification] = Field(default_factory=list)

    @field_validator("created_at", "updated_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timestamp must include timezone information")
        return value

