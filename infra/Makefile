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
	@echo "  make clean          - Stop and remove containers with volumes"
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

# Test health endpoints
test:
	@echo "Testing health endpoints..."
	@curl -sf http://localhost:8000/health/ && echo "✅ API health check passed"
	@curl -sf http://localhost:7000/health && echo "✅ Router health check passed"

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

# Clean up containers and volumes
clean:
	docker compose down -v