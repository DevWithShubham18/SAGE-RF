import os

import firebase_admin
from firebase_admin import auth, credentials


def initialize_firebase_admin():
    """
    Initialize Firebase Admin SDK using a service-account JSON file.

    The path is supplied through the FIREBASE_SERVICE_ACCOUNT
    environment variable.
    """

    if firebase_admin._apps:
        return firebase_admin.get_app()

    service_account_path = os.getenv(
        "FIREBASE_SERVICE_ACCOUNT"
    )

    if not service_account_path:
        raise RuntimeError(
            "FIREBASE_SERVICE_ACCOUNT environment variable "
            "is not set"
        )

    if not os.path.exists(service_account_path):
        raise RuntimeError(
            f"Firebase service account file not found: "
            f"{service_account_path}"
        )

    credential = credentials.Certificate(
        service_account_path
    )

    return firebase_admin.initialize_app(
        credential
    )


def verify_firebase_token(id_token: str) -> dict:
    """
    Verify a Firebase ID token and return its decoded claims.
    """

    initialize_firebase_admin()

    return auth.verify_id_token(id_token)
