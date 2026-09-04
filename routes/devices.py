"""Blueproint for device management and serial-number assignment."""

from __future__ import annotations

from flask import Blueprint, current_app, jsonify, request, session

from auth import api_login_required
from db import (
    create_device,
    generate_serial,
    get_device_by_deviceid,
    get_device_by_serial,
    get_user_by_username,
    list_devices,
)

devices_bp = Blueprint("devices", __name__)


def _error(message: str, status: int = 400):
    return jsonify({"error": message}), status


def _device_payload(device: dict, username: str | None = None) -> dict:
    data = {
        "id": device["id"],
        "serial": device["serial"],
        "name": device["name"],
        "created_at": device["created_at"],
        "user_id": device["user_id"],
    }
    if username is not None:
        data["username"] = username
    return data


@devices_bp.post("/api/devices")
def assign_device():
    """Generate a serial and bind a new device to the given username.

    Body: {"username": "alice", "deviceid": "optional-identity", "name": "optional-remark"}
    The 6-byte serial is returned to the caller; the device then stores it and
    reports sensor data using that serial.

    Idempotent by ``deviceid``: a physical device re-provisioning with the same
    ``deviceid`` (stored in the legacy ``name`` column) reuses its existing
    serial instead of minting a duplicate, while still allowing one username to
    own multiple distinct devices.
    """
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return _error("Request body must be a JSON object")

    username = (payload.get("username") or "").strip()
    deviceid = (payload.get("deviceid") or "").strip()
    name = (payload.get("name") or "").strip()

    if not username:
        return _error("Field 'username' is required")

    user = get_user_by_username(current_app, username)
    if user is None:
        return _error("用户不存在", 404)

    if deviceid:
        existing = get_device_by_deviceid(current_app, user["id"], deviceid)
        if existing is not None:
            return jsonify({"data": _device_payload(existing, username)}), 200

    serial = generate_serial()
    device = create_device(
        current_app, user["id"], serial=serial, name=deviceid or name
    )
    return jsonify({"data": _device_payload(device, username)}), 201


@devices_bp.get("/api/devices")
@api_login_required
def list_devices_route():
    """List devices. Defaults to the requesting user; use ?username= to query another user."""
    username = request.args.get("username")
    if username:
        user = get_user_by_username(current_app, username.strip())
        if user is None:
            return _error("用户不存在", 404)
        user_id = user["id"]
    else:
        user_id = session.get("user_id")

    devices = list_devices(current_app, user_id=user_id)
    return jsonify({"data": [_device_payload(d) for d in devices]})


@devices_bp.get("/api/devices/<serial>")
@api_login_required
def get_device_route(serial: str):
    """Look up a device by its serial number."""
    device = get_device_by_serial(current_app, serial)
    if device is None:
        return _error("设备不存在", 404)
    return jsonify({"data": _device_payload(device)})
