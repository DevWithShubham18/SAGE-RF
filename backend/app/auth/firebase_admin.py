import os

import firebase_admin
from firebase_admin import auth, credentials
from google.auth.transport import requests
from google.oauth2 import id_token as google_id_token


def initialize_firebase_admin():
    """
    Initialize Firebase Admin SDK for ID-token verification.

    A service-account JSON file can be supplied through
    FIREBASE_SERVICE_ACCOUNT. For local verification-only use, a Firebase
    project ID is sufficient because ID tokens are verified against Google's
    public signing certificates.
    """

    if firebase_admin._apps:
        return firebase_admin.get_app()

    service_account_path = os.getenv(
        "FIREBASE_SERVICE_ACCOUNT"
    )

    if service_account_path:
        if not os.path.exists(service_account_path):
            raise RuntimeError("Firebase service account file was not found")

        credential = credentials.Certificate(service_account_path)
        return firebase_admin.initialize_app(credential)

    raise RuntimeError("Firebase service-account authentication is not configured")


def verify_firebase_token(id_token: str) -> dict:
    """
    Verify a Firebase ID token and return its decoded claims.
    """

    service_account_path = os.getenv("FIREBASE_SERVICE_ACCOUNT", "").strip()
    if service_account_path:
        initialize_firebase_admin()
        return auth.verify_id_token(id_token)

    project_id = os.getenv("FIREBASE_PROJECT_ID", "").strip()
    if not project_id:
        raise RuntimeError("Firebase authentication is not configured")

    claims = google_id_token.verify_firebase_token(
        id_token,
        requests.Request(),
        audience=project_id,
    )

    if claims.get("iss") != f"https://securetoken.google.com/{project_id}":
        raise ValueError("Firebase token issuer is invalid")

    subject = claims.get("sub")
    if not isinstance(subject, str) or not subject:
        raise ValueError("Firebase token subject is invalid")

    # Match firebase_admin.auth.verify_id_token(), which exposes the token
    # subject through both `sub` and the Firebase-compatible `uid` alias.
    claims["uid"] = subject

    return claims
