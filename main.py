"""Entry point for the water monitor server."""

from __future__ import annotations

from app import create_app

HOST = "0.0.0.0"
PORT = 15382


def main() -> None:
    app = create_app()
    app.run(host=HOST, port=PORT, debug=True)

if __name__ == "__main__":
    main()
