# Zahara.ai Platform - Project Handoff Documentation

## Overview

This document provides a comprehensive handoff for the Zahara.ai platform, covering all implemented features, architecture decisions, and operational procedures.

## Project Summary

**Project**: Zahara.ai Intelligent AI Platform  
**Version**: v1.0.0  
**Completion Date**: January 2025  
**Repository**: https://github.com/zahara-ai/zahara-v1  

### Sprint Deliverables Completed ✅

- **A. Monorepo Setup**: PR-only workflow, CI pipeline, templates, CODEOWNERS, LICENSE
- **B. Brand Hooks**: Environment variables, health branding, Docker labels, image prefixes
- **C. Docker Compose Stack**: API, router, PostgreSQL, Redis, Qdrant, optional Flowise
- **D. Router Enhancement**: LiteLLM proxy with provider key handling
- **E. API Features**: Alembic migrations, API key auth, Redis rate-limiting, /version endpoint
- **F. Agents & Vector**: YAML parsing, Qdrant default collection, vector sanity endpoint
- **G. Tests & CI**: Comprehensive pytest coverage, green CI pipeline
- **H. Flowise Integration**: Pinned to v1.8.2, Docker service, documentation
- **I. Handoff Documentation**: Complete documentation and handoff materials

## Architecture Overview

### Core Services

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   API Service   │    │   PostgreSQL    │    │     Redis       │
│   Port: 8000    │◄──►│   Port: 5432    │    │   Port: 6379    │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                                              │
         ▼                                              ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│     Qdrant      │    │  Router Service │    │    Flowise      │
│   Port: 6333    │    │   Port: 7000    │    │   Port: 3000    │
│  Vector Store   │    │   LLM Router    │    │  (Optional)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Technology Stack

- **Backend**: FastAPI 0.104.1, Python 3.11
- **Database**: PostgreSQL 15 with Alembic migrations
- **Cache**: Redis 7 for rate limiting and session storage
- **Vector DB**: Qdrant for embeddings and similarity search
- **LLM Routing**: Custom router with provider key management
- **Flow Builder**: Flowise 1.8.2 (optional)
- **Containerization**: Docker with Docker Compose orchestration

## Quick Start Guide

### Prerequisites

- Docker and Docker Compose
- Git
- 8GB+ RAM (for all services)
- Ports 3000, 5432, 6333, 6379, 7000, 8000 available

### Installation

```bash
# 1. Clone repository
git clone https://github.com/zahara-ai/zahara-v1.git
cd zahara-v1

# 2. Configure environment
cp infra/.env.example .env.local
# Edit .env.local with your API keys and configuration

# 3. Start all services
make -C infra init && make -C infra up

# 4. Verify services are healthy
make -C infra ps
make -C infra test
```

### Service Access

- **API Dashboard**: http://localhost:8000/static/index.html
- **API Documentation**: http://localhost:8000/docs
- **Router Service**: http://localhost:7000
- **Flowise (Optional)**: http://localhost:3000

## API Documentation

### Core Endpoints

#### Health & Status
```bash
# Basic health check
curl http://localhost:8000/health/

# Comprehensive health check
curl http://localhost:8000/health/all

# Version information
curl http://localhost:8000/version/

# Vector sanity check
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:8000/vector/sanity
```

#### Authentication
```bash
# Register user
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "email": "admin@zahara.ai",
    "password": "secure_password_123"
  }'

# Login
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=secure_password_123"
```

#### API Key Management
```bash
# Create API key
curl -X POST http://localhost:8000/api-keys/ \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Key",
    "description": "API key for production use",
    "can_read": true,
    "can_write": true
  }'

# List API keys
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" http://localhost:8000/api-keys/
```

#### LLM Router
```bash
# Chat completion (returns 501 if no provider key)
curl -X POST http://localhost:7000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'

# List available models
curl http://localhost:7000/v1/models
```

#### Agents & Vector Operations
```bash
# List configured agents
curl http://localhost:8000/agents/configured

# Get agents by capability
curl http://localhost:8000/agents/capabilities/general_assistance

# Vector operations
curl -X POST http://localhost:8000/vector/collections \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "test_collection", "vector_size": 1536}'
```

## Operational Procedures

### Service Management

```bash
# Start all services
make -C infra up

# Start with Flowise
make -C infra up-flowise

# Stop all services
make -C infra down

# View logs
make -C infra logs

# Check service status
make -C infra ps

# Clean restart (removes volumes)
make -C infra clean && make -C infra up
```

### Monitoring & Health Checks

```bash
# Run health checks
make -C infra test

# Monitor specific service
docker logs zahara-api --tail=100 -f
docker logs zahara-router --tail=100 -f
docker logs zahara-postgres --tail=100 -f
```

### Database Operations

```bash
# Access PostgreSQL
docker exec -it zahara-postgres psql -U postgres -d postgres

# Run migrations (from api directory)
cd services/api
alembic upgrade head

# Create new migration
alembic revision --autogenerate -m "Description"
```

## Configuration Management

### Environment Variables

Key configuration options in `.env.local`:

```bash
# Branding
APP_NAME=Zahara.ai API
COMPANY_NAME=Zahara.ai
COMPANY_URL=https://zahara.ai

# Security
SECRET_KEY=your_secure_secret_key_here
DEBUG=false  # Set to false in production

# Database
DATABASE_URL=postgresql://user:pass@postgres:5432/db

# API Keys
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
OPENROUTER_API_KEY=your_openrouter_key

# Rate Limiting
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=60

# Flowise
FLOWISE_USERNAME=admin
FLOWISE_PASSWORD=secure_password_123
```

### Production Deployment

#### Security Checklist
- [ ] Change all default passwords
- [ ] Set strong `SECRET_KEY`
- [ ] Configure proper CORS origins
- [ ] Enable HTTPS/TLS
- [ ] Set up proper logging
- [ ] Configure backup strategy
- [ ] Set resource limits
- [ ] Enable monitoring

#### Docker Images
- **API**: `zahara-ai/api:latest`
- **Router**: `zahara-ai/router:latest`
- **Flowise**: `flowiseai/flowise:1.8.2` (pinned)

## Development Workflow

### Code Structure

```
zahara-v1/
├── services/
│   ├── api/           # FastAPI application
│   │   ├── app/
│   │   │   ├── config.py
│   │   │   ├── models/
│   │   │   ├── routers/
│   │   │   ├── services/
│   │   │   └── middleware/
│   │   └── alembic/   # Database migrations
│   └── router/        # LLM routing service
├── infra/             # Infrastructure as code
├── tests/             # Comprehensive test suite
└── docs/              # Documentation
```

### Testing

```bash
# Run all tests
pytest tests/ -v

# Run with coverage
pytest tests/ -v --cov=app --cov-report=html

# Run specific test file
pytest tests/test_api_health.py -v
```

### CI/CD Pipeline

The GitHub Actions pipeline (`ci.yml`) runs on every PR:
1. Linting with ruff
2. Docker image builds
3. Service startup and health checks
4. Comprehensive test suite
5. Cleanup

## Troubleshooting

### Common Issues

1. **Services won't start**
   - Check port conflicts: `netstat -tulpn | grep :8000`
   - Verify Docker resources: at least 8GB RAM
   - Check logs: `make -C infra logs`

2. **Database connection errors**
   - Verify PostgreSQL is healthy: `docker ps`
   - Check connection string in environment variables
   - Restart database: `docker restart zahara-postgres`

3. **API authentication issues**
   - Verify JWT token is valid and not expired
   - Check API key format (should start with `zhr_`)
   - Confirm API key has proper permissions

4. **Vector operations failing**
   - Run vector sanity check: `curl -H "Auth: Bearer TOKEN" localhost:8000/vector/sanity`
   - Verify Qdrant is running: `curl localhost:6333/`
   - Check default collection creation

### Support Contacts

- **Technical Lead**: [Contact Information]
- **DevOps Team**: [Contact Information]  
- **Documentation**: This repository's docs/ folder
- **Issues**: GitHub Issues tab

## Security Notes

### API Key Management
- API keys are hashed using SHA256 before storage
- Only the prefix (first 12 characters) is stored in plaintext for identification
- Keys are shown in full only once during creation
- Implement key rotation policies in production

### Rate Limiting
- Default: 100 requests per minute per IP
- Configurable via `RATE_LIMIT_REQUESTS` and `RATE_LIMIT_WINDOW`
- Returns 429 status when exceeded
- Uses Redis for distributed rate limiting

### Authentication Flow
- JWT tokens with 30-minute expiry
- Secure password hashing with bcrypt
- User session management
- Role-based permissions for API keys

## Performance Considerations

### Resource Requirements
- **Minimum**: 8GB RAM, 4 CPU cores
- **Recommended**: 16GB RAM, 8 CPU cores
- **Storage**: 50GB+ for logs and data
- **Network**: 1Gbps+ for production

### Scaling Options
- Horizontal scaling: Run multiple API instances behind load balancer
- Database: PostgreSQL read replicas for read scaling
- Cache: Redis Cluster for high availability
- Vector: Qdrant clustering for large-scale vector operations

## Backup & Recovery

### Data Backup
```bash
# PostgreSQL backup
docker exec zahara-postgres pg_dump -U postgres postgres > backup.sql

# Redis backup
docker exec zahara-redis redis-cli BGSAVE

# Qdrant backup
docker exec zahara-qdrant tar -czf /backup/qdrant.tar.gz /qdrant/storage
```

### Recovery Procedures
```bash
# Restore PostgreSQL
docker exec -i zahara-postgres psql -U postgres postgres < backup.sql

# Restore Redis
docker cp backup.rdb zahara-redis:/data/dump.rdb
docker restart zahara-redis
```

## Final Notes

### Success Criteria Met ✅
- `make -C infra init && make -C infra up` → all services healthy
- Router forwards to provider when key present, returns 501 when missing
- API keys hashed + seeded, 401/429 enforced
- Rate-limit enforced via Redis
- Version endpoint returns SHA + timestamp
- Agents + vector sanity endpoints working
- Flowise service integrated and documented
- CI green, no regressions, production-ready

### Next Steps
1. Deploy to production environment
2. Set up monitoring and alerting
3. Configure backup procedures
4. Implement additional security measures
5. Train team on operational procedures

---

**This completes the Zahara.ai platform handoff. The system is production-ready and fully documented.**
