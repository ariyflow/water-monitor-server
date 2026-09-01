"""RESTful API Blueprint for sensor data (CRUD)."""

from __future__ import annotations

from flask import Blueprint, current_app, jsonify, request

from auth import api_login_required, current_user
from db import (
    count_records,
    create_record,
    delete_record,
    get_device_by_serial,
    get_record,
    list_records,
    update_record,
)

sensors_bp = Blueprint("sensors", __name__)


def _error(message: str, status: int = 400):
    return jsonify({"error": message}), status


@sensors_bp.get("/api/sensors")
@api_login_required
def list_sensors():
    """List readings for the current user's devices, newest first."""
    user = current_user(current_app)
    user_id = user["id"] if user else None

    limit = max(0, min(int(request.args.get("limit", 200)), 1000))
    offset = max(0, int(request.args.get("offset", 0)))

    records = list_records(current_app, limit=limit, offset=offset, user_id=user_id)
    total = count_records(current_app, user_id=user_id)
    return jsonify(
        {
            "total": total,
            "limit": limit,
            "offset": offset,
            "data": records,
        }
    )


@sensors_bp.get("/api/sensors/<int:record_id>")
@api_login_required
def get_sensor(record_id: int):
    """Return a single sensor reading."""
    record = get_record(current_app, record_id)
    if record is None:
        return _error("Record not found", 404)
    return jsonify({"data": record})


@sensors_bp.post("/api/sensors")
def create_sensor():
    """Receive sensor data reported by a device, identified by its serial.

    This endpoint is device-driven (no user session): the device submits its
    serial plus the measurements, and the reading is stored under that device.
    """
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return _error("Request body must be a JSON object")

    serial = (payload.get("serial") or payload.get("deviceid") or "").strip()
    if not serial:
        return _error("Field 'serial' is required")

    device = get_device_by_serial(current_app, serial)
    if device is None:
        return _error("设备不存在或序列号无效", 404)

    record = create_record(current_app, device["id"], payload)
    return jsonify({"data": record}), 201


@sensors_bp.put("/api/sensors/<int:record_id>")
@api_login_required
def update_sensor(record_id: int):
    """Update an existing sensor reading (partial update allowed)."""
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return _error("Request body must be a JSON object")

    record = update_record(current_app, record_id, payload)
    if record is None:
        return _error("Record not found", 404)
    return jsonify({"data": record})


@sensors_bp.delete("/api/sensors/<int:record_id>")
@api_login_required
def delete_sensor(record_id: int):
    """Delete a sensor reading."""
    if not delete_record(current_app, record_id):
        return _error("Record not found", 404)
    return jsonify({"message": "Record deleted"})
