# Observability Guide

This document provides comprehensive information about the observability features in the Zahara platform, including distributed tracing, logging, and monitoring.

## Overview

The Zahara platform implements comprehensive observability using:

- **OpenTelemetry**: Distributed tracing and metrics
- **Jaeger**: Trace visualization and analysis
- **Structured Logging**: JSON-formatted logs with correlation
- **Request ID Propagation**: End-to-end request tracking

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Dashboard     │    │   Agent Demo    │    │  Agent Custom   │
│   (React/Next)  │    │  (TypeScript)   │    │  (TypeScript)   │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          │ OpenTelemetry        │ OpenTelemetry        │ OpenTelemetry
          │ Spans                │ Spans                │ Spans
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │    FastAPI Gateway        │
                    │    (Python)               │
                    │    OpenTelemetry Spans    │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │       Jaeger              │
                    │    (Trace Collection)     │
                    │    Port: 16686            │
                    └───────────────────────────┘
```

## Distributed Tracing

### OpenTelemetry Setup

All services are instrumented with OpenTelemetry for distributed tracing:

#### FastAPI Gateway (Python)
```python
from opentelemetry import trace
from opentelemetry.exporter.jaeger.thrift import JaegerExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

# Initialize tracing
trace.set_tracer_provider(TracerProvider())
tracer = trace.get_tracer(__name__)

jaeger_exporter = JaegerExporter(
    agent_host_name=os.getenv("JAEGER_AGENT_HOST", "localhost"),
    agent_port=int(os.getenv("JAEGER_AGENT_PORT", "14268")),
)

span_processor = BatchSpanProcessor(jaeger_exporter)
trace.get_tracer_provider().add_span_processor(span_processor)
```

#### Agent Runtimes (TypeScript)
```typescript
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

// Get tracer
const tracer = trace.getTracer('agent-custom-runtime');

// Create spans
const span = tracer.startSpan('agent_custom_run');
span.setAttributes({
  'request_id': requestId,
  'service': 'agent-custom',
  'endpoint': '/run'
});
```

### Request ID Propagation

Every request includes a unique request ID that flows through the entire system:

```typescript
// Generate request ID
const requestId = crypto.randomUUID();

// Add to headers
headers: {
  'X-Request-Id': requestId,
  'Content-Type': 'application/json'
}
```

### Span Attributes

Spans include comprehensive attributes for debugging and analysis:

```typescript
span.setAttributes({
  'request_id': requestId,
  'service': 'agent-custom',
  'endpoint': '/run',
  'task': task,
  'duration_ms': duration,
  'status': 'success'
});
```

## Jaeger Integration

### Jaeger Configuration

Jaeger is configured as an all-in-one service in Docker Compose:

```yaml
jaeger:
  image: jaegertracing/all-in-one:1.51
  ports:
    - "16686:16686"  # Jaeger UI
    - "14268:14268"  # HTTP collector
    - "14250:14250"  # gRPC collector
  environment:
    - COLLECTOR_OTLP_ENABLED=true
```

### Accessing Jaeger UI

1. **Start the platform**:
   ```bash
   docker compose up -d
   ```

2. **Open Jaeger UI**: http://localhost:16686

3. **Search for traces**:
   - Use request IDs to find specific traces
   - Filter by service name
   - Set time ranges for analysis

### Trace Analysis

#### Service Map
- Visual representation of service dependencies
- Request flow between services
- Performance bottlenecks identification

#### Trace Timeline
- Detailed span timeline
- Request duration breakdown
- Error identification and analysis

#### Span Details
- Request parameters and responses
- Error messages and stack traces
- Custom attributes and metadata

## Structured Logging

### Log Format

All services use structured JSON logging:

```json
{
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "service": "agent-custom",
  "level": "info",
  "message": "Task completed successfully",
  "task": "Process user data",
  "duration_ms": 1250,
  "timestamp": "2024-01-01T12:00:00.000Z",
  "user_agent": "Mozilla/5.0...",
  "method": "POST",
  "url": "/run",
  "status": 200
}
```

### Log Levels

- **ERROR**: System errors, exceptions, failures
- **WARN**: Warning conditions, degraded performance
- **INFO**: General information, successful operations
- **DEBUG**: Detailed debugging information

### Log Correlation

Logs are correlated using request IDs:

```typescript
// Request middleware
app.use((req, res, next) => {
  req.headers['x-request-id'] = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-Id', req.headers['x-request-id']);
  next();
});

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      request_id: req.headers['x-request-id'],
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration_ms: duration
    }, 'HTTP request completed');
  });
  
  next();
});
```

## Monitoring and Metrics

### Health Checks

All services provide health check endpoints:

```bash
# Check service health
curl http://localhost:8000/health
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3000/api/health
```

### Key Metrics

#### Request Metrics
- **Request Rate**: Requests per second
- **Response Time**: P50, P95, P99 latencies
- **Error Rate**: 4xx and 5xx error percentages
- **Throughput**: Successful requests per second

#### System Metrics
- **CPU Usage**: Container CPU utilization
- **Memory Usage**: Container memory consumption
- **Network I/O**: Network traffic and latency
- **Disk I/O**: Storage read/write operations

#### Business Metrics
- **Task Completion Rate**: Successful task executions
- **Circuit Breaker State**: Open/closed status
- **Retry Attempts**: Number of retry operations
- **Queue Depth**: Pending request queue size

### Circuit Breaker Monitoring

The platform implements circuit breakers with monitoring:

```typescript
// Circuit breaker state tracking
const breaker = new ConsecutiveBreaker(5);

// Monitor circuit breaker state
logger.info({
  circuit_breaker_state: breaker.state,
  failure_count: breaker.failureCount,
  last_failure_time: breaker.lastFailureTime
}, 'Circuit breaker status');
```

## Alerting and Notifications

### Recommended Alerts

#### Critical Alerts
- **Service Down**: Health check failures
- **High Error Rate**: >5% error rate
- **Circuit Breaker Open**: Service unavailable
- **High Latency**: P95 > 2 seconds

#### Warning Alerts
- **High CPU Usage**: >80% CPU utilization
- **High Memory Usage**: >80% memory usage
- **Slow Response Time**: P95 > 1 second
- **Retry Rate High**: >10% retry rate

### Alert Configuration

Example alert configuration for monitoring systems:

```yaml
# Prometheus alert rules
groups:
  - name: zahara.rules
    rules:
      - alert: ServiceDown
        expr: up{job="zahara"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Service {{ $labels.instance }} is down"
      
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High error rate on {{ $labels.instance }}"
```

## Performance Analysis

### Trace Analysis

#### Identifying Bottlenecks
1. **Long Spans**: Identify spans with high duration
2. **Frequent Retries**: Look for retry patterns
3. **External Dependencies**: Check external service calls
4. **Database Queries**: Analyze database performance

#### Optimization Strategies
1. **Caching**: Implement caching for frequent requests
2. **Connection Pooling**: Optimize database connections
3. **Async Processing**: Use asynchronous processing
4. **Resource Scaling**: Scale resources based on load

### Log Analysis

#### Common Patterns
```bash
# Find slow requests
grep "duration_ms" logs.json | jq 'select(.duration_ms > 1000)'

# Find error patterns
grep "ERROR" logs.json | jq '.message'

# Analyze request patterns
grep "request_id" logs.json | jq '.url' | sort | uniq -c
```

#### Performance Queries
```bash
# Average response time by endpoint
grep "duration_ms" logs.json | jq -r 'select(.url) | "\(.url) \(.duration_ms)"' | \
  awk '{sum[$1]+=$2; count[$1]++} END {for (i in sum) print i, sum[i]/count[i]}'

# Error rate by service
grep "status" logs.json | jq -r 'select(.status >= 400) | .service' | sort | uniq -c
```

## Troubleshooting

### Common Issues

#### Traces Not Appearing
1. **Check Jaeger Status**: Verify Jaeger is running
2. **Verify Configuration**: Check OpenTelemetry setup
3. **Network Connectivity**: Ensure services can reach Jaeger
4. **Sampling Rate**: Check if sampling is too low

#### High Memory Usage
1. **Span Retention**: Reduce span retention time
2. **Batch Size**: Optimize batch processing
3. **Buffer Size**: Adjust buffer configurations
4. **Resource Limits**: Increase memory limits

#### Slow Performance
1. **Trace Overhead**: Reduce trace sampling
2. **Log Volume**: Optimize log levels
3. **Network Latency**: Check network performance
4. **Resource Contention**: Monitor resource usage

### Debug Commands

```bash
# Check Jaeger status
curl http://localhost:16686/api/services

# View recent traces
curl "http://localhost:16686/api/traces?service=agent-custom&limit=10"

# Check service logs
docker compose logs -f fastapi-gateway
docker compose logs -f agent-custom

# Monitor resource usage
docker stats

# Test trace propagation
curl -X POST http://localhost:8000/execute \
  -H "X-Request-Id: test-$(date +%s)" \
  -H "X-API-Key: default-api-key" \
  -d '{"task": "test", "parameters": {}}'
```

## Best Practices

### Development
1. **Always Use Request IDs**: Include request IDs in all requests
2. **Structured Logging**: Use JSON format for logs
3. **Meaningful Spans**: Create spans for significant operations
4. **Error Context**: Include context in error messages

### Production
1. **Sampling Strategy**: Implement appropriate sampling rates
2. **Log Retention**: Set appropriate log retention policies
3. **Resource Monitoring**: Monitor resource usage continuously
4. **Alert Tuning**: Fine-tune alert thresholds

### Maintenance
1. **Regular Cleanup**: Clean up old traces and logs
2. **Performance Review**: Regular performance analysis
3. **Capacity Planning**: Monitor growth trends
4. **Documentation**: Keep observability docs current

## Integration with External Systems

### Prometheus Integration
```yaml
# Prometheus configuration
scrape_configs:
  - job_name: 'zahara'
    static_configs:
      - targets: ['localhost:8000', 'localhost:3001', 'localhost:3002']
    metrics_path: /metrics
    scrape_interval: 15s
```

### Grafana Dashboards
- **Service Overview**: High-level service metrics
- **Request Flow**: Request patterns and performance
- **Error Analysis**: Error rates and patterns
- **Resource Usage**: System resource utilization

### ELK Stack Integration
```yaml
# Logstash configuration
input {
  beats {
    port => 5044
  }
}

filter {
  if [fields][service] == "zahara" {
    json {
      source => "message"
    }
  }
}

output {
  elasticsearch {
    hosts => ["elasticsearch:9200"]
    index => "zahara-logs-%{+YYYY.MM.dd}"
  }
}
```

This observability setup provides comprehensive visibility into the Zahara platform, enabling effective monitoring, debugging, and performance optimization.
