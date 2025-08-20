# 🚀 FastAPI Backend System

A comprehensive, production-ready FastAPI backend system with PostgreSQL, Redis, Qdrant vector database, and local LLM integration. Built for modern AI applications with containerized deployment and development-focused tooling.

## 📋 Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Quick Start](#-quick-start)
- [Services](#-services)
- [API Documentation](#-api-documentation)
- [Development Guide](#-development-guide)
- [Environment Configuration](#-environment-configuration)
- [Enabling Flowise](#-enabling-flowise)
- [Production Deployment](#-production-deployment)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)

## ✨ Features

### Core Backend
- **FastAPI** with modern Python practices and async support
- **PostgreSQL 15** as primary database with health checks
- **Redis 7** for caching and rate limiting
- **JWT Authentication** with user management
- **Rate Limiting** middleware with Redis backend
- **Comprehensive Health Checks** for all services

### AI & Vector Capabilities
- **Qdrant Vector Database** for similarity search and embeddings
- **Local LLM Integration** with Ollama (TinyLlama, Phi-3-mini)
- **OpenAI-Compatible API** for seamless model switching
- **AI Agents System** with conversation management
- **Vector Operations** API for embeddings and search

### Development Experience
- **Docker Compose** orchestration for all services
- **Hot Reload** development environment
- **Interactive Dashboard** with real-time monitoring
- **Comprehensive Makefile** with 25+ commands
- **GitHub Actions CI/CD** pipeline
- **Production-ready** configurations

### Monitoring & Management
- **Beautiful Web Dashboard** with service status
- **Real-time Health Monitoring** for all components
- **LLM Chat Interface** built into dashboard
- **System Metrics** and logging
- **API Testing Interface** with authentication

## 🏗️ Architecture

### Core Services (Default Stack)
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   API Service   │    │   PostgreSQL    │    │     Redis       │
│   Port: 8000    │◄──►│   Port: 5432    │    │   Port: 6379    │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                                              │
         ▼                                              ▼
┌─────────────────┐    ┌─────────────────┐
│     Qdrant      │    │  Router Service │
│   Port: 6333    │    │   Port: 7000    │
│  Vector Store   │    │   LLM Router    │
└─────────────────┘    └─────────────────┘
```

### Development Services (Profile: `dev`)
```
┌─────────────────┐
│     Ollama      │
│   Port: 11434   │
│   Local LLM     │
│  (Dev Profile)  │
└─────────────────┘
```

## 🚀 Quick Start

Get the entire system running with these commands:

```bash
# 1. Clone and navigate
git clone <repository-url>
cd zahara-v1

# 2. Start all services (default stack)
make -C infra init && make -C infra up

# 3. Check service status
make -C infra ps

# 4. Test health endpoints
curl http://localhost:8000/health/
curl http://localhost:7000/health

# 5. Access the dashboard (if available)
open http://localhost:8000/static/index.html
```

### Development Mode (with dev pages)
```bash
# Start with dev pages enabled
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml --profile dev up -d

# Test dev endpoint
curl http://localhost:8000/dev/test
```

## 🔧 Services

### Service Ports & Access URLs

| Service | Port | URL | Purpose |
|---------|------|-----|---------|
| API Service | 8000 | http://localhost:8000 | Main FastAPI application |
| Router Service | 7000 | http://localhost:7000 | LLM routing service |
| Dashboard | 8000 | http://localhost:8000/static/index.html | Web Interface |
| API Docs | 8000 | http://localhost:8000/docs | Swagger UI |
| ReDoc | 8000 | http://localhost:8000/redoc | Alternative Docs |
| PostgreSQL | 5432 | localhost:5432 | Database |
| Redis | 6379 | localhost:6379 | Cache & Rate Limiting |
| Qdrant | 6333 | http://localhost:6333 | Vector Database |
| Ollama* | 11434 | http://localhost:11434 | Local LLM (dev profile) |

*Ollama is only available with dev profile

### Service Details

#### FastAPI Application
- **Base Image:** Python 3.11-slim
- **Features:** Hot reload, health checks, CORS enabled
- **Authentication:** JWT tokens with 30-minute expiry
- **Rate Limiting:** 100 requests per minute per IP

#### PostgreSQL Database
- **Version:** PostgreSQL 15-alpine
- **Features:** Persistent storage, health checks, custom init scripts
- **Default DB:** `fastapi_db`
- **Backup:** Automated backup commands available

#### Redis Cache
- **Version:** Redis 7-alpine
- **Configuration:** Password protected, memory optimized
- **Usage:** Rate limiting, session storage, caching
- **Memory Limit:** 256MB with LRU eviction

#### Qdrant Vector Database
- **Version:** Latest official image
- **Features:** API key authentication, persistent storage
- **Usage:** Vector embeddings, similarity search
- **API:** RESTful and gRPC interfaces

#### Ollama LLM Service
- **Models:** TinyLlama-1.1B, Phi-3-mini (CPU-friendly)
- **API:** OpenAI-compatible endpoints
- **Memory:** 4GB limit, 2GB reserved
- **Usage:** Local inference, no external API calls

## 📚 API Documentation

### Authentication Endpoints

```bash
# Register new user
POST /auth/register
{
  "username": "newuser",
  "email": "user@example.com", 
  "password": "securepassword"
}

# Login user
POST /auth/login
Content-Type: application/x-www-form-urlencoded
username=admin&password=admin123

# Get current user
GET /auth/me
Authorization: Bearer <token>

# Refresh token
POST /auth/refresh
Authorization: Bearer <token>
```

### Health Check Endpoints

```bash
# Basic health
GET /health/

# Database health
GET /health/database

# Redis health  
GET /health/redis

# Qdrant health
GET /health/qdrant

# LLM service health
GET /health/llm

# All services health
GET /health/all
```

### Vector Operations

```bash
# Create collection
POST /vector/collections
{
  "name": "my_collection",
  "vector_size": 384
}

# Add vectors
POST /vector/embed
{
  "collection_name": "my_collection",
  "vectors": [[0.1, 0.2, ...], [0.3, 0.4, ...]],
  "payloads": [{"text": "doc1"}, {"text": "doc2"}]
}

# Search vectors
POST /vector/search
{
  "collection_name": "my_collection", 
  "query_vector": [0.1, 0.2, ...],
  "limit": 10,
  "score_threshold": 0.7
}

# List collections
GET /vector/collections
```

### LLM Endpoints

```bash
# Chat completion
POST /llm/chat
{
  "messages": [
    {"role": "user", "content": "Hello!"}
  ],
  "model": "tinyllama",
  "provider": "local"
}

# Text generation
POST /llm/generate
{
  "prompt": "Write a story about...",
  "model": "phi3:mini",
  "provider": "local"
}

# Available models
GET /llm/models?provider=local
```

### AI Agents

```bash
# Create agent
POST /agents/create
{
  "name": "Assistant",
  "description": "Helpful AI assistant",
  "system_prompt": "You are a helpful assistant.",
  "model": "tinyllama",
  "provider": "local"
}

# Chat with agent
POST /agents/{agent_id}/chat
{
  "message": "Hello!",
  "conversation_id": "optional_id"
}

# List agents
GET /agents/list
```

## 💻 Development Guide

### Available Make Commands

```bash
# Infrastructure Management (run from project root)
make -C infra help   # Show all available commands
make -C infra init   # Pull Docker images
make -C infra build  # Build all Docker images
make -C infra up     # Start all services
make -C infra down   # Stop all services
make -C infra logs   # View all logs (follow mode)
make -C infra ps     # Show container status
make -C infra test   # Run health checks
make -C infra clean  # Stop and remove containers with volumes

# Testing & Quality
pytest tests/ -v     # Run tests
ruff check .         # Run linting
```

### Development Workflow

1. **Setup Development Environment**
   ```bash
   # Start the infrastructure
   make -C infra init && make -C infra up
   ```

2. **Make Code Changes**
   - Edit files in `services/api/app/` directory for API service
   - Edit files in `services/router/app/` directory for Router service
   - Changes auto-reload in development mode

3. **Test Changes**
   ```bash
   pytest tests/ -v     # Run tests
   ruff check .         # Run linting
   ```

4. **Check Service Health**
   ```bash
   curl http://localhost:8000/health/  # API health
   curl http://localhost:7000/health   # Router health
   make -C infra ps                    # Container status
   ```

5. **View Logs**
   ```bash
   make -C infra logs   # All services logs
   ```

### Adding New Features

1. **For API Service:**
   - Create new router in `services/api/app/routers/`
   - Add models in `services/api/app/models/`
   - Create services in `services/api/app/services/`
   - Update `services/api/app/main.py` to include new router

2. **For Router Service:**
   - Edit `services/router/app/main.py` directly

3. **Testing:**
   - Add tests in `tests/` directory
   - Run `pytest tests/ -v` to verify

## ⚙️ Environment Configuration

### Environment Files

- **`infra/.env.example`** - Template with all variables (no secrets)
- **`.env.local`** - Local development settings (create manually, gitignored)
- **`.env.production`** - Production settings (create manually)

### Key Configuration Variables

```bash
# Application
APP_NAME=FastAPI Backend
DEBUG=true
HOST=0.0.0.0
PORT=8000

# Database
DATABASE_URL=postgresql://user:pass@postgres:5432/db
POSTGRES_USER=fastapi_user
POSTGRES_PASSWORD=secure_password_123

# Redis
REDIS_URL=redis://:password@redis:6379
REDIS_PASSWORD=redis_password_123

# Qdrant
QDRANT_URL=http://qdrant:6333
QDRANT_API_KEY=qdrant_secure_key_123

# LLM
LOCAL_LLM_URL=http://ollama:11434
DEFAULT_MODEL=tinyllama

# Authentication
SECRET_KEY=super_secret_jwt_key_change_in_production
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Rate Limiting
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=60
```

### Security Notes

- **Change default passwords** in production
- **Use strong SECRET_KEY** for JWT tokens
- **Enable HTTPS** in production
- **Configure CORS** appropriately
- **Use environment-specific** `.env` files

## 🔄 Development Modes

### Default Mode (Production-Like)
- Core services only: API, Router, PostgreSQL, Redis, Qdrant
- No dev endpoints available
- Suitable for production-like testing

### Development Mode
- All core services plus development features
- Dev endpoints enabled (`/dev/test`, `/dev/health`)
- Additional debugging and development tools

```bash
# Enable development mode
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml --profile dev up -d
```

## 🚀 Production Deployment

### Production Checklist

- [ ] Change all default passwords
- [ ] Set strong `SECRET_KEY`
- [ ] Configure proper CORS origins
- [ ] Enable HTTPS/TLS
- [ ] Set up proper logging
- [ ] Configure backup strategy
- [ ] Set resource limits
- [ ] Enable monitoring
- [ ] Configure firewall rules

### Production Commands

```bash
# Build for production
docker build -t zahara-api ./services/api
docker build -t zahara-router ./services/router

# Start in production mode  
make -C infra up

# Production environment file
cp infra/.env.example .env.production
# Edit .env.production with production values
```

### Docker Compose Production

```bash
# Use production compose file with environment override
docker compose -f infra/docker-compose.yml up -d
```

### Environment Variables for Production

```bash
# Security
DEBUG=false
SECRET_KEY=<generate-strong-key>
CORS_ORIGINS=["https://yourdomain.com"]

# Database
DATABASE_URL=postgresql://user:pass@prod-db:5432/db

# Monitoring
LOG_LEVEL=INFO
SENTRY_DSN=<your-sentry-dsn>
```

## 🔧 Troubleshooting

### Common Issues

#### Services Won't Start
```bash
# Check container status
make -C infra ps

# View logs
make -C infra logs

# Rebuild containers
make -C infra down && make -C infra up
```

#### Database Connection Issues
```bash
# Check database health
curl http://localhost:8000/health/all

# Access database shell
docker exec -it zahara-postgres psql -U postgres -d postgres

# Restart database
make -C infra down && make -C infra up
```

#### LLM Models Not Working
```bash
# Check if Ollama is running (dev profile only)
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml --profile dev ps

# Check router service logs
docker logs zahara-router

# Test chat completions endpoint
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-3.5-turbo","messages":[{"role":"user","content":"Hello"}]}'
```

#### Port Conflicts
```bash
# Check what's using ports
netstat -tulpn | grep :8000

# Stop conflicting services
sudo systemctl stop <service-name>
```

#### Memory Issues
```bash
# Check resource usage
make stats

# Reduce Ollama memory limit in docker-compose.yml
# Set smaller Redis maxmemory
```

### Performance Optimization

#### Database
- Add indexes for frequently queried columns
- Use connection pooling
- Configure PostgreSQL memory settings

#### Redis
- Adjust maxmemory policy
- Use appropriate data structures
- Monitor memory usage

#### LLM Service
- Use smaller models for development
- Implement request queuing
- Cache frequent responses

### Debugging

#### Enable Debug Mode
```bash
# Set in .env.local
DEBUG=true

# Restart services
make rebuild
```

#### Access Container Logs
```bash
# All services
make -C infra logs

# Specific service
docker logs zahara-api
docker logs zahara-router
docker logs zahara-postgres
docker logs zahara-redis
docker logs zahara-qdrant
```

#### Database Debugging
```bash
# Access PostgreSQL
docker exec -it zahara-postgres psql -U postgres -d postgres

# Check tables
\dt

# Check connections
SELECT * FROM pg_stat_activity;
```

## 🤝 Contributing

### Development Setup

1. **Fork the repository**
2. **Clone your fork**
   ```bash
   git clone <your-fork-url>
   cd fastapi-backend
   ```

3. **Set up development environment**
   ```bash
   make -C infra init && make -C infra up
   ```

4. **Create feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

5. **Make changes and test**
   ```bash
   pytest tests/ -v    # Run tests
   ruff check .        # Run linting
   ```

6. **Submit pull request**

### Code Standards

- **Python:** Follow PEP 8, use Black formatter
- **Imports:** Use isort for import organization  
- **Type Hints:** Use type hints for all functions
- **Documentation:** Add docstrings for all public functions
- **Tests:** Write tests for new features

### Commit Guidelines

```bash
# Format: type(scope): description
feat(auth): add OAuth2 integration
fix(database): resolve connection pool issue
docs(readme): update installation instructions
test(api): add integration tests for vector endpoints
```

### Pull Request Process

1. Update documentation if needed
2. Add tests for new functionality
3. Ensure all tests pass
4. Update CHANGELOG.md
5. Request review from maintainers

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **FastAPI** - Modern, fast web framework
- **Qdrant** - Vector similarity search engine
- **Ollama** - Local LLM inference
- **PostgreSQL** - Reliable relational database
- **Redis** - In-memory data structure store

---

**Built with ❤️ for the AI development community**

For questions, issues, or contributions, please visit our [GitHub repository](https://github.com/your-username/fastapi-backend).