# Makefile to orchestrate docker-compose in infra/
SHELL := /bin/bash
COMPOSE := docker compose -f docker-compose.yml

.PHONY: help build up ps logs test down clean seed

help:
	@echo "Targets:"
	@echo "  build   - Build all images"
	@echo "  up      - Start stack in background"
	@echo "  ps      - Show status"
	@echo "  logs    - Tail logs"
	@echo "  test    - Check API health (/health)"
	@echo "  down    - Stop stack"
	@echo "  clean   - Stop and remove volumes"
	@echo "  seed    - Run API seed script (if present)"

build:
	$(COMPOSE) build

up:
	$(COMPOSE) up -d

ps:
	$(COMPOSE) ps

logs:
	$(COMPOSE) logs -f --tail=200

test:
	@echo "Waiting for API health..."
	@for i in {1..30}; do \
		code=$$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health || true); \
		if [ "$$code" = "200" ]; then \
			echo "API healthy ✅"; exit 0; \
		fi; \
		echo "Attempt $$i/30: got $$code, retrying..."; \
		sleep 2; \
	done; \
	echo "API not healthy ❌"; \
	exit 1

down:
	$(COMPOSE) down

clean:
	$(COMPOSE) down -v

seed:
	# Example: run a seeding command inside the API container
	# Adjust to your actual seed entrypoint/script
	docker exec -it $$(docker ps --filter "name=_api" --format "{{.ID}}" | head -n1) \
		python -m app.seed_data || true
