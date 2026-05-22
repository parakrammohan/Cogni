FROM python:3.12-slim

# System libraries we need at runtime. libgomp1 is the GNU OpenMP
# runtime — LightGBM links against it via ctypes
# (`libgomp.so.1: cannot open shared object file` if missing), and
# joblib.load() of any LightGBM artifact triggers the import. Without
# this the tabular screening endpoints 500 the moment they're hit.
# Done before the non-root switch so apt-get works.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

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
