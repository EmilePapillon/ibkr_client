"""
Minimal Flask backend to proxy to IBKR gateway (placeholder).
For now it mocks login and portfolio data; swap out the stubbed functions
with real Client Portal calls when you wire the gateway.
"""

from __future__ import annotations

import os
import secrets
from typing import Dict, Optional

from flask import Flask, jsonify, make_response, request
from flask_cors import CORS

app = Flask(__name__)
origin_env = os.getenv("FRONTEND_ORIGINS", "")
ORIGINS = [o.strip() for o in origin_env.split(",") if o.strip()] or ["http://localhost:8000", "http://127.0.0.1:8000"]
CORS(
    app,
    resources={r"/api/*": {"origins": ORIGINS}},
    supports_credentials=True,
)

# In-memory session store for local use only.
SESSIONS: Dict[str, str] = {}
SESSION_COOKIE = "ibkr_session"


def mock_login(username: str, password: str) -> bool:
    """Replace with real IBKR auth flow; here we accept any non-empty creds."""
    return bool(username and password)


def mock_fetch_portfolio(_: str):
    """Replace with an IBKR Client Portal call."""
    return {
        "positions": [
            {"symbol": "AAPL", "quantity": 120, "price": 187.42, "pnl": 141.6},
            {"symbol": "MSFT", "quantity": 80, "price": 422.15, "pnl": -51.2},
            {"symbol": "DMSO", "quantity": 800, "price": 1000.00, "pnl": 1000},
        ],
        "cash": 18250,
    }


def validate_token(token: Optional[str]) -> bool:
    return token in SESSIONS


@app.post("/api/login")
def login():
    data = request.get_json(silent=True) or {}
    username = data.get("username", "")
    password = data.get("password", "")

    if not mock_login(username, password):
        return jsonify({"error": "invalid credentials"}), 401

    token = secrets.token_hex(16)
    SESSIONS[token] = username

    resp = make_response(jsonify({"ok": True, "token": token}))
    # For localhost HTTPS is typically absent; set secure=False here. Flip to True when on HTTPS.
    resp.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        samesite="Lax",
        secure=False,
        max_age=60 * 60 * 4,  # 4 hours
    )
    return resp


@app.get("/api/portfolio")
def portfolio():
    token = request.cookies.get(SESSION_COOKIE) or request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if not validate_token(token):
        return jsonify({"error": "unauthorized"}), 401

    data = mock_fetch_portfolio(token)
    return jsonify(data)


def create_app():
    return app


if __name__ == "__main__":
    # Bind to localhost only; adjust port if you run alongside other services.
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", "5000")), debug=True)
