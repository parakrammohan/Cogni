# Backend

FastAPI service in `backend/`, deployed as a Docker image to the Hugging Face Space `cogni-team/cogni`. Hostname `cogni-team-cogni.hf.space`, listens on port 7860.

## Process model

| Step | When | What |
|---|---|---|
| `alembic upgrade head` | Container start, before uvicorn | Brings the DB schema to the latest revision. Idempotent. Runs in a fresh interpreter so it can use `asyncio.run()` without conflicting with FastAPI's lifespan event loop. |
| uvicorn boot | After migrations | Starts the FastAPI app on `0.0.0.0:7860`. |
| Lifespan startup | First request prep | Logging config + idempotent demo-account seeding. |
| Request handling | Per request | Open async DB session → run route → commit / rollback / close. |

The container CMD that wires this up:
```sh
sh -c "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 7860"
```

## Folder layout

```
backend/
├── Dockerfile                    Python 3.12-slim, non-root uid 1000
├── requirements.txt              Pinned versions
├── README.md                     HF Space metadata + endpoints summary
├── alembic.ini                   Alembic config (sqlalchemy.url is set in env.py)
├── alembic/
│   ├── env.py                    Async-friendly migration runner
│   ├── script.py.mako            Migration template
│   └── versions/
│       └── 0001_users.py         Initial users-table migration
└── app/
    ├── main.py                   FastAPI app + middleware + lifespan
    ├── config.py                 pydantic-settings + DB URL normalization
    ├── db.py                     Async engine, SessionLocal, Base
    ├── security.py               Argon2id password hashing + PyJWT
    ├── deps.py                   get_db, get_current_user (FastAPI dependencies)
    ├── seed.py                   Idempotent demo-account seed
    ├── lib/
    │   └── errors.py             Typed exceptions + central handler
    ├── models/                   SQLAlchemy ORM
    │   └── user.py
    ├── schemas/                  Pydantic request/response models
    │   └── auth.py
    ├── crud/                     Repository pattern (async)
    │   └── user.py
    └── api/
        ├── router.py             /api/v1 aggregator
        └── v1/
            ├── auth.py           POST /signup, /login, GET /me
            └── health.py         GET /version, GET /health/db
```

## Dependencies

| Library | Why |
|---|---|
| **FastAPI** | ASGI framework, the standard for typed Python APIs in 2026. |
| **uvicorn[standard]** | ASGI server. `[standard]` adds httptools + uvloop for throughput. |
| **SQLAlchemy 2.0 (async)** | Mature ORM with native async support. |
| **asyncpg** | Fastest async Postgres driver in Python (3–5× psycopg2 throughput). Used under SQLAlchemy. |
| **Alembic** | SQL migrations versioned in `alembic/versions/`. Auto-generates from ORM diff. |
| **pydantic v2 + pydantic-settings** | Request/response validation + env-var config. |
| **argon2-cffi** | OWASP-recommended password hash. Memory-hard, GPU-resistant. See `auth.md`. |

We deliberately do **not** use a JWT library. Sessions are opaque random tokens stored in Postgres and transported via cookies; there's no signed token to verify and no `JWT_SECRET` to manage. See `auth.md`.

## Configuration

All config is read from environment variables via pydantic-settings. The Space has these set in HF → Settings → Variables and Secrets:

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Aiven Postgres URL. Auto-rewritten in `config.py` for asyncpg compat (`postgresql://` → `postgresql+asyncpg://`, `sslmode=require` → `ssl=require`). |
| `SESSION_TTL_SECONDS` | no | Session lifetime. Default 604800 (7 days). |
| `SESSION_COOKIE_NAME` | no | Cookie name. Default `cogni_session`. |
| `SESSION_COOKIE_SAMESITE` | no | `none` for cross-origin (Vercel ↔ HF). Defaults `none`. |
| `SESSION_COOKIE_SECURE` | no | `true` in prod. Defaults `true`. |
| `FERNET_KEY` | optional | Base64-encoded 32-byte key for PII column encryption (planned upgrade — see `security.md`). |
| `CORS_ALLOWED_ORIGINS` | no | Comma-separated. Defaults include `cogni-steel.vercel.app` + `localhost:5173`. |
| `SEED_DEMO_USERS` | no | `false` to disable demo-account seeding. Defaults `true`. |
| `DEMO_PASSWORD` | no | Override the seeded password. Default `demo-pass-1234`. |
| `LOG_LEVEL` | no | `info` / `debug`. Default `info`. |
| `ENVIRONMENT` | no | `production` / `staging`. Cosmetic. |

`GITHUB_SHA` is reported by `/api/v1/version` if injected at build time, but isn't required.

## Deploy pipeline

`.github/workflows/deploy-backend.yml`:

1. Trigger: push to `main` touching `backend/**` or the workflow file.
2. `actions/checkout@v4` + `actions/setup-python@v5` (3.12).
3. `pip install huggingface_hub`.
4. `HfApi.upload_folder("backend", "cogni-team/cogni", repo_type="space")` using the GitHub secret `HF_TOKEN` (fine-grained, scoped to the single Space).
5. Poll `https://cogni-team-cogni.hf.space/health` for up to 5 minutes; fail loudly if the new build never goes green.

Cold rebuilds on HF take ~2 minutes; warm rebuilds use the Docker layer cache and finish in ~30 seconds.

## Endpoints

Current endpoint surface:

| Group | Endpoints |
|---|---|
| Health | `GET /health`, `GET /api/v1/health/db`, `GET /api/v1/version` |
| Auth | `POST /api/v1/auth/{signup,login,logout,logout-everywhere}`, `GET /api/v1/auth/me` |
| Pairing | `GET /api/v1/pairing/status`, `POST /api/v1/pairing/{invite,redeem}`, `DELETE /api/v1/pairing` |
| Profile | `GET/PUT /api/v1/patients/{id}/profile` |
| Contacts | `GET/POST /api/v1/patients/{id}/contacts`, `PATCH/DELETE /api/v1/contacts/{id}` |
| Reminders | `GET/POST /api/v1/patients/{id}/reminders`, `PATCH/POST(toggle)/DELETE /api/v1/reminders/{id}` |
| Memories | `GET/POST /api/v1/patients/{id}/memories`, `PATCH/DELETE /api/v1/memories/{id}` |
| Telemetry | `GET/POST /api/v1/patients/{id}/{game-sessions,pursuit-results}` |
| Alerts | `GET/POST /api/v1/patients/{id}/alerts`, `POST /api/v1/alerts/{id}/dismiss`, `DELETE /api/v1/alerts/{id}` |
| Geofence | `GET/POST /api/v1/patients/{id}/geofence-zones`, `PATCH/DELETE /api/v1/geofence-zones/{id}`, `GET/PUT /api/v1/patients/{id}/geofence-settings` |
| Screening | `POST /api/v1/patients/{id}/screening/{model}`, `GET /api/v1/patients/{id}/screening` |
| Live stream | `WS /api/v1/ws` |
| Admin (server-rendered) | `GET /`, `GET /admin`, `POST /admin/{login,logout}`, `GET /admin/logs.json` |

OpenAPI/Swagger is mounted at `/docs`.

## Performance notes

- Engine: `pool_size=5, max_overflow=10, pool_pre_ping=True`. Plenty for a single-Space deploy.
- asyncpg avoids the per-row decode overhead psycopg2 has, especially for JSON columns.
- Argon2id default cost is ~64 MiB memory × 3 iterations per hash call. At ~100 ms each, this rate-limits credential stuffing without making login feel slow.
- Lazy-imported nothing yet — at MVP scale FastAPI's startup is dominated by the SQLAlchemy first-connect handshake, which always happens regardless.
