# zahara (backend sprint)

This repo hosts the backend sprint. Work via **PRs only** (no direct pushes).

## Daily cadence
- Kickoff: **12:00 PM Eastern (NYC, UTC-4)**
- Daily check-in: 12:00–12:15 Eastern (text or 60-sec Loom)

## First PR (due within 24h of kickoff)
- Monorepo scaffold
- Docker Compose: api, router, postgres, redis, qdrant (healthchecks + volumes)
- /services/api → /health; /services/router → /health (501 if no provider key)
- infra/.env.example (no secrets), infra/Makefile (init up down logs ps)
- CI (job: `ci`): ruff, docker build (api/router), pytest
