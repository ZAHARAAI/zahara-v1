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

## 🚀 Quick Start

### Prerequisites
- Docker and Docker Compose
- 8GB+ RAM available
- Ports 3000, 5432, 6333, 6379, 7000, 8000 available

### Start All Services

```bash
# 1. Initialize and start core services
make -C infra init && make -C infra up

# 2. Check service status
make -C infra ps

# 3. Run health checks
make -C infra test
```

### Service Access Points

- **API Dashboard**: http://localhost:8000/static/index.html
- **API Documentation**: http://localhost:8000/docs
- **Router Service**: http://localhost:7000
- **Flowise (Optional)**: http://localhost:3000

### Quick API Testing

```bash
# Basic health check
curl http://localhost:8000/health/

# Comprehensive health check
curl http://localhost:8000/health/all

# Router health check
curl http://localhost:7000/health

# Version information
curl http://localhost:8000/version/

# Test chat completions (returns 501 if no API keys)
curl -X POST http://localhost:7000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-3.5-turbo","messages":[{"role":"user","content":"Hello"}]}'

# List available models
curl http://localhost:7000/v1/models
```

### Authentication Flow

```bash
# 1. Register a user
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "email": "admin@zahara.ai",
    "password": "secure_password_123"
  }'

# 2. Login to get JWT token
TOKEN=$(curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=secure_password_123" \
  | jq -r .access_token)

# 3. Create an API key
curl -X POST http://localhost:8000/api-keys/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Key",
    "description": "API key for testing",
    "can_read": true,
    "can_write": true
  }'
```

### Optional: Enable Flowise Flow Builder

```bash
# Start with Flowise included
make -C infra up-flowise

# Access Flowise at http://localhost:3000
# Username: admin, Password: flowise_admin_123
```

## 🏗️ Architecture

### Core Services (Default Stack)
- **API Service**: FastAPI application (port 8000) - Complete REST API with authentication
- **Router Service**: LLM routing proxy (port 7000) - Multi-provider LLM routing  
- **PostgreSQL**: Primary database (port 5432) - User data, API keys, configurations
- **Redis**: Cache and rate limiting (port 6379) - Session storage and rate limiting
- **Qdrant**: Vector database (port 6333) - Embeddings and similarity search

### Optional Services
- **Flowise**: Visual flow builder (port 3000) - `--profile flow-builder`
- **Ollama**: Local LLM service (port 11434) - `--profile ollama` (dev only)

### System Diagram

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   API Service   │    │   PostgreSQL    │    │     Redis       │
│   Port: 8000    │◄──►│   Port: 5432    │    │   Port: 6379    │
│   (FastAPI)     │    │  (Primary DB)   │    │ (Cache/Limits)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                                              │
         ▼                                              ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│     Qdrant      │    │  Router Service │    │    Flowise      │
│   Port: 6333    │    │   Port: 7000    │    │   Port: 3000    │
│  Vector Store   │    │   LLM Router    │    │  (Optional)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 🔌 API Endpoints

#### Core System
- `GET /` - Welcome page with system information
- `GET /health/` - Basic health check
- `GET /health/all` - Comprehensive health check for all services
- `GET /version/` - Version information with git SHA and timestamp

#### Authentication & API Keys
- `POST /auth/register` - User registration
- `POST /auth/login` - User login (returns JWT)
- `GET /auth/me` - Current user information
- `POST /api-keys/` - Create API key (requires JWT auth)
- `GET /api-keys/` - List API keys

#### LLM Router (Multi-Provider)
- `POST /v1/chat/completions` - OpenAI-compatible chat completions
- `GET /v1/models` - List available models by provider
- Supports: OpenAI, Anthropic, OpenRouter
- Returns 501 when no provider API keys configured

#### AI Agents
- `GET /agents/configured` - List pre-configured agents from YAML
- `GET /agents/list` - List all agents (configured + custom)
- `POST /agents/create` - Create custom agent
- `POST /agents/{id}/chat` - Chat with specific agent
- `GET /agents/capabilities/{capability}` - Get agents by capability

#### Vector Operations
- `GET /vector/collections` - List vector collections
- `POST /vector/collections` - Create new collection
- `POST /vector/embed` - Add vectors to collection
- `POST /vector/search` - Search similar vectors
- `GET /vector/sanity` - Comprehensive vector database health check

## Development

### Environment Setup

```bash
# Copy environment template
cp infra/.env.example .env.local

# Edit environment variables as needed
# Note: Leave OPENAI_API_KEY and OPENROUTER_API_KEY empty for local-only mode
```

### 🛠️ Available Commands

```bash
# Core Infrastructure
make -C infra help         # Show all available commands
make -C infra init         # Pull Docker images
make -C infra build        # Build all Docker images
make -C infra up           # Start core services
make -C infra up-flowise   # Start all services including Flowise
make -C infra down         # Stop all services
make -C infra logs         # Show logs from all services
make -C infra ps           # Show service status
make -C infra test         # Run health checks
make -C infra clean        # Stop and remove containers with volumes

# Flowise Management
make -C infra flowise-up   # Start only Flowise service
make -C infra flowise-down # Stop Flowise service
make -C infra flowise-logs # Show Flowise logs

# Development
pytest tests/ -v           # Run comprehensive test suite
ruff check .              # Run linting
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

$ curl localhost:7000/health
{"status":"healthy","service":"router"}

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

## 📋 Sprint Deliverables - COMPLETED ✅

All Sprint Acceptance Criteria have been successfully implemented:

- ✅ **A. Monorepo Setup**: PR-only workflow, CI/CD pipeline, templates, CODEOWNERS
- ✅ **B. Brand Hooks**: Zahara.ai branding, environment variables, Docker labels
- ✅ **C. Docker Compose Stack**: Complete orchestration with health checks
- ✅ **D. Router Enhancement**: LiteLLM proxy with multi-provider support
- ✅ **E. API Features**: Alembic migrations, API key auth, rate limiting, /version
- ✅ **F. Agents & Vector**: YAML configuration, Qdrant integration, sanity checks
- ✅ **G. Tests & CI**: Comprehensive pytest suite, green CI pipeline
- ✅ **H. Flowise Integration**: Pinned version 1.8.2, optional service
- ✅ **I. Handoff Documentation**: Complete guides and API examples

## 📄 Documentation

- **[Complete Handoff Guide](docs/HANDOFF.md)** - Comprehensive project documentation
- **[Flowise Integration](docs/FLOWISE_INTEGRATION.md)** - Flow builder setup and usage
- **[API Documentation](http://localhost:8000/docs)** - Interactive Swagger docs
- **[ReDoc API Docs](http://localhost:8000/redoc)** - Alternative documentation

## 🎯 Success Criteria Met

- ✅ `make -C infra init && make -C infra up` → all services healthy
- ✅ Router forwards to provider when key present, returns 501 when missing
- ✅ API keys hashed + seeded (plaintext shown once), 401/429 enforced
- ✅ Rate-limit enforced via Redis (100 req/min default)
- ✅ Version endpoint returns SHA + timestamp
- ✅ Agents + vector sanity endpoints working
- ✅ Flowise service integrated (optional but documented)
- ✅ CI green, no regressions, production-ready

## 🚀 Platform Information

- **Development**: Windows 11, macOS, Linux
- **Runtime**: Docker containers (Linux)
- **Minimum Requirements**: 8GB RAM, 4 CPU cores
- **Supported Architectures**: amd64, arm64
