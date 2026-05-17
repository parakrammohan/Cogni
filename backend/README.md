---
title: Cogni Backend
emoji: 🧠
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# Cogni backend

FastAPI backend for the Cogni Alzheimer's monitoring app. Mirrored to
this Hugging Face Space from
[github.com/parakrammohan/Cogni](https://github.com/parakrammohan/Cogni)
by a GitHub Action on every push to `backend/**`.

The architecture, data model, and stage plan live in `CLAUDE.md` at the
repo root. Edits made directly in this Space will be overwritten by
the next deploy — change the source on GitHub.

## Endpoints (stage 0)

- `GET /health` — liveness probe.
- `GET /api/v1/version` — build SHA / deploy time.
