.PHONY: help init up down logs ps test clean build

# Default target
help:
	@echo "Zahara Infrastructure Commands:"
	@echo ""
	@echo "  make init           - Build and pull Docker images"
	@echo "  make build          - Build all Docker images"
	@echo "  make up             - Start all services"
	@echo "  make up-flowise     - Start all services including Flowise (Option A Fork)"
	@echo "  make down           - Stop all services"  
	@echo "  make logs           - Show logs from all services"
	@echo "  make ps             - Show status of all services"
	@echo "  make test           - Run health checks"
	@echo "  make seed           - Generate initial API key (run once)"
	@echo "  make clean          - Stop and remove containers with volumes"
	@echo ""
	@echo "Testing Commands:"
	@echo "  make test-all       - Run all tests (health + Python + frontend)"
	@echo "  make test-python    - Run Python tests"
	@echo "  make test-python-flowise - Run Python tests with Flowise service"
	@echo "  make test-frontend  - Run frontend tests"
	@echo "  make test-e2e       - Run E2E tests"
	@echo ""
	@echo "Workflows:"
	@echo "  make dev            - Development workflow (up + test + test-python)"
	@echo "  make ci             - CI workflow (build + up + test + test-python)"
	@echo ""
	@echo "Flowise Commands:"
	@echo "  make flowise-up     - Start only Flowise service"
	@echo "  make flowise-down   - Stop Flowise service"
	@echo "  make flowise-logs   - Show Flowise logs"
	@echo ""

# Build and pull images
init:
	docker compose build
	docker compose pull --ignore-pull-failures

# Start all services
up:
	docker compose up -d

# Stop all services
down:
	docker compose down

# Show logs
logs:
	docker compose logs -f --tail=200

# Show service status
ps:
	docker compose ps

# Build Docker images
build:
	docker build -t zahara-ai/api:latest ../services/api
	docker build -t zahara-ai/router:latest ../services/router
	docker build -t zahara-ai/frontend:latest ../frontend

# Test health endpoints
test:
	@echo "Testing health endpoints..."
	@curl -sf http://localhost:8000/health/ && echo "✅ API health check passed"
	@curl -sf http://localhost:7000/health && echo "✅ Router health check passed"
	@curl -sf http://localhost:3001 && echo "✅ Frontend health check passed"

# Start all services including Flowise (Option A Fork)
up-flowise:
	docker compose --profile flowise up -d

# Start only Flowise service (Option A Fork)
flowise-up:
	docker compose --profile flowise up flow-builder -d

# Stop Flowise service
flowise-down:
	docker compose stop flow-builder

# Show Flowise logs
flowise-logs:
	docker compose logs flow-builder -f

# Generate initial API key
seed:
	@echo "🌱 Generating initial API key..."
	docker compose exec api bash -c "cd /app && python seed_data.py"

# Clean up containers and volumes
clean:
	docker compose down -v

# Full test suite
test-all: test test-python test-frontend

# Run Python tests with database setup
test-python:
	@echo "🧪 Running Python tests..."
	@echo "Ensuring database is migrated..."
	docker compose exec api alembic upgrade head || echo "Migration may have already been applied"
	cd .. && python -m pytest tests/ -v --tb=short --timeout=30

# Run Python tests with Flowise
test-python-flowise:
	@echo "🧪 Running Python tests with Flowise..."
	docker compose --profile flowise up -d
	@echo "Waiting for Flowise to start..."
	@powershell -Command "Start-Sleep -Seconds 30"
	cd .. && python -m pytest tests/ -v --tb=short --timeout=30
	docker compose stop flow-builder

# Run frontend tests
test-frontend:
	@echo "🧪 Running frontend tests..."
	cd ../frontend && npm test

# Run E2E tests
test-e2e:
	@echo "🧪 Running E2E tests..."
	cd ../frontend && npm run test:e2e

# Development workflow - start services and run tests
dev: up test test-python
	@echo "🎉 Development environment ready!"

# CI workflow - build, start, test everything
ci: build up test test-python
	@echo "🎉 CI pipeline completed successfully!"