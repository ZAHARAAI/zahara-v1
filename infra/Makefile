.PHONY: help init up down logs ps

# Default target
help:
	@echo "Zahara Infrastructure Commands:"
	@echo ""
	@echo "  make init    - Pull Docker images"
	@echo "  make up      - Start all services"
	@echo "  make down    - Stop all services"  
	@echo "  make logs    - Show logs from all services"
	@echo "  make ps      - Show status of all services"
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