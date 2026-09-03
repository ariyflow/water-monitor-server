"""Authentication helpers: password hashing and login-protection decorators."""

from __future__ import annotations

import hashlib
from functools import wraps
from typing import Any, Callable, TypeVar

from flask import current_app, jsonify, redirect, request, session, url_for

from db import get_user_by_api_token, get_user_by_id

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


def _resolve_user() -> dict[str, Any] | None:
    """Resolve the current user from a Bearer token, else from the session.

    Prefers ``Authorization: Bearer <token>`` (used by the mobile app); falls
    back to the cookie session (used by the web UI). When a token is used the
    session is seeded for the rest of the request so ``current_user()`` works.
    """
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[len("Bearer "):].strip()
        user = get_user_by_api_token(current_app, token)
        if user is not None:
            session["user_id"] = user["id"]
            session["username"] = user["username"]
        return user
    user_id = session.get("user_id")
    if user_id is None:
        return None
    return get_user_by_id(current_app, user_id)


def login_required(view: View) -> View:
    """Redirect to the login page when the request is not authenticated.

    Also invalidates a stale session whose user no longer exists (e.g. the
    account was deleted by an admin): the cookie is cleared and the user is
    sent back to the login page instead of being let through with ``None``.
    """

    @wraps(view)
    def wrapped(*args: Any, **kwargs: Any) -> Any:
        user_id = session.get("user_id")
        if user_id is None:
            return redirect(url_for("auth.login_page"))
        if get_user_by_id(current_app, user_id) is None:
            session.clear()
            return redirect(url_for("auth.login_page"))
        return view(*args, **kwargs)

    return wrapped  # type: ignore[return-value]


def api_login_required(view: View) -> View:
    """Return 401 JSON when the API request is not authenticated."""

    @wraps(view)
    def wrapped(*args: Any, **kwargs: Any) -> Any:
        user = _resolve_user()
        if user is None:
            return jsonify({"error": "Authentication required"}), 401
        return view(*args, **kwargs)

    return wrapped  # type: ignore[return-value]


def api_admin_required(view: View) -> View:
    """Return 403 JSON unless the request is made by an admin user."""

    @wraps(view)
    def wrapped(*args: Any, **kwargs: Any) -> Any:
        user = _resolve_user()
        if user is None:
            return jsonify({"error": "Authentication required"}), 401
        if not user.get("is_admin"):
            return jsonify({"error": "Admin privileges required"}), 403
        return view(*args, **kwargs)

    return wrapped  # type: ignore[return-value]


def admin_required(view: View) -> View:
    """Redirect to the app home unless the user is an admin."""

    @wraps(view)
    def wrapped(*args: Any, **kwargs: Any) -> Any:
        if session.get("user_id") is None:
            return redirect(url_for("auth.login_page"))
        user = get_user_by_id(current_app, session.get("user_id"))
        if user is None or not user.get("is_admin"):
            return redirect(url_for("web.index"))
        return view(*args, **kwargs)

    return wrapped  # type: ignore[return-value]
