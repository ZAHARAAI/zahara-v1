export interface ApiResponse<T = unknown> {
  data: T;
  success: boolean;
  message?: string;
  error?: string;
}

export interface ApiError {
  message: string;
  status: number;
  code?: string;
}

export interface AuthConfig {
  apiKey: string;
  baseUrl: string;
}

export interface ExportRequest {
  format: 'csv';
  filters?: {
    trace_ids?: string[];
    status?: string[];
    models?: string[];
    operations?: string[];
    search?: string;
    dateRange?: {
      start: string;
      end: string;
    };
  };
  options?: {
    includeSpans?: boolean;
    includeEvents?: boolean;
    includeMetadata?: boolean;
  };
}
