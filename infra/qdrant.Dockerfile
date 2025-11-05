# infra/qdrant.Dockerfile
FROM qdrant/qdrant:latest
USER root
RUN apt-get update && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*
# Qdrant image defaults will still run the server
