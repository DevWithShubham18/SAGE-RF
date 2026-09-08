import logging

from fastapi import Header, HTTPException

from backend.app.auth.firebase_admin import verify_firebase_token


logger = logging.getLogger(__name__)


def get_current_user(
    authorization: str | None = Header(default=None),
) -> dict:
    """
    Extract and verify a Firebase ID token from the Authorization header.

    Expected header:

        Authorization: Bearer <firebase-id-token>
    """

    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Missing Authorization header",
        )

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Invalid Authorization header",
        )

    id_token = authorization[7:].strip()

    if not id_token:
        raise HTTPException(
            status_code=401,
            detail="Missing Firebase ID token",
        )

    try:
        decoded_token = verify_firebase_token(id_token)
    except Exception as exc:
        logger.warning(
            "Firebase ID token verification failed (%s): %s",
            type(exc).__name__,
            exc,
        )
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired Firebase ID token",
        ) from exc

    return decoded_token
