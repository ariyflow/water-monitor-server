"""RESTful API Blueprint for sensor data (CRUD)."""

from __future__ import annotations

from flask import Blueprint, current_app, jsonify, request

from db import (
    count_records,
    create_record,
    delete_record,
    get_record,
    list_records,
    update_record,
)

sensors_bp = Blueprint("sensors", __name__)


def _error(message: str, status: int = 400):
    return jsonify({"error": message}), status


@sensors_bp.get("/api/sensors")
def list_sensors():
    """List sensor readings, newest first, with pagination support."""
    limit = max(0, min(int(request.args.get("limit", 200)), 1000))
    offset = max(0, int(request.args.get("offset", 0)))

    records = list_records(current_app, limit=limit, offset=offset)
    total = count_records(current_app)
    return jsonify(
        {
            "total": total,
            "limit": limit,
            "offset": offset,
            "data": records,
        }
    )


@sensors_bp.get("/api/sensors/<int:record_id>")
def get_sensor(record_id: int):
    """Return a single sensor reading."""
    record = get_record(current_app, record_id)
    if record is None:
        return _error("Record not found", 404)
    return jsonify({"data": record})


@sensors_bp.post("/api/sensors")
def create_sensor():
    """Receive sensor data from a device and store it with a system timestamp."""
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return _error("Request body must be a JSON object")

    if not payload.get("deviceid"):
        return _error("Field 'deviceid' is required")

    record = create_record(current_app, payload)
    return jsonify({"data": record}), 201


@sensors_bp.put("/api/sensors/<int:record_id>")
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
def delete_sensor(record_id: int):
    """Delete a sensor reading."""
    if not delete_record(current_app, record_id):
        return _error("Record not found", 404)
    return jsonify({"message": "Record deleted"})
