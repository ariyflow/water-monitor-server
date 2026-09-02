"""Blueproint for user registration, login, logout, and the login page."""

from __future__ import annotations

from typing import Any

from flask import (
    Blueprint,
    current_app,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

from auth import hash_password, verify_password
from db import (
    create_api_token,
    create_user,
    get_user_by_id,
    get_user_by_username,
)

auth_bp = Blueprint("auth", __name__)

MIN_PASSWORD_LENGTH = 6


def _token_response(user: dict[str, Any]) -> dict[str, Any]:
    """Build a token-login response for a verified user."""
    from db import API_TOKEN_TTL_SECONDS

    token = create_api_token(current_app, user["id"])
    return {
        "token": token,
        "expires_in": API_TOKEN_TTL_SECONDS,
        "user": _public_user(user),
    }


def _error(message: str, status: int = 400):
    return jsonify({"error": message}), status


def _public_user(user: dict[str, Any] | None) -> dict[str, Any] | None:
    """Strip the password hash before returning a user to the client."""
    if user is None:
        return None
    return {
        "id": user["id"],
        "username": user["username"],
        "is_admin": bool(user.get("is_admin")),
        "created_at": user["created_at"],
    }


@auth_bp.get("/login")
def login_page():
    """Show the login/register page, or redirect if already logged in."""
    if session.get("user_id") is not None:
        return redirect(url_for("web.index"))
    return render_template("login.html")


@auth_bp.post("/api/auth/register")
def register():
    """Register a new user. Username is unique; password is stored hashed."""
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return _error("Request body must be a JSON object")

    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""

    if not username:
        return _error("用户名不能为空")
    if not password:
        return _error("密码不能为空")
    if len(password) < MIN_PASSWORD_LENGTH:
        return _error(f"密码至少需要 {MIN_PASSWORD_LENGTH} 位")
    if get_user_by_username(current_app, username):
        return _error("用户名已存在", 409)

    user = create_user(current_app, username, hash_password(password))
    session["user_id"] = user["id"]
    session["username"] = user["username"]
    return jsonify({"data": _public_user(user)}), 201


@auth_bp.post("/api/auth/login")
def login():
    """Authenticate a user and create a session."""
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return _error("Request body must be a JSON object")

    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""

    user = get_user_by_username(current_app, username)
    if user is None or not verify_password(password, user["password_hash"]):
        return _error("用户名或密码错误", 401)

    session.clear()
    session["user_id"] = user["id"]
    session["username"] = user["username"]
    return jsonify({"data": _public_user(user)})


@auth_bp.post("/api/auth/token")
def login_token():
    """Authenticate a user and return an API token (for native/mobile clients)."""
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return _error("Request body must be a JSON object")

    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""

    user = get_user_by_username(current_app, username)
    if user is None or not verify_password(password, user["password_hash"]):
        return _error("用户名或密码错误", 401)

    return jsonify({"data": _token_response(user)})


@auth_bp.post("/api/auth/logout")
def logout():
    """Clear the session for the current user."""
    session.clear()
    return jsonify({"message": "已退出登录"})


@auth_bp.get("/api/auth/me")
def me():
    """Return the currently authenticated user, or null."""
    user = get_user_by_id(current_app, session["user_id"]) if session.get("user_id") else None
    return jsonify({"data": _public_user(user)})
