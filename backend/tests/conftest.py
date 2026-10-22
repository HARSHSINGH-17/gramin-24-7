import atexit
import os
from pathlib import Path
import shutil
import tempfile

import pytest

from backend.app.auth import hash_password

_TEST_DATABASE_DIRECTORY = Path(tempfile.mkdtemp(prefix="pahaadcare-rpm-tests-"))
os.environ["PAHAADCARE_DB_PATH"] = str(_TEST_DATABASE_DIRECTORY / "test.sqlite3")
os.environ["PAHAADCARE_ENV"] = "test"
os.environ["PAHAADCARE_AUTH_SECRET"] = "test-only-secret-that-is-long-enough-123456"
os.environ["PAHAADCARE_DEMO_USERNAME"] = "test-clinician"
os.environ["PAHAADCARE_DEMO_PASSWORD_HASH"] = hash_password("test-password-1234")
os.environ["PAHAADCARE_DEMO_PATIENT_IDS"] = "PC-SYNTH01,PC-DEMO01"
atexit.register(shutil.rmtree, _TEST_DATABASE_DIRECTORY, ignore_errors=True)


@pytest.fixture
def auth_headers():
	from backend.app.auth import issue_token
	from backend.app.main import settings

	return {
		"Authorization": f"Bearer {issue_token('test-clinician', 'clinician', settings)}"
	}
