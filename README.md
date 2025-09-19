# Zahara - Agent Runtime Platform

A comprehensive agent runtime platform with Docker Compose integration, FastAPI gateway, observability, and a modern React dashboard.

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development)
- Python 3.11+ (for local development)

### Running the Platform

1. **Clone and start all services:**
```bash
   git clone <repository-url>
   cd zahara-v1-main
   docker compose up -d
   ```

2. **Verify all services are healthy:**
   ```bash
   docker compose ps
   ```

3. **Access the services:**
   - **Dashboard UI**: http://localhost:3000
   - **FastAPI Gateway**: http://localhost:8000
   - **Agent Demo**: http://localhost:3001
   - **Agent Custom**: http://localhost:3002
   - **Jaeger UI**: http://localhost:16686

## 📋 Services Overview

### 🎯 FastAPI Gateway (Port 8000)
- **Purpose**: Central gateway for all agent requests
- **Endpoints**:
  - `GET /health` - Health check
  - `POST /execute` - Execute agent tasks
- **Features**: Retries, circuit breaker, OpenTelemetry tracing

### 🤖 Agent Demo (Port 3001)
- **Purpose**: MIT-licensed OSS TypeScript agent runtime
- **Endpoints**:
  - `GET /health` - Health check
  - `POST /run` - Execute tasks via FastAPI gateway
- **Features**: Structured logging, retries, circuit breaker

### 🎨 Agent Custom (Port 3002)
- **Purpose**: Rebranded agent runtime with neutral theme
- **Endpoints**:
  - `GET /health` - Health check
  - `POST /run` - Execute tasks via FastAPI gateway
- **Features**: Custom branding, structured logging, retries

### 📊 Dashboard (Port 3000)
- **Purpose**: React/Next.js UI for managing agents
- **Pages**:
  - **Upload Wizard**: 3-step task upload process
  - **Builder**: Visual agent configuration builder
  - **Clinic**: Monitor runs with traces and metrics

### 🔍 Jaeger (Port 16686)
- **Purpose**: Distributed tracing and observability
- **Features**: Request ID propagation, span visualization

## 🧪 Testing the Platform

### Health Checks
```bash
# Check all services
curl http://localhost:8000/health  # FastAPI Gateway
curl http://localhost:3001/health  # Agent Demo
curl http://localhost:3002/health  # Agent Custom
curl http://localhost:3000/api/health  # Dashboard
```

### Execute a Task
```bash
# Via FastAPI Gateway
curl -X POST http://localhost:8000/execute \
  -H "Content-Type: application/json" \
  -H "X-API-Key: default-api-key" \
  -H "X-Request-Id: test-123" \
  -d '{"task": "test task", "parameters": {"timeout": 30}}'

# Via Agent Custom
curl -X POST http://localhost:3002/run \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: test-456" \
  -d '{"task": "custom task", "parameters": {"retries": 3}}'
```

### UI Workflows

1. **Upload Wizard Flow**:
   - Navigate to http://localhost:3000/upload
   - Fill task details → Configure parameters → Review & Upload
   - Automatically redirects to Clinic with trace

2. **Builder Flow**:
   - Navigate to http://localhost:3000/builder
   - Configure agent settings → Save & Test
   - Automatically redirects to Clinic with trace

3. **Clinic Monitoring**:
   - Navigate to http://localhost:3000/clinic
   - View run history, select runs for details
   - Click "View in Jaeger" for distributed traces

## 🔧 Development

### Local Development Setup

1. **Install dependencies:**
   ```bash
   # FastAPI Gateway
   cd apps/fastapi-gateway
   pip install -r requirements.txt

   # Agent services
   cd apps/agent-demo
   npm install
   
   cd apps/agent-custom
   npm install

   # Dashboard
   cd apps/dashboard
   npm install
   ```

2. **Run services locally:**
   ```bash
   # Terminal 1: FastAPI Gateway
   cd apps/fastapi-gateway
   uvicorn main:app --reload --port 8000

   # Terminal 2: Agent Demo
   cd apps/agent-demo
   npm run dev

   # Terminal 3: Agent Custom
   cd apps/agent-custom
   npm run dev

   # Terminal 4: Dashboard
   cd apps/dashboard
   npm run dev
   ```

### Environment Configuration

Each service has an `env.example` file. Copy and customize:

```bash
cp apps/fastapi-gateway/env.example apps/fastapi-gateway/.env
cp apps/agent-demo/env.example apps/agent-demo/.env
cp apps/agent-custom/env.example apps/agent-custom/.env
cp apps/dashboard/env.example apps/dashboard/.env
```

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Dashboard     │    │   Agent Demo    │    │  Agent Custom   │
│   (React/Next)  │    │  (TypeScript)   │    │  (TypeScript)   │
│   Port: 3000    │    │   Port: 3001    │    │   Port: 3002    │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │    FastAPI Gateway        │
                    │    (Python)               │
                    │    Port: 8000             │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │       Jaeger              │
                    │    (Observability)        │
                    │    Port: 16686            │
                    └───────────────────────────┘
```

## 🔍 Observability

### Request ID Flow
- All requests include `X-Request-Id` header
- Request ID propagates through all services
- Visible in logs, traces, and UI

### Jaeger Tracing
- OpenTelemetry spans for all service calls
- End-to-end request tracing
- Performance metrics and error tracking

### Structured Logging
- JSON-formatted logs with request IDs
- Service identification and correlation
- Error tracking and debugging

## 🚀 CI/CD Pipeline

The platform includes a comprehensive GitHub Actions workflow:

- **Linting & Testing**: Node.js and Python services
- **Docker Build**: Multi-stage builds for all services
- **Security Scanning**: Trivy vulnerability scans
- **E2E Testing**: Playwright tests for UI workflows
- **Artifact Generation**: Review ZIP for deployments

## 📚 Additional Documentation

- [Runtime Integration Guide](docs/RUNTIME_INTEGRATION.md)
- [Observability Setup](docs/OBSERVABILITY.md)
- [Flowise Integration](docs/FLOWISE_INTEGRATION.md)
- [Handoff Documentation](docs/HANDOFF.md)

## 🛠️ Troubleshooting

### Common Issues

1. **Services not starting**:
```bash
   docker compose logs <service-name>
   docker compose ps
   ```

2. **Port conflicts**:
   - Check if ports 3000, 3001, 3002, 8000, 16686 are available
   - Modify ports in `docker-compose.yml` if needed

3. **API key issues**:
   - Ensure API keys match between services
   - Check environment variables in `.env` files

4. **Tracing not working**:
   - Verify Jaeger is running: http://localhost:16686
   - Check OpenTelemetry configuration in services

### Logs and Debugging

```bash
# View all logs
docker compose logs -f

# View specific service logs
docker compose logs -f fastapi-gateway
docker compose logs -f agent-custom

# Check service health
docker compose ps
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## 📞 Support

For issues and questions:
- Check the troubleshooting section above
- Review the documentation in `/docs`
- Open an issue in the repository