"""SQLite database module for sensor data persistence.

This module encapsulates all database concern: schema creation, connection
management and CRUD helpers for sensor readings.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime
from typing import Any

SCHEMA = """
CREATE TABLE IF NOT EXISTS sensor_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deviceid TEXT NOT NULL,
    ph TEXT NOT NULL DEFAULT '',
    temperature TEXT NOT NULL DEFAULT '',
    flow TEXT NOT NULL DEFAULT '',
    turbidity TEXT NOT NULL DEFAULT '',
    conductivity TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
"""

ALLOWED_FIELDS = ("deviceid", "ph", "temperature", "flow", "turbidity", "conductivity")


def get_db_path(app: Any) -> str:
    """Return the SQLite file path configured for the given app."""
    return app.config["DATABASE"]


def init_db(app: Any) -> None:
    """Create the database table if it does not exist yet."""
    conn = sqlite3.connect(get_db_path(app))
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def _connect(app: Any) -> sqlite3.Connection:
    db_path = get_db_path(app)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row)


def _clean_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Keep only known sensor fields, mapping absent/None values to empty string."""
    return {field: payload.get(field) or "" for field in ALLOWED_FIELDS}


def _now() -> str:
    """Return the current local system time as the sensor's timestamp."""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def create_record(app: Any, payload: dict[str, Any]) -> dict[str, Any]:
    """Insert a sensor reading and append a system timestamp."""
    data = _clean_payload(payload)
    created_at = _now()
    conn = _connect(app)
    try:
        cur = conn.execute(
            """
            INSERT INTO sensor_data
                (deviceid, ph, temperature, flow, turbidity, conductivity, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data["deviceid"],
                data["ph"],
                data["temperature"],
                data["flow"],
                data["turbidity"],
                data["conductivity"],
                created_at,
            ),
        )
        conn.commit()
        record_id = cur.lastrowid
    finally:
        conn.close()
    return get_record(app, record_id) or {}


def list_records(app: Any, limit: int = 200, offset: int = 0) -> list[dict[str, Any]]:
    """Return a page of records ordered by newest first."""
    conn = _connect(app)
    try:
        rows = conn.execute(
            """
            SELECT id, deviceid, ph, temperature, flow, turbidity,
                   conductivity, created_at
            FROM sensor_data
            ORDER BY id DESC
            LIMIT ? OFFSET ?
            """,
            (limit, offset),
        ).fetchall()
    finally:
        conn.close()
    return [_row_to_dict(row) for row in rows]


def get_record(app: Any, record_id: int) -> dict[str, Any] | None:
    """Return a single record by id, or None if it does not exist."""
    conn = _connect(app)
    try:
        row = conn.execute(
            """
            SELECT id, deviceid, ph, temperature, flow, turbidity,
                   conductivity, created_at
            FROM sensor_data
            WHERE id = ?
            """,
            (record_id,),
        ).fetchone()
    finally:
        conn.close()
    return _row_to_dict(row)


def update_record(app: Any, record_id: int, payload: dict[str, Any]) -> dict[str, Any] | None:
    """Update fields of an existing record, keeping its original timestamp."""
    current = get_record(app, record_id)
    if current is None:
        return None

    data = dict(current)
    for field in ALLOWED_FIELDS:
        if field in payload:
            data[field] = payload[field]

    conn = _connect(app)
    try:
        conn.execute(
            """
            UPDATE sensor_data
            SET deviceid = ?, ph = ?, temperature = ?, flow = ?,
                turbidity = ?, conductivity = ?
            WHERE id = ?
            """,
            (
                data["deviceid"],
                data["ph"],
                data["temperature"],
                data["flow"],
                data["turbidity"],
                data["conductivity"],
                record_id,
            ),
        )
        conn.commit()
    finally:
        conn.close()
    return get_record(app, record_id)


def delete_record(app: Any, record_id: int) -> bool:
    """Delete a record by id, returning True if a row was removed."""
    conn = _connect(app)
    try:
        cur = conn.execute("DELETE FROM sensor_data WHERE id = ?", (record_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def count_records(app: Any) -> int:
    """Return the total number of records in the database."""
    conn = _connect(app)
    try:
        row = conn.execute("SELECT COUNT(*) AS c FROM sensor_data").fetchone()
        return int(row["c"])
    finally:
        conn.close()
