FROM python:3.12-slim

# HF Spaces convention: run as non-root uid 1000.
RUN useradd -m -u 1000 user
USER user
ENV PATH="/home/user/.local/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

COPY --chown=user . .

EXPOSE 7860
# Migrations run first (in a fresh interpreter, no asyncio loop yet),
# then uvicorn starts and serves. This avoids the "asyncio.run() inside
# a running loop" footgun you'd hit running alembic in FastAPI's lifespan.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 7860"]
