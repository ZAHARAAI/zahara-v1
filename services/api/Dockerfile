# ---- Runtime (single-stage, simple & reliable) -----------------------------
FROM python:3.11-slim

# Basic hardening / defaults
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

# System deps:
# - curl: healthcheck
# - tini: signal handling
# - build-essential + gcc + git: build any sdists / git requirements
# - libpq5: runtime for psycopg/psycopg2 (remove if you don't use Postgres)
RUN apt-get update && apt-get install -y --no-install-recommends \
    tini curl build-essential gcc git libpq5 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first to leverage layer cache
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# Copy application code
COPY app ./app

# Non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Healthcheck (Compose uses this; Fly has its own HTTP check)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -fsS http://localhost:${PORT}/health || exit 1

EXPOSE 8000

ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["sh","-c","uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
