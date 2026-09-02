"""SQLite database module for user, device and sensor data persistence.

This module encapsulates all database concerns: schema creation, migrations,
connection management and CRUD helpers for users, devices and readings.
"""

from __future__ import annotations

import secrets
import sqlite3
from datetime import datetime
from typing import Any

USERS_DDL = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
"""

DEVICES_DDL = """
CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    serial TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
"""

SENSOR_DATA_DDL = """
CREATE TABLE IF NOT EXISTS sensor_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    ph TEXT NOT NULL DEFAULT '',
    temperature TEXT NOT NULL DEFAULT '',
    flow TEXT NOT NULL DEFAULT '',
    turbidity TEXT NOT NULL DEFAULT '',
    conductivity TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
"""

SCHEMA = USERS_DDL + DEVICES_DDL + SENSOR_DATA_DDL

MEASUREMENT_FIELDS = ("ph", "temperature", "flow", "turbidity", "conductivity")

SERIAL_BYTES = 6


def get_db_path(app: Any) -> str:
    """Return the SQLite file path configured for the given app."""
    return app.config["DATABASE"]


def _connect(app: Any) -> sqlite3.Connection:
    db_path = get_db_path(app)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row)


def _now() -> str:
    """Return the current local system time as a SQLite timestamp."""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def generate_serial(byte_length: int = SERIAL_BYTES) -> str:
    """Generate a random serial number as a hex string of ``byte_length`` bytes.

    6 bytes produce 12 hex characters. Returned to a device, which then stores
    it and uses it to identify itself when reporting sensor data.
    """
    return secrets.token_hex(byte_length)


def _migrate_legacy_sensor_data(conn: sqlite3.Connection) -> None:
    """Convert a pre-device ``sensor_data`` table (keyed by ``deviceid`` TEXT).

    The old table stored an arbitrary ``deviceid`` string. This migration
    creates a ``devices`` row per distinct string, links each reading to it via
    ``device_id`` and rebuilds the table with the normalized schema.
    """
    has_table = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sensor_data'"
    ).fetchone()
    if not has_table:
        return

    columns = {row[1] for row in conn.execute("PRAGMA table_info(sensor_data)").fetchall()}
    if "deviceid" not in columns:
        return

    conn.execute(DEVICES_DDL)
    rows = conn.execute(
        """
        SELECT id, deviceid, ph, temperature, flow, turbidity, conductivity, created_at
        FROM sensor_data
        ORDER BY id
        """
    ).fetchall()

    device_ids: dict[str, int] = {}
    for row in rows:
        device_key = row["deviceid"]
        if device_key not in device_ids:
            cur = conn.execute(
                "INSERT INTO devices (user_id, serial, name, created_at) VALUES (?, ?, ?, ?)",
                (None, generate_serial(), device_key, row["created_at"] or _now()),
            )
            device_ids[device_key] = cur.lastrowid

    conn.execute("ALTER TABLE sensor_data RENAME TO sensor_data_legacy")
    conn.execute(SENSOR_DATA_DDL)
    for row in rows:
        conn.execute(
            """
            INSERT INTO sensor_data
                (id, device_id, ph, temperature, flow, turbidity, conductivity, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row["id"],
                device_ids[row["deviceid"]],
                row["ph"],
                row["temperature"],
                row["flow"],
                row["turbidity"],
                row["conductivity"],
                row["created_at"],
            ),
        )
    conn.execute("DROP TABLE sensor_data_legacy")


def _ensure_column(conn: sqlite3.Connection, table: str, columns_sql: str) -> None:
    """Add a column to ``table`` if it does not already exist."""
    existing = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
    col_name = columns_sql.split()[0]
    if col_name not in existing:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {columns_sql}")


def init_db(app: Any) -> None:
    """Run migrations and create any missing tables."""
    conn = sqlite3.connect(get_db_path(app))
    conn.row_factory = sqlite3.Row
    try:
        _migrate_legacy_sensor_data(conn)
        conn.executescript(SCHEMA)
        _ensure_column(conn, "users", "is_admin INTEGER NOT NULL DEFAULT 0")
        conn.commit()
    finally:
        conn.close()


def _clean_measurements(payload: dict[str, Any]) -> dict[str, str]:
    """Keep only measurement fields, mapping absent/None values to empty string."""
    return {field: payload.get(field) or "" for field in MEASUREMENT_FIELDS}


# --- Users -----------------------------------------------------------------


def create_user(app: Any, username: str, password_hash: str) -> dict[str, Any]:
    """Insert a new user, storing the password as a pre-hashed value.

    The caller is responsible for hashing the plaintext password; this module
    only persists the digest so no plaintext is ever stored.
    """
    created_at = _now()
    conn = _connect(app)
    try:
        cur = conn.execute(
            """
            INSERT INTO users (username, password_hash, created_at)
            VALUES (?, ?, ?)
            """,
            (username, password_hash, created_at),
        )
        conn.commit()
        user_id = cur.lastrowid
    finally:
        conn.close()
    return get_user_by_id(app, user_id) or {}


def get_user_by_username(app: Any, username: str) -> dict[str, Any] | None:
    """Return a user by username, or None if it does not exist."""
    conn = _connect(app)
    try:
        row = conn.execute(
            "SELECT id, username, password_hash, is_admin, created_at FROM users WHERE username = ?",
            (username,),
        ).fetchone()
    finally:
        conn.close()
    return _row_to_dict(row)


def get_user_by_id(app: Any, user_id: int) -> dict[str, Any] | None:
    """Return a user by id, or None if it does not exist."""
    conn = _connect(app)
    try:
        row = conn.execute(
            "SELECT id, username, password_hash, is_admin, created_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    finally:
        conn.close()
    return _row_to_dict(row)


def set_admin(app: Any, user_id: int, is_admin: bool) -> None:
    """Promote (or demote) a user to/from the admin role."""
    conn = _connect(app)
    try:
        conn.execute(
            "UPDATE users SET is_admin = ? WHERE id = ?",
            (1 if is_admin else 0, user_id),
        )
        conn.commit()
    finally:
        conn.close()


_ADMIN_USER_COLS = "id, username, is_admin, created_at"


def list_users(app: Any) -> list[dict[str, Any]]:
    """Return every user (without password hashes), newest first."""
    conn = _connect(app)
    try:
        rows = conn.execute(
            f"SELECT {_ADMIN_USER_COLS} FROM users ORDER BY id ASC"
        ).fetchall()
    finally:
        conn.close()
    return [_row_to_dict(row) for row in rows]


def update_user_password(app: Any, user_id: int, password_hash: str) -> bool:
    """Replace a user's password hash, returning True if the user exists."""
    conn = _connect(app)
    try:
        cur = conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (password_hash, user_id),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def delete_user(app: Any, user_id: int) -> bool:
    """Delete a user together with all of their devices and readings.

    SQLite does not enable foreign-key ``ON DELETE CASCADE`` by default, so the
    cascade is performed explicitly inside a single transaction: the readings of
    the user's devices are removed first, then the devices, then the user.
    """
    conn = _connect(app)
    try:
        device_ids = [
            row["id"]
            for row in conn.execute(
                "SELECT id FROM devices WHERE user_id = ?", (user_id,)
            ).fetchall()
        ]
        if device_ids:
            marks = ",".join("?" for _ in device_ids)
            conn.execute(
                f"DELETE FROM sensor_data WHERE device_id IN ({marks})", device_ids
            )
            conn.execute(f"DELETE FROM devices WHERE id IN ({marks})", device_ids)

        cur = conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


# --- Devices ---------------------------------------------------------------


def create_device(
    app: Any, user_id: int, serial: str | None = None, name: str = ""
) -> dict[str, Any]:
    """Create a device bound to a user, returning its record.

    A random serial is generated unless one is supplied. The serial is the
    identifier a device uses to report data, so it is unique and returned to
    the device for storage.
    """
    serial = serial or generate_serial()
    created_at = _now()
    conn = _connect(app)
    try:
        cur = conn.execute(
            "INSERT INTO devices (user_id, serial, name, created_at) VALUES (?, ?, ?, ?)",
            (user_id, serial, name, created_at),
        )
        conn.commit()
        device_id = cur.lastrowid
    finally:
        conn.close()
    return get_device_by_id(app, device_id) or {}


def get_device_by_id(app: Any, device_id: int) -> dict[str, Any] | None:
    """Return a device by id, or None if it does not exist."""
    conn = _connect(app)
    try:
        row = conn.execute(
            "SELECT id, user_id, serial, name, created_at FROM devices WHERE id = ?",
            (device_id,),
        ).fetchone()
    finally:
        conn.close()
    return _row_to_dict(row)


def get_device_by_serial(app: Any, serial: str) -> dict[str, Any] | None:
    """Return a device by its serial number, or None if unknown."""
    conn = _connect(app)
    try:
        row = conn.execute(
            "SELECT id, user_id, serial, name, created_at FROM devices WHERE serial = ?",
            (serial,),
        ).fetchone()
    finally:
        conn.close()
    return _row_to_dict(row)


def list_devices(app: Any, user_id: int | None = None) -> list[dict[str, Any]]:
    """Return devices, optionally filtered by the owning user."""
    conn = _connect(app)
    try:
        if user_id is None:
            rows = conn.execute(
                "SELECT id, user_id, serial, name, created_at FROM devices ORDER BY id DESC"
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id, user_id, serial, name, created_at FROM devices WHERE user_id = ? ORDER BY id DESC",
                (user_id,),
            ).fetchall()
    finally:
        conn.close()
    return [_row_to_dict(row) for row in rows]


def count_devices(app: Any, user_id: int | None = None) -> int:
    """Return the number of devices, optionally scoped to a user."""
    conn = _connect(app)
    try:
        if user_id is None:
            row = conn.execute("SELECT COUNT(*) AS c FROM devices").fetchone()
        else:
            row = conn.execute(
                "SELECT COUNT(*) AS c FROM devices WHERE user_id = ?", (user_id,)
            ).fetchone()
        return int(row["c"])
    finally:
        conn.close()


# --- Sensor readings -------------------------------------------------------


def _device_join() -> str:
    return (
        "SELECT sd.id, sd.device_id, d.serial, d.name AS device_name, "
        f"sd.ph, sd.temperature, sd.flow, sd.turbidity, sd.conductivity, sd.created_at "
        "FROM sensor_data sd JOIN devices d ON d.id = sd.device_id "
    )


def create_record(app: Any, device_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    """Insert a sensor reading for a device and append a system timestamp."""
    data = _clean_measurements(payload)
    created_at = _now()
    conn = _connect(app)
    try:
        cur = conn.execute(
            """
            INSERT INTO sensor_data (device_id, ph, temperature, flow, turbidity, conductivity, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                device_id,
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


def list_records(
    app: Any,
    limit: int = 200,
    offset: int = 0,
    user_id: int | None = None,
    device_id: int | None = None,
) -> list[dict[str, Any]]:
    """Return a page of records ordered newest first.

    When ``user_id`` is given only readings belonging to that user's devices
    are returned; ``device_id`` further narrows to a single device.
    """
    conn = _connect(app)
    try:
        rows = conn.execute(
            _device_join()
            + "WHERE (? IS NULL OR d.user_id = ?) AND (? IS NULL OR sd.device_id = ?) "
            "ORDER BY sd.id DESC LIMIT ? OFFSET ?",
            (user_id, user_id, device_id, device_id, limit, offset),
        ).fetchall()
    finally:
        conn.close()
    return [_row_to_dict(row) for row in rows]


def get_record(app: Any, record_id: int) -> dict[str, Any] | None:
    """Return a single reading (with its device serial), or None."""
    conn = _connect(app)
    try:
        row = conn.execute(_device_join() + "WHERE sd.id = ?", (record_id,)).fetchone()
    finally:
        conn.close()
    return _row_to_dict(row)


def update_record(app: Any, record_id: int, payload: dict[str, Any]) -> dict[str, Any] | None:
    """Update measurement fields of an existing reading, keeping its timestamp."""
    current = get_record(app, record_id)
    if current is None:
        return None

    data = dict(current)
    for field in MEASUREMENT_FIELDS:
        if field in payload:
            data[field] = payload[field]

    conn = _connect(app)
    try:
        conn.execute(
            """
            UPDATE sensor_data
            SET ph = ?, temperature = ?, flow = ?, turbidity = ?, conductivity = ?
            WHERE id = ?
            """,
            (
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
    """Delete a reading by id, returning True if a row was removed."""
    conn = _connect(app)
    try:
        cur = conn.execute("DELETE FROM sensor_data WHERE id = ?", (record_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def count_records(
    app: Any,
    user_id: int | None = None,
    device_id: int | None = None,
) -> int:
    """Return the number of readings, optionally scoped to a user or a device."""
    conn = _connect(app)
    try:
        if device_id is not None:
            row = conn.execute(
                "SELECT COUNT(*) AS c FROM sensor_data WHERE device_id = ?",
                (device_id,),
            ).fetchone()
        elif user_id is not None:
            row = conn.execute(
                "SELECT COUNT(*) AS c FROM sensor_data sd JOIN devices d ON d.id = sd.device_id WHERE d.user_id = ?",
                (user_id,),
            ).fetchone()
        else:
            row = conn.execute("SELECT COUNT(*) AS c FROM sensor_data").fetchone()
        return int(row["c"])
    finally:
        conn.close()
