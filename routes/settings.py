"""Threshold settings endpoints: devices fetch them; users edit them.

Devices identify themselves by serial (no login), while edits are restricted
to the logged-in owner so a device cannot be reconfigured by a third party.
"""

from __future__ import annotations

from flask import Blueprint, current_app, jsonify, request

from auth import api_login_required, current_user
from db import (
    DEFAULT_THRESHOLDS,
    get_device_by_serial,
    get_device_settings,
    list_devices,
    upsert_device_settings,
)

settings_bp = Blueprint("settings", __name__)


def _error(message: str, status: int = 400):
    return jsonify({"error": message}), status


def _settings_payload(settings: dict, serial: str) -> dict:
    payload = {
        "serial": serial,
        "temp_low_c": settings["temp_low_c"],
        "temp_high_c": settings["temp_high_c"],
        "flow_high_lpm": settings["flow_high_lpm"],
        "ec_high_us_cm": settings["ec_high_us_cm"],
        "turb_high_ntu": settings["turb_high_ntu"],
    }
    if settings.get("updated_at"):
        payload["updated_at"] = settings["updated_at"]
    return payload


@settings_bp.get("/api/settings")
def get_settings():
    """Return a device's thresholds, identified by its serial (no login).

    Query param: ``serial``. When no settings row exists, defaults matching the
    firmware's fallback values are returned (and persisted).
    """
    serial = (request.args.get("serial") or "").strip()
    if not serial:
        return _error("Field 'serial' is required")

    device = get_device_by_serial(current_app, serial)
    if device is None:
        return _error("设备不存在或序列号无效", 404)

    settings = get_device_settings(current_app, device["id"])
    return jsonify({"data": _settings_payload(settings, serial)})


@settings_bp.put("/api/settings")
@api_login_required
def update_settings():
    """Update thresholds for a device owned by the current user.

    Body: ``{"serial": "...", "temp_low_c": ..., ...}`` (partial update allowed).
    Requires ``temp_low_c < temp_high_c``; all values must be finite numbers.
    """
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return _error("Request body must be a JSON object")

    serial = (payload.get("serial") or "").strip()
    if not serial:
        return _error("Field 'serial' is required")

    user = current_user(current_app)
    device = get_device_by_serial(current_app, serial)
    if device is None:
        return _error("设备不存在或序列号无效", 404)

    owned_ids = {d["id"] for d in list_devices(current_app, user_id=user["id"])}
    if device["id"] not in owned_ids:
        return _error("设备不存在或无权修改", 404)

    updates = {k: payload[k] for k in DEFAULT_THRESHOLDS if k in payload}
    if not updates:
        return _error("没有可更新的阈值字段")

    try:
        parsed = {k: float(v) for k, v in updates.items()}
    except (TypeError, ValueError):
        return _error("阈值必须是数字")

    for k, v in parsed.items():
        if v != v or v in (float("inf"), float("-inf")):  # NaN / inf
            return _error("阈值必须是有限数值")

    if "temp_low_c" in parsed or "temp_high_c" in parsed:
        current = get_device_settings(current_app, device["id"])
        merged_low = parsed["temp_low_c"] if "temp_low_c" in parsed else current["temp_low_c"]
        merged_high = parsed["temp_high_c"] if "temp_high_c" in parsed else current["temp_high_c"]
        if merged_low >= merged_high:
            return _error("温度下限必须小于上限")

    settings = upsert_device_settings(current_app, device["id"], parsed)
    return jsonify({"data": _settings_payload(settings, serial)})
