"""Blueprint for the admin console: users, devices and their data (nested)."""

from __future__ import annotations

from flask import Blueprint, current_app, jsonify, render_template, request, session

from auth import admin_required, api_admin_required, current_user, hash_password
from db import (
    count_records,
    delete_user,
    get_user_by_id,
    list_devices,
    list_records,
    list_users,
    update_user_password,
)

admin_bp = Blueprint("admin", __name__)

RECORDS_PAGE_SIZE = 50
MIN_PASSWORD_LENGTH = 6


def _error(message: str, status: int = 400):
    return jsonify({"error": message}), status


@admin_bp.get("/admin")
@admin_required
def admin_page():
    """Render the admin console for admin users."""
    return render_template("admin.html", user=current_user(current_app))


@admin_bp.get("/api/admin/users")
@api_admin_required
def users():
    """Return all users (admin role included)."""
    return jsonify({"data": list_users(current_app)})


@admin_bp.get("/api/admin/users/<int:user_id>/devices")
@api_admin_required
def user_devices(user_id: int):
    """Return the devices belonging to a given user."""
    devices = list_devices(current_app, user_id=user_id)
    return jsonify({"data": devices})


@admin_bp.get("/api/admin/devices/<int:device_id>/records")
@api_admin_required
def device_records(device_id: int):
    """Return one page of a device's readings, newest first."""
    page = max(1, request.args.get("page", 1, type=int))
    page_size = request.args.get("limit", RECORDS_PAGE_SIZE, type=int)
    page_size = max(1, min(page_size, 200))

    offset = (page - 1) * page_size
    total = count_records(current_app, device_id=device_id)
    records = list_records(
        current_app, limit=page_size, offset=offset, device_id=device_id
    )
    return jsonify(
        {
            "total": total,
            "page": page,
            "limit": page_size,
            "data": records,
        }
    )


@admin_bp.put("/api/admin/users/<int:user_id>/password")
@api_admin_required
def reset_user_password(user_id: int):
    """Admin resets a user's password."""
    if get_user_by_id(current_app, user_id) is None:
        return _error("用户不存在", 404)

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return _error("Request body must be a JSON object")
    password = payload.get("password") or ""
    if len(password) < MIN_PASSWORD_LENGTH:
        return _error(f"密码至少需要 {MIN_PASSWORD_LENGTH} 位")

    update_user_password(current_app, user_id, hash_password(password))
    return jsonify({"message": "密码已更新"})


@admin_bp.delete("/api/admin/users/<int:user_id>")
@api_admin_required
def delete_user_route(user_id: int):
    """Admin deletes a user and all associated devices and readings."""
    if user_id == session.get("user_id"):
        return _error("不能删除当前登录的管理员账号", 400)
    if get_user_by_id(current_app, user_id) is None:
        return _error("用户不存在", 404)

    devices = list_devices(current_app, user_id=user_id)
    if not delete_user(current_app, user_id):
        return _error("用户不存在", 404)
    return jsonify(
        {"message": "用户及其设备、数据已删除", "device_count": len(devices)}
    )
