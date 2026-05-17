# Database

Single managed Postgres on Aiven. SQLAlchemy 2.0 async + asyncpg driver. Schema is versioned with Alembic and runs `alembic upgrade head` on every container start (before uvicorn boots).

## Connection

`DATABASE_URL` is read from the HF Space environment. `backend/app/config.py` normalizes it for asyncpg:

- `postgres://` → `postgresql://` (asyncpg-recognized scheme)
- `postgresql://...` → `postgresql+asyncpg://...` (forces SQLAlchemy to pick the async dialect)
- `sslmode=require` → `ssl=require` (asyncpg uses the keyword `ssl`, not libpq's `sslmode`)

So a raw Aiven URL like
```
postgres://avnadmin:PW@cogni-pg.aivencloud.com:12345/defaultdb?sslmode=require
```
becomes
```
postgresql+asyncpg://avnadmin:PW@cogni-pg.aivencloud.com:12345/defaultdb?ssl=require
```
without any operator intervention.

Engine config:
```python
create_async_engine(
    settings.database_url_async,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    future=True,
)
```

- `pool_pre_ping=True` survives idle-connection drops on Aiven (which closes idle conns after a few minutes).
- `expire_on_commit=False` on the sessionmaker so ORM objects remain usable after commit (FastAPI returns them via Pydantic).

## Schema

Stage 1 — single table.

```
users
  id            uuid pk                         (uuid4 generated app-side)
  username      varchar(64) unique, indexed     (lowercased)
  password_hash varchar(255)                    (Argon2id encoded)
  role          enum user_role                  ('caregiver' | 'patient')
  display_name  varchar(120)
  created_at    timestamptz default now()
  updated_at    timestamptz default now() on update
```

Plan for subsequent stages (see `CLAUDE.md` §4 for full SQL):

- Stage 2 adds `pairings`, `invite_codes`.
- Stage 3 adds `profiles`, `contacts`, `reminders`, `memories`, `game_sessions`, `pursuit_results`, `alerts`, `geofence_zones`, `geofence_settings`.
- Stage 5 adds `screening_results` plus an `audit_log`.

Naming conventions:
- Table names plural (`users`, `contacts`).
- Foreign keys named `<table>_id` (`patient_id`, `caregiver_id`).
- Timestamps always `timestamptz` (UTC).
- PII goes in `BYTEA` columns suffixed `_enc` (Stage 3+).

## Migrations (Alembic)

Located in `backend/alembic/`, async-friendly env.

Create a new revision after editing models:
```bash
cd backend
alembic revision --autogenerate -m "add reminders table"
```
Review the generated file under `alembic/versions/`, then commit.

To run migrations against a local DB:
```bash
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/cogni_dev
alembic upgrade head
```

In production, every container start runs `alembic upgrade head` first (see `Dockerfile`). Migrations are idempotent — if the schema is already at head, it's a no-op.

## Seed

`backend/app/seed.py` is called on app startup (FastAPI lifespan). It creates two demo accounts if they don't already exist:

| Username | Role | Password |
|---|---|---|
| `demo-caregiver` | caregiver | `demo-pass-1234` (overridable via `DEMO_PASSWORD`) |
| `demo-patient` | patient | `demo-pass-1234` |

Disable seeding with `SEED_DEMO_USERS=false`. The seed runs inside a single transaction so a partial failure leaves the DB clean.

## Sessions in route handlers

```python
from app.deps import DbDep

@router.get("/foo")
async def foo(db: DbDep):
    res = await db.execute(select(Thing).where(...))
    return res.scalars().all()
```

`DbDep = Annotated[AsyncSession, Depends(get_db)]`. The dependency:

1. Opens a session.
2. Yields it.
3. Commits if no exception, rolls back if any.
4. Closes the session.

Outside request handlers (e.g. seed scripts, background jobs), use `app.db.session_scope()` — same semantics, but an async context manager.

## Performance and capacity

- Aiven free tier: ~1 GiB of storage + low concurrent connections. Plenty for an MVP with seeded test users + a small live cohort.
- asyncpg connection pool overhead is minimal (each connection ≈ 8 KB on the client).
- ORM queries use `select(...)` 2.0-style syntax; lazy loading is disabled by default for async (you must explicitly `selectinload`/`joinedload` relationships).
- The largest table at full Stage 3 scale (memories) stores base64 data URLs. If we approach the free-tier limit, photos move to S3 / R2 — out of scope for this rollout.

## What we don't do (and why)

- **No raw SQL strings** in route code. Everything goes through SQLAlchemy 2.0 typed constructs so refactors flag at compile time.
- **No connection pool per request**. One engine + pool per process, sized for the HF single-replica deploy.
- **No multi-tenant DB** (one DB serves every user). Authz is enforced at the query level: every patient-scoped row carries `patient_id`, and a reusable `require_patient_access` dependency rejects requests that aren't from that patient or their paired caregiver.
- **No read replicas / sharding**. Out of scope; one process, one DB.
