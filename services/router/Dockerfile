# ---------- Base ----------
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /router

# ---------- Builder ----------
FROM base AS builder
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt /router/requirements.txt
RUN pip install --upgrade pip setuptools wheel \
 && pip install -r /router/requirements.txt \
 && pip install "gunicorn>=21,<22"

# ---------- Runtime ----------
FROM base AS runtime
ENV PATH="/opt/venv/bin:$PATH" \
    PORT=8080 \
    WORKERS=1 \
    LOG_LEVEL=info

RUN useradd -m appuser
USER appuser

COPY --from=builder /opt/venv /opt/venv
COPY . /router

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD \
  curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1

# If your router’s FastAPI entry is router/main.py with app=FastAPI(...)
CMD gunicorn router.main:app \
    -k uvicorn.workers.UvicornWorker \
    -w ${WORKERS} \
    -b 0.0.0.0:${PORT} \
    --timeout 120 \
    --keep-alive 75 \
    --log-level ${LOG_LEVEL}
