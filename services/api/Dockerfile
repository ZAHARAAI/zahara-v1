# --- Builder -----------------------------------------------------------------
FROM python:3.11-slim AS builder
WORKDIR /app

# Build deps (only if needed for wheels); curl also helps debugging
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl \
 && rm -rf /var/lib/apt/lists/*

# Copy and build Python wheels first for better caching
COPY services/api/requirements.txt ./requirements.txt
RUN pip install --upgrade pip && pip wheel --no-cache-dir --no-deps -r requirements.txt -w /wheels

# --- Runtime -----------------------------------------------------------------
FROM python:3.11-slim
LABEL org.opencontainers.image.title="Zahara.ai API Service"
LABEL org.opencontainers.image.description="Zahara.ai - Intelligent AI Platform API Service"
LABEL org.opencontainers.image.vendor="Zahara.ai"
LABEL org.opencontainers.image.url="https://zahara.ai"
LABEL org.opencontainers.image.source="https://github.com/zahara-ai/zahara-v1"
LABEL org.opencontainers.image.licenses="MIT"
LABEL zahara.ai.service="api"
LABEL zahara.ai.component="backend"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    WEB_CONCURRENCY=2

WORKDIR /app

# Minimal runtime OS deps for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

# Install app deps from prebuilt wheels
COPY --from=builder /wheels /wheels
RUN pip install --no-cache-dir /wheels/*

# Copy application code
COPY services/api/app ./app

# Non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Health check (now curl exists)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -fsS http://localhost:8000/health || exit 1

EXPOSE 8000

# Production server (Gunicorn + Uvicorn workers)
# CMD ["gunicorn", "-k", "uvicorn.workers.UvicornWorker", "app.main:app", \
#      "--bind", "0.0.0.0:8000", "--access-logfile", "-", "--error-logfile", "-"]

CMD ["uvicorn","app.main:app","--host","0.0.0.0","--port","8000"]
