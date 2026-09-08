from unittest.mock import patch

from backend.app.auth.firebase_admin import verify_firebase_token


def test_project_id_verification_preserves_firebase_uid(monkeypatch):
    """The public-certificate verifier must match Firebase Admin's claims."""

    project_id = "sage-rf-test-project"
    subject = "firebase-user-123"
    monkeypatch.delenv("FIREBASE_SERVICE_ACCOUNT", raising=False)
    monkeypatch.setenv("FIREBASE_PROJECT_ID", project_id)

    verified_claims = {
        "sub": subject,
        "iss": f"https://securetoken.google.com/{project_id}",
        "aud": project_id,
    }

    with patch(
        "backend.app.auth.firebase_admin.google_id_token.verify_firebase_token",
        return_value=verified_claims,
    ) as verifier:
        claims = verify_firebase_token("signed-firebase-token")

    verifier.assert_called_once()
    assert claims["sub"] == subject
    assert claims["uid"] == subject


def test_project_id_verification_rejects_wrong_issuer(monkeypatch):
    project_id = "sage-rf-test-project"
    monkeypatch.delenv("FIREBASE_SERVICE_ACCOUNT", raising=False)
    monkeypatch.setenv("FIREBASE_PROJECT_ID", project_id)

    with patch(
        "backend.app.auth.firebase_admin.google_id_token.verify_firebase_token",
        return_value={"sub": "firebase-user-123", "iss": "https://invalid.example"},
    ):
        try:
            verify_firebase_token("signed-firebase-token")
        except ValueError as exc:
            assert "issuer" in str(exc).lower()
        else:
            raise AssertionError("A Firebase token with the wrong issuer was accepted")
