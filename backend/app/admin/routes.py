"""Tiny admin dashboard rendered server-side.

Lives at /, /admin/login, /admin. Password-gated by ADMIN_PASSWORD env var.
Shows the backend version, DB connectivity, per-table row counts, current
WS subscriber counts, and recent activity — useful for confirming
deploys from a phone without curl.

This is deliberately not a SPA — it's plain HTML so the HF Space root
shows something useful for anyone who visits the backend URL directly.
"""

from __future__ import annotations

import hashlib
import os
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Cookie, Form, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import func, select

from app.config import get_settings
from app.db import session_scope
from app.models.alert import Alert
from app.models.contact import Contact
from app.models.game import GameSession
from app.models.geofence import GeofenceSettings, GeofenceZone
from app.models.memory import Memory
from app.models.pairing import InviteCode, Pairing
from app.models.profile import Profile
from app.models.pursuit import PursuitResult
from app.models.reminder import Reminder
from app.models.screening import ScreeningResult
from app.models.session import Session
from app.models.user import User
from app.ws_hub import hub

router = APIRouter(tags=["admin"], include_in_schema=False)

ADMIN_COOKIE = "cogni_admin"
DEFAULT_PASSWORD = "change-me-via-ADMIN_PASSWORD-env"


def _expected_password() -> str:
    return os.environ.get("ADMIN_PASSWORD", DEFAULT_PASSWORD)


def _admin_cookie_value() -> str:
    """The cookie value clients store. We just hash the password — if
    ADMIN_PASSWORD rotates, every existing admin session is invalidated."""
    return hashlib.sha256(_expected_password().encode("utf-8")).hexdigest()


def _is_admin(cookie: str | None) -> bool:
    return bool(cookie) and cookie == _admin_cookie_value()


def _page(title: str, body: str) -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<title>{title} · Cogni</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {{
    --bg-0: #050816;
    --bg-1: #0b1024;
    --bg-2: #131a36;
    --card: rgba(255,255,255,0.04);
    --card-border: rgba(255,255,255,0.08);
    --text: #e2e8f0;
    --muted: #94a3b8;
    --dim: #64748b;
    --accent: #22d3ee;
    --accent-2: #6366f1;
    --ok: #34d399;
    --bad: #f87171;
    --warn: #fbbf24;
  }}
  * {{ box-sizing: border-box; }}
  html, body {{ margin: 0; padding: 0; }}
  body {{
    font-family: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto;
    color: var(--text);
    background: var(--bg-0);
    background-image:
      radial-gradient(1100px 700px at 12% -10%, rgba(99,102,241,0.20), transparent 60%),
      radial-gradient(900px 600px at 88% 0%, rgba(34,211,238,0.18), transparent 60%),
      radial-gradient(700px 500px at 50% 110%, rgba(99,102,241,0.10), transparent 60%);
    min-height: 100vh;
    letter-spacing: -0.005em;
    -webkit-font-smoothing: antialiased;
  }}
  code, pre, .mono {{ font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace; }}
  a {{ color: var(--accent); text-decoration: none; transition: color .15s; }}
  a:hover {{ color: #67e8f9; }}

  .shell {{ max-width: 980px; margin: 0 auto; padding: 56px 20px 96px; }}
  .brandline {{
    display: inline-flex; align-items: center; gap: 8px;
    font-size: 11px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--accent); margin-bottom: 14px;
  }}
  .brandline .dot {{ width: 8px; height: 8px; border-radius: 999px; background: var(--accent); box-shadow: 0 0 12px var(--accent); }}
  h1.title {{ font-size: clamp(28px, 4.5vw, 40px); font-weight: 800; margin: 0 0 8px; letter-spacing: -0.025em; line-height: 1.1; }}
  h1.title .grad {{ background: linear-gradient(135deg, #22d3ee 0%, #6366f1 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }}
  .lede-sub {{ color: var(--muted); margin: 0 0 28px; font-size: 14px; line-height: 1.55; max-width: 680px; }}
  h2 {{
    font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--muted); margin: 0 0 14px; font-weight: 700;
  }}

  header.lede {{ display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom: 28px; flex-wrap: wrap; }}

  .card {{
    background: var(--card);
    border: 1px solid var(--card-border);
    border-radius: 18px;
    padding: 22px 24px;
    margin-bottom: 14px;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    box-shadow: 0 1px 0 rgba(255,255,255,0.04) inset, 0 24px 48px -24px rgba(0,0,0,0.5);
  }}

  table {{ width: 100%; border-collapse: collapse; font-size: 13.5px; }}
  th, td {{ padding: 10px 0; text-align: left; border-bottom: 1px solid var(--card-border); }}
  th {{ color: var(--muted); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }}
  tbody tr:last-child td {{ border-bottom: 0; }}
  td code {{ color: #cbd5e1; font-size: 12.5px; }}

  .pill {{
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 11px; border-radius: 999px;
    font-size: 11.5px; font-weight: 600;
    border: 1px solid var(--card-border); background: var(--card);
    color: var(--text);
  }}
  .pill .dot {{ width: 7px; height: 7px; border-radius: 999px; }}
  .pill.ok    {{ background: rgba(52,211,153,0.10); border-color: rgba(52,211,153,0.30); color: #6ee7b7; }}
  .pill.ok .dot {{ background: var(--ok); box-shadow: 0 0 8px var(--ok); }}
  .pill.bad   {{ background: rgba(248,113,113,0.10); border-color: rgba(248,113,113,0.30); color: #fca5a5; }}
  .pill.bad .dot {{ background: var(--bad); }}
  .pill.warn  {{ background: rgba(251,191,36,0.10); border-color: rgba(251,191,36,0.30); color: #fcd34d; }}
  .pill.neutral {{ color: var(--text); }}
  .pillrow {{ display:flex; flex-wrap:wrap; gap:8px; margin: 4px 0 0; }}

  input[type="password"], input[type="text"], button {{
    font: inherit;
    padding: 11px 14px;
    border-radius: 12px;
    border: 1px solid var(--card-border);
    background: rgba(255,255,255,0.04);
    color: var(--text);
    outline: none;
    transition: border-color .15s, background .15s;
  }}
  input::placeholder {{ color: var(--dim); }}
  input:focus {{ border-color: rgba(34,211,238,0.6); background: rgba(255,255,255,0.06); }}

  button {{ cursor: pointer; }}
  button.primary {{
    background: linear-gradient(135deg, #22d3ee 0%, #6366f1 100%);
    border: 0;
    color: #06121f;
    font-weight: 700;
    box-shadow: 0 8px 20px -8px rgba(34,211,238,0.4);
    transition: transform .12s, box-shadow .15s;
  }}
  button.primary:hover {{ transform: translateY(-1px); box-shadow: 0 14px 28px -10px rgba(34,211,238,0.55); }}
  button.primary:active {{ transform: translateY(0); }}
  button.ghost {{ background: transparent; color: var(--muted); border-color: var(--card-border); }}
  button.ghost:hover {{ color: var(--text); border-color: rgba(255,255,255,0.18); }}

  form.login {{ display:flex; gap:10px; align-items:stretch; }}
  form.login input {{ flex: 1; min-width: 0; }}

  .grid {{ display:grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }}
  .grid .metric {{
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--card-border);
    border-radius: 14px;
    padding: 14px 14px 12px;
    transition: border-color .15s, background .15s;
  }}
  .grid .metric:hover {{ border-color: rgba(34,211,238,0.3); background: rgba(34,211,238,0.04); }}
  .grid .metric .label {{
    font-size: 10.5px; letter-spacing: 0.10em; text-transform: uppercase; color: var(--muted);
    font-weight: 600;
  }}
  .grid .metric .value {{
    font-size: 26px; font-weight: 700; color: var(--text);
    font-family: "JetBrains Mono", monospace; line-height: 1.1; margin-top: 6px;
    letter-spacing: -0.02em;
  }}

  ul.bare {{ list-style:none; padding:0; margin:0; display:grid; gap: 6px; }}
  ul.bare li {{ font-size: 14px; }}
  ul.bare li::before {{
    content: "→"; color: var(--accent); margin-right: 10px; font-weight: 700;
  }}

  pre {{ background: rgba(0,0,0,0.35); border: 1px solid var(--card-border); border-radius: 10px; padding: 10px 12px; overflow: auto; font-size: 12.5px; color: #fecaca; }}

  .empty-row {{ color: var(--dim); padding: 18px 0 !important; text-align: center !important; font-style: italic; }}

  @media (prefers-color-scheme: light) {{
    :root {{ --text: #0f172a; --muted: #475569; --dim: #94a3b8; }}
    body {{
      background: #f8fafc;
      background-image:
        radial-gradient(1100px 700px at 12% -10%, rgba(99,102,241,0.10), transparent 60%),
        radial-gradient(900px 600px at 88% 0%, rgba(34,211,238,0.10), transparent 60%);
    }}
    .card {{ background: rgba(255,255,255,0.85); border-color: rgba(15,23,42,0.08); box-shadow: 0 24px 48px -28px rgba(15,23,42,0.18); }}
    .grid .metric {{ background: rgba(15,23,42,0.02); border-color: rgba(15,23,42,0.06); }}
    .pill {{ background: rgba(15,23,42,0.03); border-color: rgba(15,23,42,0.06); }}
    input[type="password"], input[type="text"] {{ background: #fff; border-color: rgba(15,23,42,0.10); }}
    pre {{ background: #fef2f2; color:#991b1b; border-color: #fecaca; }}
  }}
</style>
</head>
<body>
<div class="shell">
{body}
</div>
</body>
</html>"""


@router.get("/", response_class=HTMLResponse)
async def root(
    cogni_admin: str | None = Cookie(default=None, alias=ADMIN_COOKIE),
) -> HTMLResponse:
    if _is_admin(cogni_admin):
        return RedirectResponse("/admin", status_code=303)
    return HTMLResponse(_login_page())


def _login_page(error: str | None = None) -> str:
    err_html = (
        f'<div class="pill bad" style="margin-top:14px"><span class="dot"></span>{error}</div>'
        if error
        else ""
    )
    return _page(
        "Backend status",
        f"""
<div class="brandline"><span class="dot"></span>FastAPI · HF Space</div>
<h1 class="title"><span class="grad">Cogni backend</span></h1>
<p class="lede-sub">
  This URL is the FastAPI service that powers the Cogni Alzheimer's monitoring app.
  The patient and caregiver UI lives at
  <a href="https://cogni-steel.vercel.app">cogni-steel.vercel.app</a> —
  start there if you're not an operator.
</p>

<div class="card">
  <h2>Operator sign-in</h2>
  <p style="color:var(--muted); margin: 0 0 14px; font-size: 13.5px;">
    Enter the admin password to see DB status, table counts, and recent activity.
  </p>
  <form class="login" method="post" action="/admin/login">
    <input type="password" name="password" placeholder="Admin password" required autofocus />
    <button type="submit" class="primary">Open dashboard →</button>
  </form>
  {err_html}
</div>

<div class="card">
  <h2>Public endpoints</h2>
  <ul class="bare">
    <li><a href="/health"><code>GET /health</code></a> — process liveness probe</li>
    <li><a href="/api/v1/version"><code>GET /api/v1/version</code></a> — version info</li>
    <li><a href="/docs"><code>GET /docs</code></a> — OpenAPI / Swagger UI</li>
  </ul>
</div>
""",
    )


@router.post("/admin/login")
async def admin_login(response: Response, password: str = Form(...)) -> Response:
    if password != _expected_password():
        return HTMLResponse(_login_page("Incorrect password."), status_code=401)
    response = RedirectResponse("/admin", status_code=303)
    response.set_cookie(
        ADMIN_COOKIE,
        _admin_cookie_value(),
        max_age=60 * 60 * 8,  # 8h
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
    )
    return response


@router.post("/admin/logout")
async def admin_logout() -> Response:
    response = RedirectResponse("/", status_code=303)
    response.delete_cookie(ADMIN_COOKIE, path="/", secure=True, httponly=True, samesite="lax")
    return response


async def _gather_dashboard_state() -> dict[str, Any]:
    settings = get_settings()
    state: dict[str, Any] = {
        "version": settings.git_sha or "(unset)",
        "environment": settings.environment,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "ws_topics": sum(len(s) for s in hub._subs.values()),
        "ws_topic_count": len(hub._subs),
    }
    counts: dict[str, int] = {}
    try:
        async with session_scope() as db:
            for name, model in (
                ("users", User),
                ("sessions", Session),
                ("pairings", Pairing),
                ("invite_codes", InviteCode),
                ("profiles", Profile),
                ("contacts", Contact),
                ("reminders", Reminder),
                ("memories", Memory),
                ("game_sessions", GameSession),
                ("pursuit_results", PursuitResult),
                ("alerts", Alert),
                ("geofence_zones", GeofenceZone),
                ("geofence_settings", GeofenceSettings),
                ("screening_results", ScreeningResult),
            ):
                res = await db.execute(select(func.count()).select_from(model))
                counts[name] = int(res.scalar() or 0)
            res = await db.execute(
                select(ScreeningResult)
                .order_by(ScreeningResult.created_at.desc())
                .limit(5)
            )
            recent_screening = [
                {
                    "model": r.model.value,
                    "band": r.band.value,
                    "probability": round(r.probability, 3),
                    "created_at": r.created_at.isoformat(),
                }
                for r in res.scalars().all()
            ]
            res = await db.execute(
                select(User).order_by(User.created_at.desc()).limit(5)
            )
            recent_users = [
                {
                    "username": u.username,
                    "role": u.role.value,
                    "created_at": u.created_at.isoformat(),
                }
                for u in res.scalars().all()
            ]
        state["db_ok"] = True
    except Exception as exc:  # pragma: no cover — defensive
        state["db_ok"] = False
        state["db_error"] = repr(exc)
        recent_screening = []
        recent_users = []
    state["counts"] = counts
    state["recent_screening"] = recent_screening
    state["recent_users"] = recent_users
    return state


def _metric_grid(counts: dict[str, int]) -> str:
    cells = "".join(
        f'<div class="metric"><div class="label">{name}</div><div class="value">{value}</div></div>'
        for name, value in counts.items()
    )
    return f'<div class="grid">{cells}</div>'


@router.get("/admin", response_class=HTMLResponse)
async def admin_dashboard(
    cogni_admin: str | None = Cookie(default=None, alias=ADMIN_COOKIE),
) -> HTMLResponse:
    if not _is_admin(cogni_admin):
        return RedirectResponse("/", status_code=303)  # type: ignore[return-value]

    state = await _gather_dashboard_state()
    db_pill = (
        '<div class="pill ok"><span class="dot"></span>DB connected</div>'
        if state["db_ok"]
        else f'<div class="pill bad"><span class="dot"></span>DB error</div><pre>{state.get("db_error", "")}</pre>'
    )

    rows_recent_screening = "".join(
        f'<tr><td><code>{r["model"]}</code></td><td><span class="pill {("warn" if r["band"]=="moderate" else ("bad" if r["band"]=="high" else "ok"))}"><span class="dot"></span>{r["band"]}</span></td>'
        f'<td class="mono">{r["probability"]:.2f}</td><td><code>{r["created_at"]}</code></td></tr>'
        for r in state["recent_screening"]
    ) or '<tr><td colspan="4" class="empty-row">No screening runs yet.</td></tr>'

    rows_recent_users = "".join(
        f'<tr><td><code>{u["username"]}</code></td><td>{u["role"]}</td>'
        f'<td><code>{u["created_at"]}</code></td></tr>'
        for u in state["recent_users"]
    ) or '<tr><td colspan="3" class="empty-row">No users yet.</td></tr>'

    body = f"""
<div class="brandline"><span class="dot"></span>Operator dashboard</div>
<header class="lede">
  <div>
    <h1 class="title"><span class="grad">Cogni backend</span></h1>
    <p class="lede-sub">Read-only telemetry — schema counts, recent activity, WebSocket subscribers. Use this to confirm a deploy from a phone without spelunking through curl.</p>
  </div>
  <form method="post" action="/admin/logout"><button class="ghost" type="submit">Sign out</button></form>
</header>

<div class="card">
  <h2>Process</h2>
  <div class="pillrow">
    {db_pill}
    <div class="pill neutral">Env · <code>{state['environment']}</code></div>
    <div class="pill neutral">Build · <code>{state['version']}</code></div>
    <div class="pill neutral">WS · {state['ws_topics']} subscribers / {state['ws_topic_count']} topics</div>
  </div>
  <p style="color:var(--muted); font-size: 12px; margin: 14px 0 0;">Checked at <code>{state['checked_at']}</code></p>
</div>

<div class="card">
  <h2>Schema · row counts</h2>
  {_metric_grid(state['counts'])}
</div>

<div class="card">
  <h2>Recent screening runs</h2>
  <table>
    <thead><tr><th>Model</th><th>Band</th><th>Probability</th><th>At</th></tr></thead>
    <tbody>{rows_recent_screening}</tbody>
  </table>
</div>

<div class="card">
  <h2>Recent users</h2>
  <table>
    <thead><tr><th>Username</th><th>Role</th><th>Created</th></tr></thead>
    <tbody>{rows_recent_users}</tbody>
  </table>
</div>

<div class="card">
  <h2>Jump to</h2>
  <ul class="bare">
    <li><a href="/docs">/docs</a> — OpenAPI / Swagger UI</li>
    <li><a href="/health">/health</a> — process liveness probe</li>
    <li><a href="/api/v1/version">/api/v1/version</a> — JSON version info</li>
    <li><a href="https://cogni-steel.vercel.app">cogni-steel.vercel.app</a> — patient / caregiver app</li>
  </ul>
</div>
"""
    return HTMLResponse(_page("Admin dashboard", body))
