FROM python:3.11-slim

# Docker labels for branding
LABEL org.opencontainers.image.title="Zahara.ai API Service"
LABEL org.opencontainers.image.description="Zahara.ai - Intelligent AI Platform API Service"
LABEL org.opencontainers.image.vendor="Zahara.ai"
LABEL org.opencontainers.image.url="https://zahara.ai"
LABEL org.opencontainers.image.source="https://github.com/zahara-ai/zahara-v1"
LABEL org.opencontainers.image.licenses="MIT"
LABEL zahara.ai.service="api"
LABEL zahara.ai.component="backend"

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

# Set work directory
WORKDIR /app

# Install system dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copy project
COPY . .

# Create non-root user
RUN adduser --disabled-password --gecos '' appuser \
    && chown -R appuser:appuser /app
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health/ || exit 1

# Expose port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]