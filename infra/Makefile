.PHONY: help init up down logs ps test clean build

# Default target
help:
	@echo "Zahara Infrastructure Commands:"
	@echo ""
	@echo "  make init    - Pull Docker images"
	@echo "  make build   - Build all Docker images"
	@echo "  make up      - Start all services"
	@echo "  make down    - Stop all services"  
	@echo "  make logs    - Show logs from all services"
	@echo "  make ps      - Show status of all services"
	@echo "  make test    - Run health checks"
	@echo "  make clean   - Stop and remove containers with volumes"
	@echo ""

# Pull images
init:
	docker compose pull

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
	docker build -t api ../services/api
	docker build -t router ../services/router

# Test health endpoints
test:
	@echo "Testing health endpoints..."
	@curl -sf http://localhost:8000/health/ && echo "✅ API health check passed"
	@curl -sf http://localhost:7000/health && echo "✅ Router health check passed"

# Clean up containers and volumes
clean:
	docker compose down -v