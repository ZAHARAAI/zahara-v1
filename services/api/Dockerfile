# ---- Builder ---------------------------------------------------------------
FROM python:3.11-slim AS builder
WORKDIR /app

# Build deps for wheels
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl \
 && rm -rf /var/lib/apt/lists/*

# Keep cache stable
COPY requirements.txt .
RUN pip install --upgrade pip \
 && pip wheel --no-cache-dir --no-deps -r requirements.txt -w /wheels

# ---- Runtime ---------------------------------------------------------------
FROM python:3.11-slim
LABEL org.opencontainers.image.title="Zahara.ai API Service"

# tini for clean signal handling + curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    tini curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps from built wheels
COPY --from=builder /wheels /wheels
COPY --from=builder /app/requirements.txt .
RUN pip install --no-index --find-links=/wheels -r requirements.txt \
 && rm -rf /wheels

# Copy application code (context is services/api)
COPY app ./app

# Non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -fsS http://localhost:8000/health || exit 1

EXPOSE 8000
ENV PORT=8000

ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["sh","-c","uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
