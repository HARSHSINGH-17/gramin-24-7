from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import uuid4

from .models import (
    Alert,
    AlertCategory,
    AlertReason,
    AlertSeverity,
    AlertStatus,
    MeasurementEvent,
    MeasurementType,
    MissingDataEvent,
)


@dataclass(frozen=True)
class DemonstrationThreshold:
    """DEMONSTRATION_ONLY bounds; not clinically validated guidance."""

    minimum: float | None = None
    maximum: float | None = None

    def __post_init__(self) -> None:
        if self.minimum is not None and self.maximum is not None:
            if self.minimum > self.maximum:
                raise ValueError("threshold minimum cannot exceed maximum")


# DEMONSTRATION_ONLY thresholds. They are not clinically validated guidance.
DEMO_THRESHOLDS: dict[MeasurementType, DemonstrationThreshold] = {
    MeasurementType.HEART_RATE: DemonstrationThreshold(40, 120),
    MeasurementType.OXYGEN_SATURATION: DemonstrationThreshold(92),
    MeasurementType.BODY_TEMPERATURE: DemonstrationThreshold(35, 38),
    MeasurementType.SYSTOLIC_BLOOD_PRESSURE: DemonstrationThreshold(90, 180),
    MeasurementType.DIASTOLIC_BLOOD_PRESSURE: DemonstrationThreshold(60, 120),
}


def validate_thresholds(
    thresholds: dict[MeasurementType, DemonstrationThreshold],
) -> dict[MeasurementType, DemonstrationThreshold]:
    expected_types = set(MeasurementType)
    if set(thresholds) != expected_types:
        raise ValueError("thresholds must cover every supported measurement type")
    for measurement_type, threshold in thresholds.items():
        if not isinstance(threshold, DemonstrationThreshold):
            raise TypeError(f"invalid threshold for {measurement_type.value}")
    return thresholds


validate_thresholds(DEMO_THRESHOLDS)


def evaluate_demo_threshold(
    event: MeasurementEvent,
    thresholds: dict[MeasurementType, DemonstrationThreshold] = DEMO_THRESHOLDS,
) -> Alert | None:
    validate_thresholds(thresholds)
    threshold = thresholds[event.measurement_type]
    minimum, maximum = threshold.minimum, threshold.maximum
    abnormal = (
        minimum is not None and event.value < minimum
    ) or (
        maximum is not None and event.value > maximum
    )
    if not abnormal:
        return None

    if minimum is not None and event.value < minimum:
        direction = "below"
        boundary = minimum
    else:
        direction = "above"
        boundary = maximum

    created_at = event.received_at or datetime.now(timezone.utc)
    return Alert(
        schema_version="1.0",
        alert_id=uuid4(),
        patient_id=event.patient_id,
        related_event_id=event.event_id,
        category=AlertCategory.ABNORMAL_MEASUREMENT,
        severity=AlertSeverity.MEDIUM,
        reason=AlertReason(
            code=f"{event.measurement_type.value}_{direction}_demo_threshold",
            message=(
                f"Demonstration threshold exceeded: {event.value} {event.unit.value}; "
                f"boundary is {boundary}."
            ),
            rule_version="demo-1",
            expected_measurement_type=event.measurement_type,
        ),
        created_at=created_at,
        status=AlertStatus.OPEN,
    )


def alert_from_missing_data(event: MissingDataEvent) -> Alert:
    category = AlertCategory(event.category.value)
    return Alert(
        schema_version="1.0",
        alert_id=uuid4(),
        patient_id=event.patient_id,
        category=category,
        severity=AlertSeverity.MEDIUM,
        reason=AlertReason(
            code=f"{event.expected_measurement_type.value}_{event.category.value}",
            message=(
                f"No valid {event.expected_measurement_type.value} measurement was "
                f"observed in the expected window."
            ),
            rule_version="demo-1",
            expected_measurement_type=event.expected_measurement_type,
        ),
        created_at=event.observed_at,
        status=AlertStatus.OPEN,
    )
