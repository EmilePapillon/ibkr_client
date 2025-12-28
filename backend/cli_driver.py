"""
Simple CLI driver to exercise the local Flask backend.
Run backend first: `python app.py`
Then in another terminal:
  python cli_driver.py login --user alice --password secret
  python cli_driver.py portfolio --token <token>
"""

from __future__ import annotations

import json

import click
import requests

API_DEFAULT = "http://127.0.0.1:5000/api"


@click.group()
@click.option(
    "--api-base",
    default=API_DEFAULT,
    show_default=True,
    help="Base URL for the backend API (no trailing slash).",
)
@click.pass_context
def cli(ctx: click.Context, api_base: str):
    """CLI driver for the IBKR Flask backend."""
    ctx.ensure_object(dict)
    ctx.obj["API_BASE"] = api_base.rstrip("/")


@cli.command()
@click.option("--user", required=True, prompt=True, help="Username for backend login.")
@click.option(
    "--password",
    required=True,
    prompt=True,
    hide_input=True,
    confirmation_prompt=False,
    help="Password for backend login.",
)
@click.pass_context
def login(ctx: click.Context, user: str, password: str):
    """Login and retrieve a token."""
    api_base = ctx.obj["API_BASE"]
    resp = requests.post(f"{api_base}/login", json={"username": user, "password": password})
    if resp.status_code != 200:
        click.echo(f"Login failed ({resp.status_code}): {resp.text}", err=True)
        raise SystemExit(1)
    token = resp.json().get("token")
    click.echo(token)


@cli.command()
@click.option("--token", required=True, help="Token returned by the login command.")
@click.pass_context
def portfolio(ctx: click.Context, token: str):
    """Fetch portfolio data with a token."""
    api_base = ctx.obj["API_BASE"]
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(f"{api_base}/portfolio", headers=headers)
    if resp.status_code != 200:
        click.echo(f"Request failed ({resp.status_code}): {resp.text}", err=True)
        raise SystemExit(1)
    click.echo(json.dumps(resp.json(), indent=2))


if __name__ == "__main__":
    cli()
