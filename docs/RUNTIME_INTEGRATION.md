# Runtime Integration Guide

This document provides detailed information about integrating and working with the Zahara agent runtime platform.

## Overview

The Zahara platform consists of multiple agent runtimes that communicate through a centralized FastAPI gateway. Each runtime is designed to be independent, scalable, and observable.

## Architecture Components

### 1. FastAPI Gateway

The central gateway that handles all agent requests with advanced features:

- **Retry Logic**: Exponential backoff with jitter
- **Circuit Breaker**: Prevents cascade failures
- **Request Validation**: API key authentication
- **Observability**: OpenTelemetry tracing
- **Error Handling**: Graceful error responses

#### Key Endpoints

```http
GET /health
POST /execute
  Headers:
    X-API-Key: <api-key>
    X-Request-Id: <uuid>
  Body:
    {
      "task": "string",
      "parameters": {}
    }
```

### 2. Agent Runtimes

#### Agent Demo
- **Purpose**: MIT-licensed OSS TypeScript agent runtime
- **Port**: 3001
- **Features**: Standard agent functionality with observability

#### Agent Custom
- **Purpose**: Rebranded runtime with neutral theme
- **Port**: 3002
- **Features**: Custom branding, no logos, neutral styling

Both runtimes share the same core functionality:

```http
GET /health
POST /run
  Headers:
    X-Request-Id: <uuid>
  Body:
    {
      "task": "string",
      "parameters": {}
    }
```

## Integration Patterns

### 1. Direct Gateway Integration

For applications that need to execute agent tasks:

```typescript
import axios from 'axios';

const executeTask = async (task: string, parameters: any) => {
  const response = await axios.post('http://localhost:8000/execute', {
    task,
    parameters
  }, {
    headers: {
      'X-API-Key': 'your-api-key',
      'X-Request-Id': crypto.randomUUID(),
      'Content-Type': 'application/json'
    }
  });
  
  return response.data;
};
```

### 2. Agent Runtime Integration

For applications that want to use specific agent runtimes:

```typescript
const runAgentTask = async (task: string, parameters: any) => {
  const response = await axios.post('http://localhost:3002/run', {
    task,
    parameters
  }, {
    headers: {
      'X-Request-Id': crypto.randomUUID(),
      'Content-Type': 'application/json'
    }
  });
  
  return response.data;
};
```

### 3. Dashboard Integration

The React dashboard provides a complete UI for managing agents:

- **Upload Wizard**: Step-by-step task configuration
- **Builder**: Visual agent configuration
- **Clinic**: Monitoring and trace visualization

## Configuration

### Environment Variables

#### FastAPI Gateway
```bash
FASTAPI_API_KEY=your-secure-api-key
JAEGER_AGENT_HOST=jaeger
JAEGER_AGENT_PORT=14268
LOG_LEVEL=INFO
```

#### Agent Runtimes
```bash
NODE_ENV=production
PORT=3000
FASTAPI_GATEWAY_URL=http://fastapi-gateway:8000
API_KEY=your-api-key
JAEGER_AGENT_HOST=jaeger
JAEGER_AGENT_PORT=14268
LOG_LEVEL=info
```

#### Dashboard
```bash
NODE_ENV=production
NEXT_PUBLIC_AGENT_CUSTOM_URL=http://localhost:3002
```

### Docker Compose Configuration

The platform uses Docker Compose for orchestration:

```yaml
services:
  fastapi-gateway:
    build: ./apps/fastapi-gateway
    ports: ["8000:8000"]
    environment:
      - API_KEY=${FASTAPI_API_KEY}
    depends_on:
      jaeger:
        condition: service_healthy

  agent-custom:
    build: ./apps/agent-custom
    ports: ["3002:3000"]
    environment:
      - FASTAPI_GATEWAY_URL=http://fastapi-gateway:8000
    depends_on:
      fastapi-gateway:
        condition: service_healthy
```

## Error Handling

### HTTP Status Codes

- **200**: Success
- **400**: Bad Request (invalid parameters)
- **401**: Unauthorized (invalid API key)
- **429**: Too Many Requests (rate limited)
- **500**: Internal Server Error
- **503**: Service Unavailable (circuit breaker open)

### Error Response Format

```json
{
  "error": "Error message",
  "request_id": "uuid",
  "duration_ms": 1500,
  "service": "service-name"
}
```

### Retry Logic

The platform implements sophisticated retry logic:

- **Exponential Backoff**: 1s, 2s, 4s, 8s, 16s
- **Jitter**: Random variation to prevent thundering herd
- **Max Attempts**: 3 retries by default
- **Circuit Breaker**: Opens after 5 consecutive failures

## Observability

### Request ID Propagation

All requests include a unique request ID that flows through the entire system:

```typescript
const requestId = crypto.randomUUID();

// Add to headers
headers: {
  'X-Request-Id': requestId
}
```

### Logging

Structured JSON logging with request correlation:

```json
{
  "request_id": "uuid",
  "service": "agent-custom",
  "level": "info",
  "message": "Task completed successfully",
  "duration_ms": 1500,
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### Tracing

OpenTelemetry spans for distributed tracing:

- **Span Attributes**: Request ID, service name, endpoint
- **Span Context**: Propagated across service boundaries
- **Jaeger Integration**: Visual trace analysis

## Performance Considerations

### Timeout Configuration

- **Gateway Timeout**: 10 seconds
- **Agent Timeout**: Configurable per request
- **Circuit Breaker Timeout**: 60 seconds

### Resource Limits

- **Memory**: 512MB per service container
- **CPU**: 0.5 cores per service container
- **Network**: Isolated Docker network

### Scaling

The platform is designed for horizontal scaling:

```yaml
# Scale agent runtimes
docker compose up --scale agent-custom=3

# Load balancer configuration
# (Add nginx or similar for production)
```

## Security

### API Key Management

- **Environment Variables**: Store API keys securely
- **Header Validation**: All requests require valid API keys
- **Key Rotation**: Support for key rotation without downtime

### Network Security

- **Docker Networks**: Isolated service communication
- **Port Exposure**: Only necessary ports exposed
- **CORS Configuration**: Proper cross-origin settings

### Container Security

- **Non-root Users**: All containers run as non-root
- **Multi-stage Builds**: Minimal production images
- **Vulnerability Scanning**: Trivy scans in CI/CD

## Monitoring and Alerting

### Health Checks

All services provide health check endpoints:

```bash
curl http://localhost:8000/health
curl http://localhost:3001/health
curl http://localhost:3002/health
```

### Metrics

Key metrics to monitor:

- **Request Rate**: Requests per second
- **Response Time**: P50, P95, P99 latencies
- **Error Rate**: 4xx and 5xx error percentages
- **Circuit Breaker State**: Open/closed status

### Alerting

Recommended alerts:

- **High Error Rate**: >5% errors
- **High Latency**: P95 > 2 seconds
- **Circuit Breaker Open**: Service unavailable
- **Health Check Failures**: Service down

## Troubleshooting

### Common Issues

1. **Service Discovery**: Ensure services can resolve each other by name
2. **Port Conflicts**: Check for port conflicts in Docker
3. **API Key Mismatch**: Verify API keys match across services
4. **Network Connectivity**: Test inter-service communication

### Debug Commands

```bash
# Check service status
docker compose ps

# View logs
docker compose logs -f <service-name>

# Test connectivity
docker compose exec fastapi-gateway curl http://agent-custom:3000/health

# Check Jaeger traces
open http://localhost:16686
```

### Performance Debugging

```bash
# Monitor resource usage
docker stats

# Check network connectivity
docker compose exec <service> ping <other-service>

# Test with load
ab -n 100 -c 10 http://localhost:8000/health
```

## Best Practices

### Development

1. **Use Request IDs**: Always include request IDs for tracing
2. **Handle Errors Gracefully**: Implement proper error handling
3. **Test Circuit Breakers**: Verify circuit breaker behavior
4. **Monitor Logs**: Use structured logging for debugging

### Production

1. **Resource Limits**: Set appropriate resource limits
2. **Health Checks**: Implement comprehensive health checks
3. **Monitoring**: Set up monitoring and alerting
4. **Security**: Use secure API keys and network policies

### Maintenance

1. **Regular Updates**: Keep dependencies updated
2. **Security Scans**: Run regular vulnerability scans
3. **Backup Strategy**: Implement backup and recovery
4. **Documentation**: Keep documentation current
