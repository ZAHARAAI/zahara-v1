FROM python:3.11-slim

LABEL org.opencontainers.image.title="Zahara.ai Router Service"
LABEL org.opencontainers.image.description="Zahara.ai - Intelligent LLM Router and Load Balancer"
LABEL org.opencontainers.image.vendor="Zahara.ai"
LABEL org.opencontainers.image.url="https://zahara.ai"
LABEL org.opencontainers.image.source="https://github.com/zahara-ai/zahara-v1"
LABEL org.opencontainers.image.licenses="MIT"
LABEL zahara.ai.service="router"
LABEL zahara.ai.component="llm-routing"

WORKDIR /app

# OS deps (curl optional but nice to have)
RUN apt-get update && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

# Install Python deps
COPY services/router/requirements.txt ./requirements.txt
RUN pip install --upgrade pip && pip install --no-cache-dir -r requirements.txt

# Copy router code
COPY services/router/app ./app

# Non-root
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 7000

# Optional healthcheck (if your router exposes /health on 7000)
# HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
#   CMD curl -fsS http://localhost:7000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7000"]
