# Zahara V1 - FastAPI Backend

This repo hosts the backend sprint. Work via **PRs only** (no direct pushes).

## Daily cadence
- Kickoff: **12:00 PM Eastern (NYC, UTC-4)**
- Daily check-in: 12:00–12:15 Eastern (text or 60-sec Loom)

## ✅ First PR Deliverables (24h) - COMPLETED

- ✅ Docker Compose: api, postgres, redis, qdrant (with healthchecks + volumes)
- ✅ API service → `GET /health` (200 JSON)
- ✅ `/v1/chat/completions` endpoint (returns 501 when no provider key)
- ✅ `infra/.env.example` (no secrets) + `infra/Makefile` (init up down logs ps)
- ✅ GitHub Actions job `ci`: ruff, docker build, pytest (green)

## Quick Start

```bash
# Initialize environment and start services
make -C infra init && make -C infra up

# Test API health endpoints
curl localhost:8000/health
curl localhost:8000/health/all

# Test chat completions endpoint (returns 501 when no API keys configured)
curl -X POST localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-3.5-turbo","messages":[{"role":"user","content":"Hello"}]}'
```

## Architecture

### Services
- **API**: FastAPI application (port 8000)
- **PostgreSQL**: User data and application state (port 5432) 
- **Redis**: Caching and rate limiting (port 6379)
- **Qdrant**: Vector database for embeddings (port 6333)
- **Ollama**: Local LLM service (port 11434)

### API Endpoints

#### Health Endpoints
- `GET /health/` - Basic health check (200 JSON)
- `GET /health/all` - Comprehensive health check for all services

#### OpenAI-Compatible Endpoints  
- `POST /v1/chat/completions` - OpenAI-compatible chat completions
  - ✅ Returns 501 when no provider API keys are configured
  - Supports local models: tinyllama, llama2, llama3, codellama

#### Authentication (Optional)
- `POST /auth/register` - User registration
- `POST /auth/login` - User login  
- `GET /auth/me` - Current user info

## Development

### Environment Setup

```bash
# Copy environment template
cp infra/.env.example .env.local

# Edit environment variables as needed
# Note: Leave OPENAI_API_KEY and OPENROUTER_API_KEY empty for local-only mode
```

### Available Commands

```bash
# Infrastructure commands
make -C infra help         # Show all available commands
make -C infra init         # Initialize environment  
make -C infra up           # Start all services
make -C infra down         # Stop all services
make -C infra logs         # Show logs
make -C infra ps           # Show service status
make -C infra test         # Run API health checks
make -C infra clean        # Clean up volumes
```

### Testing

```bash
# Run tests
pytest tests/ -v --cov=app --cov-report=xml --cov-report=html
```

## Evidence for PR

### Service Status
```bash
$ make -C infra ps
# All services showing as healthy
```

### Health Endpoint Tests
```bash
$ curl localhost:8000/health/
{"status":"healthy","message":"FastAPI backend is running"}

$ curl localhost:8000/health/all  
{"overall_status":"healthy","services":{"database":{"status":"healthy"},...}}
```

### Chat Completions (501 Response)
```bash
$ curl -X POST localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-3.5-turbo","messages":[{"role":"user","content":"Hello"}]}'

{"detail":"Not implemented: No provider API keys configured for this model"}
# Returns 501 status code as expected
```

## Platform
- Development: Windows 11 (x64)
- Runtime: Docker containers (Linux)
