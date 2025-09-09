# 🔍 Zahara.ai Agent Clinic MVP
## Complete LLM Trace Observability & Debugging Platform

[![Build Status](https://github.com/zahara-ai/agent-clinic/workflows/CI/badge.svg)](https://github.com/zahara-ai/agent-clinic/actions)
[![Netlify Status](https://api.netlify.com/api/v1/badges/your-site-id/deploy-status)](https://app.netlify.com/sites/your-site/deploys)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Production-Ready LLM Observability Dashboard** - Monitor, debug, and optimize your AI agent executions with real-time trace analysis, performance metrics, and comprehensive debugging tools.

---

## 🚀 Quick Start (5 Minutes)

Get the Agent Clinic running locally with full functionality:

```bash
# 1. Clone the repository
git clone https://github.com/zahara-ai/agent-clinic.git
cd zahara-v1

# 2. Copy environment configuration
cp .env.example .env

# 3. Start all services with Docker Compose (using Makefile)
cd infra
make up

# 4. Wait for services to initialize (30 seconds)
make ps
make test

# 5. Access the application
echo "🎉 Agent Clinic is ready!"
echo "Frontend: http://localhost:3001"
echo "Backend API: http://localhost:8000"
echo "Router Service: http://localhost:7000"
echo "API Docs: http://localhost:8000/docs"
```

**Default Credentials:**
- **API Key**: `zhr_demo_clinic_2024_observability_key`
- **Demo Mode**: Enabled (includes sample trace data)

---

## 📋 Table of Contents

- [🏗️ Architecture Overview](#️-architecture-overview)
- [⚡ Features](#-features)
- [🛠️ Installation](#️-installation)
- [🔧 Configuration](#-configuration)
- [🧪 Testing](#-testing)
- [📊 API Documentation](#-api-documentation)
- [🎨 Frontend Guide](#-frontend-guide)
- [🚀 Deployment](#-deployment)
- [🔍 Troubleshooting](#-troubleshooting)
- [📈 Performance](#-performance)
- [🤝 Contributing](#-contributing)

---

## 🏗️ Architecture Overview

### Tech Stack
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, TanStack Query
- **Backend**: FastAPI, Python 3.11, SQLAlchemy, Alembic
- **Database**: PostgreSQL 15, Redis 7, Qdrant (Vector DB)
- **Deployment**: Docker, Netlify, GitHub Actions
- **Testing**: Playwright (E2E), Pytest (Backend)

---

## ⚡ Features

### 🎯 Core Observability
- **Real-time Trace Monitoring** - Live dashboard with 5-second polling
- **Span Analysis** - Detailed execution timeline with nested operations
- **Performance Metrics** - P50/P95 latency, success rates, cost tracking
- **Error Debugging** - Comprehensive error capture and analysis

### 🔍 Advanced Analytics
- **Smart Filtering** - Filter by status, model, operation, date range
- **Search Functionality** - Full-text search across trace data
- **Aggregate Metrics** - Token usage, cost analysis, performance trends
- **CSV Export** - Configurable data export with progress tracking

### 🎨 Professional UI/UX
- **Dark Theme** - Zahara.ai branded interface with orange accents
- **Responsive Design** - Mobile-friendly responsive layouts
- **Real-time Updates** - Smart polling with user interaction detection
- **Skeleton Loaders** - Professional loading states with shimmer effects

### 🔐 Enterprise Security
- **X-API-Key Authentication** - Secure API access control
- **Development Mode** - Bypass authentication for local development
- **Rate Limiting** - Built-in request throttling
- **CORS Protection** - Configurable cross-origin policies

---

## 🛠️ Installation

### Prerequisites
- **Docker & Docker Compose** (recommended)
- **Node.js 18+** (for local development)
- **Python 3.11+** (for backend development)
- **PostgreSQL 15+** (if not using Docker)

### Option 1: Docker Setup (Recommended)

```bash
# Clone repository
git clone https://github.com/zahara-ai/agent-clinic.git
cd agent-clinic

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Start all services
docker-compose up -d

# Verify services are running
docker-compose ps

# Run comprehensive system test
bash scripts/test-system.sh
```

### Option 2: Local Development Setup

```bash
# Backend setup
cd services/api
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Database setup (requires PostgreSQL running)
alembic upgrade head
python scripts/load_demo_data.py

# Start backend
uvicorn app.main:app --reload --port 8000

# Frontend setup (new terminal)
cd frontend
npm install
npm run dev
```

---

## 🧪 Testing

### Quick Health Check

```bash
# Check all services are running
docker-compose ps

# Run comprehensive system validation
bash scripts/test-system.sh

# Test backend health
curl http://localhost:8000/health

# Test API authentication
curl -H "X-API-Key: zhr_demo_clinic_2024_observability_key" \
     http://localhost:8000/api/v1/traces

# Test frontend
open http://localhost:3000
```

### API Testing Examples

```bash
# === AUTHENTICATION TESTING ===

# ✅ Valid API key (should return 200)
curl -H "X-API-Key: zhr_demo_clinic_2024_observability_key" \
     http://localhost:8000/api/v1/traces

# ❌ Invalid API key (should return 401)
curl -H "X-API-Key: invalid-key" \
     http://localhost:8000/api/v1/traces

# === TRACES ENDPOINT TESTING ===

# List traces with pagination
curl -H "X-API-Key: zhr_demo_clinic_2024_observability_key" \
     "http://localhost:8000/api/v1/traces?page=1&page_size=10"

# Filter by status
curl -H "X-API-Key: zhr_demo_clinic_2024_observability_key" \
     "http://localhost:8000/api/v1/traces?status=ERROR"

# Search traces
curl -H "X-API-Key: zhr_demo_clinic_2024_observability_key" \
     "http://localhost:8000/api/v1/traces?search=customer+support"

# === METRICS TESTING ===

# Get aggregate metrics
curl -H "X-API-Key: zhr_demo_clinic_2024_observability_key" \
     http://localhost:8000/api/v1/metrics/aggregate

# === EXPORT TESTING ===

# Export traces as CSV
curl -H "X-API-Key: zhr_demo_clinic_2024_observability_key" \
     "http://localhost:8000/api/v1/traces/export?format=csv" \
     -o traces_export.csv
```

---

## 🔍 Troubleshooting

### Common Issues & Solutions

#### 🚨 Database Connection Failed
```bash
# Check PostgreSQL status
docker-compose ps postgres

# View PostgreSQL logs
docker-compose logs postgres

# Reset database
docker-compose down -v
docker-compose up postgres -d
sleep 30
docker-compose exec backend alembic upgrade head
```

#### 🚨 API Key Authentication Failed
```bash
# Verify environment variables
docker-compose exec backend env | grep API_KEY

# Test with correct API key
curl -H "X-API-Key: zhr_demo_clinic_2024_observability_key" \
     http://localhost:8000/api/v1/traces
```

#### 🚨 Frontend Can't Connect to Backend
```bash
# Check backend health
curl http://localhost:8000/health

# Verify frontend environment
docker-compose exec frontend env | grep VITE_API_BASE_URL

# Restart services
docker-compose restart
```

#### 🚨 No Demo Data Available
```bash
# Load demo data manually
docker-compose exec backend python scripts/load_demo_data.py

# Verify data was loaded
curl -H "X-API-Key: zhr_demo_clinic_2024_observability_key" \
     http://localhost:8000/api/v1/traces
```

### Performance Issues
```bash
# Check resource usage
docker stats

# Monitor database performance
docker-compose exec postgres psql -U zahara_user -d zahara_clinic \
  -c "SELECT query, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"
```

---

## 📊 API Documentation

### Base URL
- **Development**: `http://localhost:8000`
- **Production**: `https://api.zahara.ai`

### Authentication
All API endpoints require the `X-API-Key` header:

```bash
curl -H "X-API-Key: zhr_demo_clinic_2024_observability_key" \
     http://localhost:8000/api/v1/traces
```

### Core Endpoints

#### List Traces
```http
GET /api/v1/traces
```

**Query Parameters:**
- `page` (int): Page number (default: 1)
- `page_size` (int): Items per page (default: 25, max: 100)
- `status` (string): Filter by status (OK, ERROR, RATE-LIMIT)
- `model` (string): Filter by model name
- `search` (string): Search across trace data
- `start_date` (datetime): Start date filter (ISO format)
- `end_date` (datetime): End date filter (ISO format)

**Example Response:**
```json
{
  "traces": [
    {
      "trace_id": "550e8400-e29b-41d4-a716-446655440000",
      "timestamp": "2024-12-05T14:30:45Z",
      "total_duration": 2300,
      "total_tokens": 1247,
      "total_cost": 0.087,
      "status": "OK",
      "model": "gpt-4",
      "operation": "customer_query_resolution"
    }
  ],
  "pagination": {
    "page": 1,
    "total": 150,
    "has_next": true
  }
}
```

#### Get Aggregate Metrics
```http
GET /api/v1/metrics/aggregate
```

**Example Response:**
```json
{
  "avg_latency": 3200,
  "p50_latency": 2100,
  "p95_latency": 8700,
  "success_rate": 94.2,
  "total_tokens": 127492,
  "total_cost": 18.67
}
```

### Interactive Documentation
Visit `http://localhost:8000/docs` for complete API documentation.

---

## 🚀 Deployment

### Netlify Deployment (Frontend)

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login and deploy
netlify login
cd frontend
npm run build
netlify deploy --prod --dir=dist
```

### Docker Production Deployment

```bash
# Create production environment
cp .env.example .env.production
# Edit with production values

# Build and deploy
docker-compose -f docker-compose.prod.yml up -d

# Verify deployment
curl https://your-domain.com/api/v1/health
```

---

## 📈 Performance

### Benchmarks
- **Bundle Size**: 377KB (115KB gzipped)
- **Load Time**: <2 seconds
- **API Response**: <100ms average
- **Throughput**: 1000+ requests/second

### Performance Testing
```bash
# Frontend performance audit
npm install -g lighthouse
lighthouse http://localhost:3000 --output=html

# Load testing
bash scripts/test-system.sh
```

---

## 🤝 Contributing

### Development Setup
```bash
# Fork and clone
git clone https://github.com/your-username/agent-clinic.git
cd agent-clinic

# Create feature branch
git checkout -b feature/your-feature

# Setup and test
cp .env.example .env
docker-compose up -d
bash scripts/test-system.sh

# Make changes and commit
git add .
git commit -m "feat: add your feature"
git push origin feature/your-feature
```

### Code Standards
- **Backend**: Black, isort, flake8, mypy
- **Frontend**: ESLint, Prettier, TypeScript strict
- **Testing**: All tests must pass
- **Documentation**: Update README for new features

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🆘 Support

- **Documentation**: This README and `/docs` endpoint
- **Issues**: [GitHub Issues](https://github.com/zahara-ai/agent-clinic/issues)
- **Email**: support@zahara.ai

---

## 🎯 Project Status

**Current Version**: 1.0.0 (Production Ready)

### ✅ Completed Features
- [x] Real-time trace monitoring dashboard
- [x] Advanced filtering and search
- [x] CSV export with progress tracking
- [x] Flowise integration
- [x] X-API-Key authentication
- [x] Docker deployment setup
- [x] CI/CD pipeline
- [x] E2E testing
- [x] Performance optimization

**Built with ❤️ by the Zahara.ai Team**