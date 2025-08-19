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

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   FastAPI App   │    │   PostgreSQL    │    │     Redis       │
│   Port: 8000    │◄──►│   Port: 5432    │    │   Port: 6379    │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                                              │
         ▼                                              ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│     Qdrant      │    │     Ollama      │    │    Flowise      │
│   Port: 6333    │    │   Port: 11434   │    │   Port: 3000    │
│  Vector Store   │    │   Local LLM     │    │   (Optional)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🚀 Quick Start

Get the entire system running in 3 commands:

```bash
# 1. Clone and navigate
git clone <repository-url>
cd fastapi-backend

# 2. Start all services
make quick-start

# 3. Access the dashboard
open http://localhost:8000/static/index.html
```

That's it! The system will:
- Build and start all containers
- Install lightweight LLM models (TinyLlama, Phi-3-mini)
- Set up the database with default admin user
- Be ready for development and testing

### Default Credentials
- **Username:** `admin`
- **Password:** `admin123`

## 🔧 Services

### Service Ports & Access URLs

| Service | Port | URL | Purpose |
|---------|------|-----|---------|
| FastAPI | 8000 | http://localhost:8000 | Main API |
| Dashboard | 8000 | http://localhost:8000/static/index.html | Web Interface |
| API Docs | 8000 | http://localhost:8000/docs | Swagger UI |
| ReDoc | 8000 | http://localhost:8000/redoc | Alternative Docs |
| PostgreSQL | 5432 | localhost:5432 | Database |
| Redis | 6379 | localhost:6379 | Cache & Rate Limiting |
| Qdrant | 6333 | http://localhost:6333 | Vector Database |
| Ollama | 11434 | http://localhost:11434 | Local LLM |
| Flowise* | 3000 | http://localhost:3000 | AI Workflows |

*Flowise is disabled by default

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
# Service Management
make up              # Start all services
make down            # Stop all services  
make build           # Build all containers
make rebuild         # Rebuild and restart
make logs            # View all logs
make status          # Show container status

# Development
make shell           # Access FastAPI container
make shell-db        # Access PostgreSQL shell
make shell-redis     # Access Redis CLI
make dev-setup       # Setup development environment

# Database
make db-migrate      # Run database migrations
make db-reset        # Reset database (WARNING: deletes data)
make backup          # Backup database
make restore BACKUP=file.sql  # Restore from backup

# LLM Management
make install-models  # Install TinyLlama and Phi-3-mini
make list-models     # List installed models

# Testing & Quality
make test            # Run tests
make test-coverage   # Run tests with coverage
make lint            # Run linting
make format          # Format code

# Monitoring
make health          # Check service health
make stats           # Show resource usage

# Cleanup
make clean           # Clean containers and volumes
make clean-all       # Clean everything including images

# Flowise
make enable-flowise  # Enable Flowise service
make disable-flowise # Disable Flowise service
```

### Development Workflow

1. **Setup Development Environment**
   ```bash
   make dev-setup
   ```

2. **Make Code Changes**
   - Edit files in `app/` directory
   - Changes auto-reload in development mode

3. **Test Changes**
   ```bash
   make test
   make lint
   ```

4. **Check Service Health**
   ```bash
   make health
   ```

5. **View Logs**
   ```bash
   make logs-api  # FastAPI logs only
   make logs      # All services
   ```

### Adding New Features

1. **Create new router** in `app/routers/`
2. **Add models** in `app/models/`
3. **Create services** in `app/services/`
4. **Update main.py** to include new router
5. **Add tests** and run `make test`

## ⚙️ Environment Configuration

### Environment Files

- **`.env.example`** - Template with all variables
- **`.env.local`** - Local development settings (auto-created)
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

## 🌊 Enabling Flowise

Flowise is an AI workflow builder that's disabled by default. To enable:

### Step 1: Enable the Service
```bash
make enable-flowise
```

### Step 2: Access Flowise
- URL: http://localhost:3000
- Username: `admin`
- Password: `flowise_admin_123`

### Step 3: Configure Database Connection
In Flowise settings, use:
- **Host:** `postgres`
- **Port:** `5432`
- **Database:** `fastapi_db`
- **Username:** `fastapi_user`
- **Password:** `secure_password_123`

### Step 4: Connect to Local LLM
Add Ollama connection:
- **Base URL:** `http://ollama:11434`
- **Model:** `tinyllama` or `phi3:mini`

### Disable Flowise
```bash
make disable-flowise
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
make prod-build

# Start in production mode
make prod-up

# Production environment file
cp .env.example .env.production
# Edit .env.production with production values
```

### Docker Compose Production

```bash
# Use production compose file
docker-compose -f docker-compose.yml up -d
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
make status

# View logs
make logs

# Rebuild containers
make rebuild
```

#### Database Connection Issues
```bash
# Check database health
curl http://localhost:8000/health/database

# Access database shell
make shell-db

# Reset database
make db-reset
```

#### LLM Models Not Working
```bash
# Check Ollama status
make logs-llm

# Reinstall models
make install-models

# List available models
make list-models
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
make logs

# Specific service
make logs-api
make logs-db
make logs-redis
```

#### Database Debugging
```bash
# Access PostgreSQL
make shell-db

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
   make dev-setup
   ```

4. **Create feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

5. **Make changes and test**
   ```bash
   make test
   make lint
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