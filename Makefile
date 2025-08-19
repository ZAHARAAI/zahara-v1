.PHONY: help up down build logs test lint clean shell db-migrate backup install-models

# Default target
help: ## Show this help message
	@echo "FastAPI Backend - Available Commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# Docker Compose Commands
up: ## Start all services
	docker-compose up -d
	@echo "Services starting... Check status with 'make logs'"
	@echo "FastAPI: http://localhost:8000"
	@echo "Dashboard: http://localhost:8000/static/index.html"
	@echo "API Docs: http://localhost:8000/docs"

down: ## Stop all services
	docker-compose down

build: ## Build all containers
	docker-compose build --no-cache

rebuild: ## Rebuild and restart all services
	docker-compose down
	docker-compose build --no-cache
	docker-compose up -d

logs: ## View logs from all services
	docker-compose logs -f

logs-api: ## View FastAPI logs only
	docker-compose logs -f fastapi

logs-db: ## View database logs only
	docker-compose logs -f postgres

logs-redis: ## View Redis logs only
	docker-compose logs -f redis

logs-qdrant: ## View Qdrant logs only
	docker-compose logs -f qdrant

logs-llm: ## View LLM service logs only
	docker-compose logs -f ollama

# Development Commands
shell: ## Access FastAPI container shell
	docker-compose exec fastapi bash

shell-db: ## Access PostgreSQL shell
	docker-compose exec postgres psql -U fastapi_user -d fastapi_db

shell-redis: ## Access Redis CLI
	docker-compose exec redis redis-cli -a redis_password_123

# Database Commands
db-migrate: ## Run database migrations
	docker-compose exec fastapi alembic upgrade head

db-reset: ## Reset database (WARNING: This will delete all data)
	docker-compose down -v
	docker-compose up -d postgres
	sleep 10
	docker-compose up -d

# LLM Commands
install-models: ## Install lightweight LLM models
	@echo "Installing TinyLlama model..."
	docker-compose exec ollama ollama pull tinyllama
	@echo "Installing Phi-3-mini model..."
	docker-compose exec ollama ollama pull phi3:mini
	@echo "Models installed successfully!"

list-models: ## List installed LLM models
	docker-compose exec ollama ollama list

# Testing Commands
test: ## Run tests
	docker-compose exec fastapi python -m pytest tests/ -v

test-coverage: ## Run tests with coverage
	docker-compose exec fastapi python -m pytest tests/ --cov=app --cov-report=html

# Code Quality Commands
lint: ## Run linting
	docker-compose exec fastapi python -m flake8 app/
	docker-compose exec fastapi python -m black app/ --check
	docker-compose exec fastapi python -m isort app/ --check-only

format: ## Format code
	docker-compose exec fastapi python -m black app/
	docker-compose exec fastapi python -m isort app/

# Health Checks
health: ## Check health of all services
	@echo "Checking service health..."
	@curl -s http://localhost:8000/health/all | python -m json.tool || echo "FastAPI not responding"

status: ## Show status of all containers
	docker-compose ps

# Backup and Restore
backup: ## Backup database
	@mkdir -p backups
	docker-compose exec postgres pg_dump -U fastapi_user fastapi_db > backups/backup_$(shell date +%Y%m%d_%H%M%S).sql
	@echo "Database backup created in backups/ directory"

restore: ## Restore database from backup (Usage: make restore BACKUP=backup_file.sql)
	@if [ -z "$(BACKUP)" ]; then echo "Usage: make restore BACKUP=backup_file.sql"; exit 1; fi
	docker-compose exec -T postgres psql -U fastapi_user -d fastapi_db < backups/$(BACKUP)

# Cleanup Commands
clean: ## Clean up containers and volumes
	docker-compose down -v --remove-orphans
	docker system prune -f

clean-all: ## Clean up everything including images
	docker-compose down -v --remove-orphans --rmi all
	docker system prune -af

# Monitoring Commands
stats: ## Show container resource usage
	docker stats $(shell docker-compose ps -q)

# Flowise Commands
enable-flowise: ## Enable Flowise service
	@echo "Enabling Flowise service..."
	@sed -i 's/# flowise:/flowise:/' docker-compose.yml
	@sed -i 's/#   /  /' docker-compose.yml
	docker-compose up -d flowise
	@echo "Flowise enabled at http://localhost:3000"

disable-flowise: ## Disable Flowise service
	@echo "Disabling Flowise service..."
	docker-compose stop flowise
	@sed -i 's/flowise:/# flowise:/' docker-compose.yml
	@sed -i 's/  /# /' docker-compose.yml

# Quick Setup Commands
quick-start: ## Quick start with model installation
	make up
	@echo "Waiting for services to start..."
	sleep 30
	make install-models
	@echo ""
	@echo "🚀 FastAPI Backend is ready!"
	@echo "Dashboard: http://localhost:8000/static/index.html"
	@echo "API Docs: http://localhost:8000/docs"
	@echo ""
	@echo "Default login: admin / admin123"

dev-setup: ## Setup development environment
	cp .env.example .env.local
	make build
	make up
	sleep 20
	make install-models
	@echo "Development environment ready!"

# Production Commands
prod-up: ## Start in production mode
	docker-compose -f docker-compose.yml up -d

prod-build: ## Build for production
	docker-compose -f docker-compose.yml build --no-cache