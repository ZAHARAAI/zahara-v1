# Zahara V1 FastAPI Infrastructure Makefile

.PHONY: help init up down logs ps restart clean test build

# Default target
help:
	@echo "Zahara V1 FastAPI Infrastructure Commands:"
	@echo ""
	@echo "  make init     - Initialize environment (copy .env.example to .env.local)"
	@echo "  make up       - Start all services with docker compose"
	@echo "  make down     - Stop all services"
	@echo "  make logs     - Show logs from all services"
	@echo "  make ps       - Show status of all services"
	@echo "  make restart  - Restart all services"
	@echo "  make clean    - Stop services and remove volumes"
	@echo "  make test     - Run API health checks"
	@echo "  make build    - Build all Docker images"
	@echo ""

# Initialize environment
init:
	@echo "Initializing environment..."
	@if not exist ..\.env.local (copy .env.example ..\.env.local) else (echo ".env.local already exists")
	@echo "Environment initialized! Edit ../.env.local as needed."

# Start all services
up:
	@echo "Starting all services..."
	@cd .. && docker compose up -d
	@echo "Services started! Use 'make ps' to check status."

# Stop all services  
down:
	@echo "Stopping all services..."
	@cd .. && docker compose down
	@echo "Services stopped."

# Show logs
logs:
	@echo "Showing logs from all services..."
	@cd .. && docker compose logs -f

# Show service status
ps:
	@echo "Service status:"
	@cd .. && docker compose ps

# Restart services
restart:
	@echo "Restarting all services..."
	@cd .. && docker compose restart
	@echo "Services restarted."

# Clean up (remove volumes)
clean:
	@echo "Stopping services and removing volumes..."
	@cd .. && docker compose down -v
	@echo "Cleanup complete."

# Build images
build:
	@echo "Building all Docker images..."
	@cd .. && docker compose build
	@echo "Images built."

# Test API endpoints
test:
	@echo "Testing API endpoints..."
	@echo "Waiting for services to be ready..."
	@timeout /t 10 /nobreak > nul
	@echo ""
	@echo "Testing main API health endpoint:"
	@curl -f http://localhost:8000/health/ || echo "❌ API health check failed"
	@echo ""
	@echo "Testing comprehensive health endpoint:"
	@curl -f http://localhost:8000/health/all || echo "❌ Comprehensive health check failed"
	@echo ""
	@echo "Testing v1 chat completions endpoint (should return 501):"
	@curl -X POST http://localhost:8000/v1/chat/completions \
		-H "Content-Type: application/json" \
		-d '{"model":"gpt-3.5-turbo","messages":[{"role":"user","content":"Hello"}]}' \
		|| echo "❌ Chat completions test failed"
	@echo ""
	@echo "API tests completed."

# Ollama model management
pull-models:
	@echo "Pulling Ollama models..."
	@cd .. && docker compose exec ollama ollama pull tinyllama
	@echo "Models pulled successfully!"

list-models:
	@echo "Available Ollama models:"
	@cd .. && docker compose exec ollama ollama list

# Development shortcuts
dev-up: init up
	@echo "Development environment is ready!"
	@echo "API available at: http://localhost:8000"
	@echo "API Docs available at: http://localhost:8000/docs"

dev-logs:
	@cd .. && docker compose logs -f fastapi

dev-restart:
	@cd .. && docker compose restart fastapi
