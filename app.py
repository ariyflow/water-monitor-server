"""Application factory for the water monitor server."""

from __future__ import annotations

import os
from pathlib import Path

from flask import Flask

from auth import hash_password
from db import ensure_user, init_db
from routes.admin import admin_bp
from routes.alarms import alarms_bp
from routes.auth import auth_bp
from routes.devices import devices_bp
from routes.sensors import sensors_bp
from routes.settings import settings_bp
from routes.web import web_bp

BASE_DIR = Path(__file__).resolve().parent

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin54321"


def ensure_admin_user(app: Flask) -> None:
    """Create the admin account if missing and assert its admin role.

    Idempotent and concurrency-safe: it uses ``INSERT OR IGNORE`` so multiple
    workers booting at once do not clash on the ``username`` unique constraint.
    """
    with app.app_context():
        ensure_user(app, ADMIN_USERNAME, hash_password(ADMIN_PASSWORD), is_admin=True)


def create_app(test_config: dict | None = None) -> Flask:
    """Create and configure the Flask application."""
    app = Flask(
        __name__,
        template_folder=str(BASE_DIR / "templates"),
        static_folder=str(BASE_DIR / "static"),
    )

    app.config.from_mapping(
        DATABASE=os.environ.get("DATABASE", str(BASE_DIR / "water_monitor.db")),
        SECRET_KEY=os.environ.get("SECRET_KEY", "dev-secret-change-me"),
        JSON_SORT_KEYS=False,
    )

    if test_config:
        app.config.update(test_config)

    init_db(app)
    ensure_admin_user(app)

    app.register_blueprint(auth_bp)
    app.register_blueprint(devices_bp)
    app.register_blueprint(sensors_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(web_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(alarms_bp)

    return app
