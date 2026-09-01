"""Application factory for the water monitor server."""

from __future__ import annotations

import os
from pathlib import Path

from flask import Flask

from db import init_db
from routes.auth import auth_bp
from routes.devices import devices_bp
from routes.sensors import sensors_bp
from routes.web import web_bp

BASE_DIR = Path(__file__).resolve().parent


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

    app.register_blueprint(auth_bp)
    app.register_blueprint(devices_bp)
    app.register_blueprint(sensors_bp)
    app.register_blueprint(web_bp)

    return app
