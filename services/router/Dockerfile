FROM python:3.11-slim

# Docker labels for branding
LABEL org.opencontainers.image.title="Zahara.ai Router Service"
LABEL org.opencontainers.image.description="Zahara.ai - Intelligent LLM Router and Load Balancer"
LABEL org.opencontainers.image.vendor="Zahara.ai"
LABEL org.opencontainers.image.url="https://zahara.ai"
LABEL org.opencontainers.image.source="https://github.com/zahara-ai/zahara-v1"
LABEL org.opencontainers.image.licenses="MIT"
LABEL zahara.ai.service="router"
LABEL zahara.ai.component="llm-routing"

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 7000

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7000"]

