import type { Trace, DashboardMetrics } from '../types/trace';

const DEMO_MODELS = [
  'gpt-4',
  'gpt-3.5-turbo',
  'claude-3-sonnet',
  'gpt-4-turbo',
  'claude-3',
];

const DEMO_OPERATIONS = [
  'customer_query_resolution',
  'code_review_analysis',
  'document_summarization',
  'high_priority_query',
  'protected_endpoint_access',
  'legal_document_analysis',
  'content_creation_pipeline',
];

const DEMO_PROVIDERS = ['openai', 'anthropic', 'openrouter'];

// Generate realistic demo traces as specified in requirements
export const generateDemoTraces = (count: number = 50): Trace[] => {
  const traces: Trace[] = [];
  
  for (let i = 0; i < count; i++) {
    const traceId = `trace_${Date.now()}_${i}`;
    const timestamp = new Date(Date.now() - Math.random() * 86400000 * 7).toISOString(); // Last 7 days
    const operation = DEMO_OPERATIONS[Math.floor(Math.random() * DEMO_OPERATIONS.length)];
    const model = DEMO_MODELS[Math.floor(Math.random() * DEMO_MODELS.length)];
    const provider = DEMO_PROVIDERS[Math.floor(Math.random() * DEMO_PROVIDERS.length)];
    
    // Generate realistic metrics based on operation type
    let duration: number, tokens: number, cost: number, status: 'OK' | 'ERROR' | 'RATE-LIMIT';
    let spanCount: number;
    
    switch (operation) {
      case 'customer_query_resolution':
        duration = 2300 + Math.random() * 1000; // 2.3-3.3s
        tokens = 1200 + Math.random() * 500;
        cost = 0.08 + Math.random() * 0.02;
        status = Math.random() > 0.05 ? 'OK' : 'ERROR';
        spanCount = 3;
        break;
      case 'code_review_analysis':
        duration = 5700 + Math.random() * 2000; // 5.7-7.7s
        tokens = 3800 + Math.random() * 600;
        cost = 0.23 + Math.random() * 0.05;
        status = Math.random() > 0.03 ? 'OK' : 'ERROR';
        spanCount = 5;
        break;
      case 'document_summarization':
        duration = 1200 + Math.random() * 800; // 1.2-2.0s
        tokens = 2100 + Math.random() * 300;
        cost = 0.03 + Math.random() * 0.01;
        status = Math.random() > 0.02 ? 'OK' : 'ERROR';
        spanCount = 2;
        break;
      case 'high_priority_query':
        duration = 100 + Math.random() * 50; // Rate limited
        tokens = 0;
        cost = 0;
        status = 'RATE-LIMIT';
        spanCount = 1;
        break;
      case 'protected_endpoint_access':
        duration = 50 + Math.random() * 30; // Auth failed
        tokens = 0;
        cost = 0;
        status = 'ERROR';
        spanCount = 1;
        break;
      case 'legal_document_analysis':
        duration = 12400 + Math.random() * 3000; // 12.4-15.4s
        tokens = 8200 + Math.random() * 1000;
        cost = 0.41 + Math.random() * 0.1;
        status = Math.random() > 0.01 ? 'OK' : 'ERROR';
        spanCount = 7;
        break;
      case 'content_creation_pipeline':
        duration = 4100 + Math.random() * 1500; // 4.1-5.6s
        tokens = 2800 + Math.random() * 400;
        cost = 0.15 + Math.random() * 0.03;
        status = Math.random() > 0.02 ? 'OK' : 'ERROR';
        spanCount = 4;
        break;
      default:
        duration = 2000 + Math.random() * 3000;
        tokens = 1000 + Math.random() * 2000;
        cost = 0.05 + Math.random() * 0.15;
        status = Math.random() > 0.05 ? 'OK' : 'ERROR';
        spanCount = 3;
    }
    
    // Generate spans
    const spans = [];
    const spanOperations = getSpanOperationsForTrace(operation);
    
    for (let j = 0; j < spanCount; j++) {
      const spanId = `span_${traceId}_${j}`;
      const spanDuration = duration / spanCount + (Math.random() - 0.5) * (duration / spanCount * 0.3);
      const spanTokens = Math.floor(tokens / spanCount + (Math.random() - 0.5) * (tokens / spanCount * 0.3));
      const spanCost = cost / spanCount + (Math.random() - 0.5) * (cost / spanCount * 0.3);
      
      spans.push({
        span_id: spanId,
        trace_id: traceId,
        start_time: new Date(new Date(timestamp).getTime() + j * (spanDuration / spanCount)).toISOString(),
        end_time: new Date(new Date(timestamp).getTime() + (j + 1) * (spanDuration / spanCount)).toISOString(),
        duration: spanDuration,
        status: j === spanCount - 1 ? status : 'OK', // Last span inherits trace status
        model,
        tokens: Math.max(0, spanTokens),
        cost: Math.max(0, spanCost),
        operation: spanOperations[j] || `step_${j + 1}`,
        provider,
        metadata: {
          span_index: j,
          span_type: j === 0 ? 'root' : 'child',
        },
      });
    }
    
    // Generate events
    const events = [];
    if (status === 'ERROR') {
      events.push({
        event_id: `event_${traceId}_error`,
        trace_id: traceId,
        span_id: spans[spans.length - 1]?.span_id,
        timestamp: spans[spans.length - 1]?.end_time || timestamp,
        level: 'error' as const,
        message: getErrorMessage(),
        metadata: { error_type: 'processing_error' },
      });
    } else if (status === 'RATE-LIMIT') {
      events.push({
        event_id: `event_${traceId}_rate_limit`,
        trace_id: traceId,
        span_id: spans[0]?.span_id,
        timestamp: spans[0]?.start_time || timestamp,
        level: 'warning' as const,
        message: 'Request rate limited - too many requests',
        metadata: { rate_limit_type: 'token_bucket' },
      });
    }
    
    const trace: Trace = {
      trace_id: traceId,
      timestamp,
      total_duration: duration,
      total_tokens: tokens,
      total_cost: cost,
      status,
      user_id: `user_${Math.floor(Math.random() * 100)}`,
      workflow_id: operation.includes('pipeline') ? `workflow_${Math.floor(Math.random() * 10)}` : undefined,
      model,
      operation,
      spans,
      events,
      aggregate_metrics: {
        total_spans: spanCount,
        success_rate: status === 'OK' ? 100 : 0,
        avg_duration: duration / spanCount,
        p50_duration: duration * 0.6,
        p95_duration: duration * 1.2,
        total_tokens: tokens,
        total_cost: cost,
        error_count: status === 'ERROR' ? 1 : 0,
        rate_limit_count: status === 'RATE-LIMIT' ? 1 : 0,
      },
    };
    
    traces.push(trace);
  }
  
  return traces.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

function getSpanOperationsForTrace(operation: string): string[] {
  switch (operation) {
    case 'customer_query_resolution':
      return ['query_analysis', 'knowledge_retrieval', 'response_generation'];
    case 'code_review_analysis':
      return ['code_parsing', 'security_scan', 'style_check', 'optimization_suggestions', 'report_generation'];
    case 'document_summarization':
      return ['content_extraction', 'summary_generation'];
    case 'legal_document_analysis':
      return ['document_segmentation', 'entity_extraction', 'clause_analysis', 'risk_assessment', 'compliance_check', 'summary_creation', 'report_formatting'];
    case 'content_creation_pipeline':
      return ['outline_generation', 'content_writing', 'fact_checking', 'final_polish'];
    case 'high_priority_query':
      return ['request_throttled'];
    case 'protected_endpoint_access':
      return ['auth_validation_failed'];
    default:
      return ['processing', 'validation', 'response'];
  }
}

function getErrorMessage(): string {
  const errorMessages = [
    'Model timeout exceeded',
    'Invalid input format',
    'Processing capacity exceeded',
    'Authentication failed',
    'Rate limit exceeded',
    'Internal server error',
    'Model unavailable',
    'Token limit exceeded',
  ];
  return errorMessages[Math.floor(Math.random() * errorMessages.length)];
}

// Generate demo dashboard metrics as specified
export const generateDemoDashboardMetrics = (): DashboardMetrics => {
  return {
    total_traces_24h: 1247,
    avg_latency: 3.2,
    p50_latency: 2.1,
    p95_latency: 8.7,
    success_rate: 94.2,
    error_rate: 3.1,
    rate_limit_rate: 2.7,
    total_tokens_24h: 127492,
    total_cost_24h: 18.67,
    top_models: [
      { model: 'gpt-4', count: 487, avg_cost: 0.156 },
      { model: 'gpt-3.5-turbo', count: 623, avg_cost: 0.034 },
      { model: 'claude-3-sonnet', count: 234, avg_cost: 0.187 },
      { model: 'gpt-4-turbo', count: 156, avg_cost: 0.298 },
    ],
  };
};

export const DEMO_API_KEY = 'zhr_demo_clinic_2024_observability_key';
