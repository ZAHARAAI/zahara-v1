# Flowise Integration Guide - Option A Fork

This document provides instructions for integrating and using the security-hardened Flowise fork with the Zahara.ai platform.

## Overview

Flowise is included as an optional service in the Zahara.ai Docker Compose stack using **Option A Fork Integration**. This approach provides:
- **Security-scanned container images** (Trivy vulnerability scanning)
- **Supply chain security** (SBOM generation and verification)
- **Pinned commit SHA** for reproducible builds
- **Contract testing** for API compatibility

## Security Features

### Option A Fork Benefits
- ✅ **Vulnerability Scanning**: Trivy security scans fail on HIGH/CRITICAL vulnerabilities
- ✅ **SBOM Generation**: Software Bill of Materials in SPDX format
- ✅ **Pinned Dependencies**: Commit SHA pinning prevents supply chain attacks
- ✅ **Contract Testing**: Automated deeplink compatibility verification
- ✅ **GitHub Container Registry**: Signed and verified container images

### Security Information
- **Fork Repository**: https://github.com/ZAHARAAI/Flowise
- **Container Image**: `ghcr.io/zaharaai/flowise:af1464f7c2b9a608a2763f5d696d6670e8f51a7e`
- **Baseline Tag**: `zahara-baseline-20250824`
- **Build Workflow**: `.github/workflows/flowise-ci.yml`

## Quick Start

### 1. Enable Flowise Service

Flowise runs under the `flowise` profile. To start it with the main stack:

```bash
# Start all services including Flowise
make -C infra up-flowise

# Or using docker compose directly
docker compose -f infra/docker-compose.yml --profile flowise up -d
```

### 2. Access Flowise Interface

Once started, Flowise will be available at:
- **URL**: http://localhost:3000
- **Username**: admin (configurable via `FLOWISE_USERNAME`)
- **Password**: admin123 (configurable via `FLOWISE_PASSWORD`)

### 3. Basic Configuration

The default configuration includes:
- **Version**: Commit SHA `af1464f7c2b9a608a2763f5d696d6670e8f51a7e` (security-scanned)
- **Port**: 3000
- **Data Storage**: Persistent volume (`flowise_data`)
- **Authentication**: Username/password based
- **CORS**: Configured for localhost:3000,8000

## Configuration

### Environment Variables

Configure Flowise through these environment variables in your `.env` file:

```bash
# Flowise Configuration (Option A Fork Integration)
FLOWISE_COMMIT_SHA=af1464f7c2b9a608a2763f5d696d6670e8f51a7e
FLOWISE_USERNAME=admin
FLOWISE_PASSWORD=admin123
```

### Docker Compose Configuration

The Flowise service is configured as:

```yaml
flow-builder:
  image: ghcr.io/zaharaai/flowise:${FLOWISE_COMMIT_SHA:-af1464f7c2b9a608a2763f5d696d6670e8f51a7e}
  container_name: zahara-flowise
  ports:
    - "3000:3000"
  environment:
    - PORT=3000
    - FLOWISE_USERNAME=${FLOWISE_USERNAME:-admin}
    - FLOWISE_PASSWORD=${FLOWISE_PASSWORD:-admin123}
    - DATABASE_PATH=/root/.flowise
    - APIKEY_PATH=/root/.flowise
    - LOG_LEVEL=info
    - CORS_ORIGINS=http://localhost:3000,http://localhost:8000
  profiles: ["flowise"]
```

### Make Commands

Use these convenient commands to manage Flowise:

```bash
# Start Flowise service only
make -C infra flowise-up

# Stop Flowise service
make -C infra flowise-down

# View Flowise logs
make -C infra flowise-logs
```

## Integration with Zahara.ai API

### Connecting to Zahara API

1. **Get API Key**: Create an API key from Zahara.ai API:
   ```bash
   curl -X POST http://localhost:8000/api-keys/ \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Flowise Integration",
       "description": "API key for Flowise integration",
       "can_read": true,
       "can_write": true
     }'
   ```

2. **Configure in Flowise**: Use the API key in your Flowise workflows to connect to Zahara services.

### Available Endpoints

Connect Flowise to these Zahara.ai endpoints:

- **Chat Completions**: `http://host.docker.internal:8000/v1/chat/completions`
- **Vector Search**: `http://host.docker.internal:8000/vector/search`
- **Agents**: `http://host.docker.internal:8000/agents/`
- **Health**: `http://host.docker.internal:8000/health/`

> **Note**: Use `host.docker.internal` to access the host machine from within Docker containers.

## Contract Testing

### Automated Tests

The Option A fork includes automated contract tests that verify:

```python
# Run contract tests
python -m pytest tests/test_flowise_contract.py -v

# Individual test categories:
# 1. Health endpoint accessibility
# 2. UI availability and content
# 3. Essential API endpoints existence
# 4. Deeplink compatibility structure
```

### Manual Verification

```bash
# Health check
curl http://localhost:3000/api/v1/ping

# UI verification
curl http://localhost:3000 | grep -i flowise

# Canvas deeplink compatibility
curl http://localhost:3000/canvas | grep -i -E "(canvas|workflow|chatflow)"
```

## Security Monitoring

### Container Image Verification

```bash
# Verify container image SHA
docker images ghcr.io/zaharaai/flowise

# Check security scan results (available as GitHub Actions artifacts)
# View SBOM: flowise-sbom.spdx.json
# View Trivy results: flowise-trivy-results.sarif
```

### Update Process

To update to a new security-scanned version:

1. **GitHub Actions Build**: New commits trigger automatic security scanning
2. **Manual Verification**: Review security artifacts and test results
3. **Update Configuration**: Update `FLOWISE_COMMIT_SHA` in environment files
4. **Restart Service**: `make -C infra flowise-down && make -C infra flowise-up`

## Troubleshooting

### Common Issues

1. **Flowise won't start**:
   ```bash
   # Check logs
   make -C infra flowise-logs
   
   # Restart service
   docker compose restart zahara-flowise
   
   # Verify image availability
   docker pull ghcr.io/zaharaai/flowise:af1464f7c2b9a608a2763f5d696d6670e8f51a7e
   ```

2. **Can't access UI**:
   - Verify port 3000 is not in use
   - Check firewall settings
   - Ensure service is healthy: `make -C infra ps`

3. **Image pull errors**:
   - Verify GitHub Container Registry access
   - Check network connectivity
   - Confirm commit SHA is correct

### Health Checks

```bash
# Check service status
make -C infra ps

# Health check endpoint  
curl http://localhost:3000/api/v1/ping

# View logs
make -C infra flowise-logs

# Contract test verification
python -m pytest tests/test_flowise_contract.py::test_health_endpoint -v
```

## Security Compliance

### Supply Chain Security

- **Image Scanning**: All images scanned with Trivy for vulnerabilities
- **SBOM Generation**: Software Bill of Materials available for compliance
- **Pinned Dependencies**: Specific commit SHA prevents drift
- **Signature Verification**: GitHub Container Registry provides signed images

### Monitoring and Alerting

- **GitHub Actions**: Automated security scanning on every build
- **Artifact Storage**: Security reports stored for audit trails
- **Contract Tests**: Automated compatibility verification

## Version Information

- **Fork Repository**: https://github.com/ZAHARAAI/Flowise
- **Pinned Commit**: `af1464f7c2b9a608a2763f5d696d6670e8f51a7e`
- **Baseline Tag**: `zahara-baseline-20250824`
- **Container Registry**: `ghcr.io/zaharaai/flowise`
- **Compatibility**: Tested with Zahara.ai v1.0.0

## Support and Resources

- **Flowise Documentation**: https://docs.flowiseai.com/
- **Fork Repository**: https://github.com/ZAHARAAI/Flowise
- **Security Reports**: Available as GitHub Actions artifacts
- **Zahara.ai Integration**: Contact support for specific integration help

---

**Note**: This Flowise integration uses Option A (Fork + Pin) for enhanced security and supply chain protection. All core Zahara.ai functionality works independently of Flowise integration.