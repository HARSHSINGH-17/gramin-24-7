import argparse
import json
import os
from pathlib import Path
import sys

from .repository import SQLiteRepository

def main() -> None:
    parser = argparse.ArgumentParser(description="Deterministic local audit export for PahaadCare RPM")
    parser.add_argument("--db-path", default=os.environ.get("PAHAADCARE_DB_PATH"), help="Path to sqlite3 database")
    parser.add_argument("--start-id", type=int, default=None, help="Start audit_id (inclusive)")
    parser.add_argument("--end-id", type=int, default=None, help="End audit_id (inclusive)")
    parser.add_argument("--start-time", default=None, help="Start ISO timestamp")
    parser.add_argument("--end-time", default=None, help="End ISO timestamp")
    parser.add_argument("--output", default=None, help="Output JSON file path (defaults to stdout)")

    args = parser.parse_args()
    db_path = args.db_path or Path(__file__).resolve().parents[1] / "data" / "pahaadcare.sqlite3"
    repository = SQLiteRepository(db_path)
    result = repository.export_audit(
        start_id=args.start_id,
        end_id=args.end_id,
        start_time=args.start_time,
        end_time=args.end_time,
    )
    serialized = json.dumps(result, indent=2, sort_keys=True)
    if args.output:
        Path(args.output).write_text(serialized, encoding="utf-8")
        print(f"Audit log exported to {args.output}")
    else:
        sys.stdout.write(serialized + "\n")

if __name__ == "__main__":
    main()
