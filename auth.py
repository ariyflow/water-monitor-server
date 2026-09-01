"""Authentication helpers: password hashing and login-protection decorators."""

from __future__ import annotations

import hashlib
from functools import wraps
from typing import Any, Callable, TypeVar

from flask import jsonify, redirect, session, url_for

from db import get_user_by_id

View = TypeVar("View", bound=Callable)


def hash_password(password: str) -> str:
    """Return the SHA256 hex digest of a plaintext password."""
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def verify_password(password: str, password_hash: str) -> bool:
    """Check a plaintext password against a stored SHA256 digest."""
    return hashlib.sha256(password.encode("utf-8")).hexdigest() == password_hash


def current_user(app: Any) -> dict[str, Any] | None:
    """Return the logged-in user record, or None if not authenticated."""
    user_id = session.get("user_id")
    if user_id is None:
        return None
    return get_user_by_id(app, user_id)


def login_required(view: View) -> View:
    """Redirect to the login page when the request is not authenticated."""

    @wraps(view)
    def wrapped(*args: Any, **kwargs: Any) -> Any:
        if session.get("user_id") is None:
            return redirect(url_for("auth.login_page"))
        return view(*args, **kwargs)

    return wrapped  # type: ignore[return-value]


def api_login_required(view: View) -> View:
    """Return 401 JSON when the API request is not authenticated."""

    @wraps(view)
    def wrapped(*args: Any, **kwargs: Any) -> Any:
        if session.get("user_id") is None:
            return jsonify({"error": "Authentication required"}), 401
        return view(*args, **kwargs)

    return wrapped  # type: ignore[return-value]
