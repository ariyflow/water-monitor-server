"""Blueprint that serves the web frontend."""

from __future__ import annotations

from flask import Blueprint, current_app, render_template

from auth import current_user, login_required

web_bp = Blueprint("web", __name__)


@web_bp.get("/")
@login_required
def index():
    """Render the single-page frontend for logged-in users."""
    return render_template("index.html", user=current_user(current_app))
