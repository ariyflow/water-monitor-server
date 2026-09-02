"""Alarm endpoints: device reports alerts; users read/acknowledge them."""

from __future__ import annotations

from flask import Blueprint, current_app, jsonify, request

from auth import api_login_required, current_user
from db import (
    count_alarms,
    create_alarm,
    get_device_by_serial,
    list_alarms,
    mark_alarm_read,
)

alarms_bp = Blueprint("alarms", __name__)

DEFAULT_PAGE_SIZE = 50


def _error(message: str, status: int = 400):
    return jsonify({"error": message}), status


@alarms_bp.post("/api/alarms")
def create_alarm_route():
    """Receive an alarm reported by a device (identified by serial, no login)."""
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return _error("Request body must be a JSON object")

    serial = (payload.get("serial") or "").strip()
    if not serial:
        return _error("Field 'serial' is required")

    device = get_device_by_serial(current_app, serial)
    if device is None:
        return _error("设备不存在或序列号无效", 404)

    alarm = create_alarm(current_app, device["id"], payload)
    return jsonify({"data": alarm}), 201


@alarms_bp.get("/api/alarms")
@api_login_required
def list_alarms_route():
    """List alarms for the current user's devices.

    Query params: ``unread=1``, ``active=1``, ``limit``, ``offset``.
    """
    user = current_user(current_app)
    user_id = user["id"] if user else None

    limit = max(1, min(request.args.get("limit", DEFAULT_PAGE_SIZE, type=int), 200))
    offset = max(0, request.args.get("offset", 0, type=int))
    unread_only = request.args.get("unread", "0") == "1"
    active_only = request.args.get("active", "0") == "1"

    alarms = list_alarms(
        current_app,
        user_id=user_id,
        limit=limit,
        offset=offset,
        unread_only=unread_only,
        active_only=active_only,
    )
    total = count_alarms(
        current_app, user_id=user_id, unread_only=unread_only, active_only=active_only
    )
    unread = count_alarms(current_app, user_id=user_id, unread_only=True)
    return jsonify(
        {
            "total": total,
            "unread": unread,
            "limit": limit,
            "offset": offset,
            "data": alarms,
        }
    )


@alarms_bp.post("/api/alarms/<int:alarm_id>/read")
@api_login_required
def read_alarm_route(alarm_id: int):
    """Mark an alarm as read (only if it belongs to the current user)."""
    user = current_user(current_app)
    user_id = user["id"] if user else None

    if not mark_alarm_read(current_app, alarm_id, user_id):
        return _error("报警不存在或无权操作", 404)
    return jsonify({"message": "已读"})
