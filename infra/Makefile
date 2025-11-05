.PHONY: help init build up up-flowise down logs ps test seed clean

help:
	@echo "Zahara Infrastructure Commands:"
	@echo ""
	@echo "  make init           - Build images"
	@echo "  make build          - Build images"
	@echo "  make up             - Start services"
	@echo "  make up-flowise     - Start services incl. Flowise profile"
	@echo "  make down           - Stop all services"
	@echo "  make logs           - Tail logs"
	@echo "  make ps             - Status"
	@echo "  make test           - Hit API health"
	@echo "  make seed           - Generate initial API key (inside api)"
	@echo "  make clean          - Stop and remove with volumes"

init:
	docker compose build

build:
	docker compose build

up:
	docker compose up -d

# Start with Flowise profile too
up-flowise:
	docker compose --profile flowise up -d

down:
	docker compose down

logs:
	docker compose logs -f

ps:
	docker compose ps

# Simple health check (requires API container running)
test:
	docker compose run --rm api curl -fsS http://localhost:8000/health || exit 1

# Generate initial API key (your app should implement seed_data.py)
seed:
	@echo "🌱 Generating initial API key..."
	docker compose exec api bash -c "cd /app && python seed_data.py"

clean:
	docker compose down -v
