from datetime import timedelta

from backend.app.engine import MonitoringEngine
from backend.synthetic_vitals import BASE_TIME, SyntheticScenario, generate_scenario


def main() -> None:
    engine = MonitoringEngine(clock=lambda: BASE_TIME + timedelta(minutes=10))
    scenarios = (
        SyntheticScenario.DEMO,
        SyntheticScenario.STALE,
        SyntheticScenario.DUPLICATE,
        SyntheticScenario.CONFLICT,
        SyntheticScenario.RECOVERY,
        SyntheticScenario.FUTURE,
    )
    for scenario in scenarios:
        for item in generate_scenario(scenario).events:
            if hasattr(item, "measurement_type") and hasattr(item, "value"):
                result = engine.process_measurement(item)
            else:
                result = engine.process_missing(item)
            print(
                scenario.value,
                result.outcome.value,
                result.event_id,
                result.patient_id,
                result.measurement_type or "missing",
                result.value if result.value is not None else "-",
                result.reason or "-",
                [str(alert.alert_id) for alert in result.alerts],
            )


if __name__ == "__main__":
    main()
