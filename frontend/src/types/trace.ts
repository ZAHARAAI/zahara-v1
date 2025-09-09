export interface Trace {
  trace_id: string;
  timestamp: string;
  total_duration: number;
  total_tokens: number;
  total_cost: number;
  status: 'OK' | 'ERROR' | 'RATE-LIMIT';
  user_id?: string;
  workflow_id?: string;
  model: string;
  operation: string;
  spans: Span[];
  events: TraceEvent[];
  aggregate_metrics: AggregateMetrics;
}

export interface Span {
  span_id: string;
  trace_id: string;
  start_time: string;
  end_time: string;
  duration: number;
  status: 'OK' | 'ERROR' | 'RATE-LIMIT';
  model: string;
  tokens: number;
  cost: number;
  operation: string;
  provider: string;
  metadata?: Record<string, unknown>;
}

export interface TraceEvent {
  event_id: string;
  trace_id: string;
  span_id?: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  metadata?: Record<string, unknown>;
}

export interface AggregateMetrics {
  total_spans: number;
  success_rate: number;
  avg_duration: number;
  p50_duration: number;
  p95_duration: number;
  total_tokens: number;
  total_cost: number;
  error_count: number;
  rate_limit_count: number;
}

export interface FlowiseExecution {
  execution_id: string;
  workflow_id: string;
  trace_id: string;
  flowise_data: Record<string, unknown>;
  timestamp: string;
  status: string;
}

export interface TraceFilters {
  status?: string[];
  models?: string[];
  operations?: string[];
  dateRange?: {
    start: string;
    end: string;
  };
  search?: string;
}

export interface TracePagination {
  page: number;
  limit: number;
  total: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface TraceListResponse {
  traces: Trace[];
  pagination: TracePagination;
  filters: TraceFilters;
}

export interface DashboardMetrics {
  total_traces_24h: number;
  avg_latency: number;
  p50_latency: number;
  p95_latency: number;
  success_rate: number;
  error_rate: number;
  rate_limit_rate: number;
  total_tokens_24h: number;
  total_cost_24h: number;
  top_models: Array<{
    model: string;
    count: number;
    avg_cost: number;
  }>;
}
