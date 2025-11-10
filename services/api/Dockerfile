# ---------- Base: Python 3.12 slim with build tools ----------
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl ca-certificates libpq-dev tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---------- Builder ----------
FROM base AS builder
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt /app/requirements.txt
RUN pip install --upgrade pip setuptools wheel \
 && pip install -r /app/requirements.txt \
 && pip install "gunicorn>=21,<22"

# ---------- Runtime ----------
FROM base AS runtime
ENV PATH="/opt/venv/bin:$PATH" \
    PORT=8080 \
    WORKERS=1 \
    LOG_LEVEL=info

# Non-root user
RUN useradd -m appuser
USER appuser

COPY --from=builder /opt/venv /opt/venv
COPY . /app

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD \
  curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1

ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["sh","-c","gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w ${WORKERS} -b 0.0.0.0:${PORT} --timeout 120 --keep-alive 75 --log-level ${LOG_LEVEL}"]
