"""Blueprint that serves the web frontend."""

from __future__ import annotations

from flask import Blueprint, render_template

web_bp = Blueprint("web", __name__)


@web_bp.get("/")
def index():
    """Render the single-page frontend."""
    return render_template("index.html")
