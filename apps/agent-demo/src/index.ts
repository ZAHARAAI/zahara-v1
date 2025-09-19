/**
 * Agent Demo Runtime
 * MIT-licensed OSS TypeScript agent runtime with observability
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';
import axios, { AxiosResponse } from 'axios';
import { Policy, ConsecutiveBreaker, ExponentialBackoff } from 'cockatiel';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  }
});

// Get tracer
const tracer = trace.getTracer('agent-demo-runtime');

// Configuration
const PORT = process.env.PORT || 3000;
const FASTAPI_GATEWAY_URL = process.env.FASTAPI_GATEWAY_URL || 'http://localhost:8000';
const API_KEY = process.env.API_KEY || 'demo-api-key';

// Circuit breaker and retry policy
const breaker = new ConsecutiveBreaker(5);
const retryPolicy = Policy
  .handleAll()
  .retry()
  .exponential(1000, 2)
  .maxAttempts(3);

const circuitBreakerPolicy = Policy
  .handleAll()
  .circuitBreaker(10000, breaker);

// Express app
const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Request ID middleware
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
      duration_ms: duration,
      user_agent: req.get('User-Agent')
    }, 'HTTP request completed');
  });
  
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'agent-demo',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Execute task endpoint
app.post('/run', async (req, res) => {
  const requestId = req.headers['x-request-id'] as string;
  const startTime = Date.now();
  
  // Create span for the entire request
  const span = tracer.startSpan('agent_demo_run');
  span.setAttributes({
    'request_id': requestId,
    'service': 'agent-demo',
    'endpoint': '/run'
  });
  
  try {
    // Set span context
    await context.with(trace.setSpan(context.active(), span), async () => {
      const { task, parameters = {} } = req.body;
      
      if (!task) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Task is required' });
        span.end();
        return res.status(400).json({
          error: 'Task is required',
          request_id: requestId
        });
      }
      
      // Log request
      logger.info({
        request_id: requestId,
        task,
        parameters,
        service: 'agent-demo'
      }, 'Processing task request');
      
      // Execute with circuit breaker and retry policy
      const result = await circuitBreakerPolicy.execute(async () => {
        return await retryPolicy.execute(async () => {
          // Create child span for FastAPI call
          const fastApiSpan = tracer.startSpan('fastapi_gateway_call');
          fastApiSpan.setAttributes({
            'request_id': requestId,
            'target_service': 'fastapi-gateway',
            'endpoint': '/execute'
          });
          
          try {
            const response: AxiosResponse = await axios.post(
              `${FASTAPI_GATEWAY_URL}/execute`,
              {
                task,
                parameters
              },
              {
                headers: {
                  'X-API-Key': API_KEY,
                  'X-Request-Id': requestId,
                  'Content-Type': 'application/json'
                },
                timeout: 10000
              }
            );
            
            fastApiSpan.setStatus({ code: SpanStatusCode.OK });
            fastApiSpan.end();
            
            return response.data;
          } catch (error) {
            fastApiSpan.setStatus({ 
              code: SpanStatusCode.ERROR, 
              message: error instanceof Error ? error.message : 'Unknown error'
            });
            fastApiSpan.end();
            throw error;
          }
        });
      });
      
      const duration = Date.now() - startTime;
      
      // Log success
      logger.info({
        request_id: requestId,
        task,
        status: 'success',
        duration_ms: duration,
        service: 'agent-demo'
      }, 'Task completed successfully');
      
      span.setStatus({ code: SpanStatusCode.OK });
      span.setAttributes({
        'task': task,
        'duration_ms': duration,
        'status': 'success'
      });
      span.end();
      
      res.json({
        request_id: requestId,
        status: 'success',
        result: result,
        duration_ms: duration,
        service: 'agent-demo'
      });
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Log error
    logger.error({
      request_id: requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration_ms: duration,
      service: 'agent-demo'
    }, 'Task execution failed');
    
    span.setStatus({ 
      code: SpanStatusCode.ERROR, 
      message: error instanceof Error ? error.message : 'Unknown error'
    });
    span.setAttributes({
      'error': true,
      'duration_ms': duration
    });
    span.end();
    
    // Handle different error types
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 500;
      const message = error.response?.data?.detail || error.message;
      
      res.status(status).json({
        error: message,
        request_id: requestId,
        duration_ms: duration,
        service: 'agent-demo'
      });
    } else {
      res.status(500).json({
        error: 'Internal server error',
        request_id: requestId,
        duration_ms: duration,
        service: 'agent-demo'
      });
    }
  }
});

// Error handling middleware
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({
    request_id: req.headers['x-request-id'],
    error: error.message,
    stack: error.stack,
    service: 'agent-demo'
  }, 'Unhandled error');
  
  res.status(500).json({
    error: 'Internal server error',
    request_id: req.headers['x-request-id'],
    service: 'agent-demo'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    request_id: req.headers['x-request-id'],
    service: 'agent-demo'
  });
});

// Start server
app.listen(PORT, () => {
  logger.info({
    port: PORT,
    service: 'agent-demo',
    fastapi_gateway_url: FASTAPI_GATEWAY_URL
  }, 'Agent Demo Runtime started');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});
