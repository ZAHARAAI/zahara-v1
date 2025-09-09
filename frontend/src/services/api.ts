import axios, { type AxiosInstance, type AxiosError } from 'axios';
import type { Trace, TraceListResponse, DashboardMetrics, FlowiseExecution } from '../types/trace';
import type { ApiResponse, ApiError, ExportRequest } from '../types/api';
import { generateDemoTraces, generateDemoDashboardMetrics } from '../utils/demoData';
import toast from 'react-hot-toast';

class ApiService {
  private client: AxiosInstance;
  private apiKey: string;
  private isDemoMode: boolean;

  constructor() {
    // Check if demo mode is enabled
    this.isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';
    
    // Default to demo API key as specified in requirements
    this.apiKey = import.meta.env.VITE_API_KEY || 'zhr_demo_clinic_2024_observability_key';
    
    this.client = axios.create({
      baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add auth interceptor
    this.client.interceptors.request.use((config) => {
      if (this.apiKey) {
        config.headers['X-API-Key'] = this.apiKey;
      }
      return config;
    });

    // Add response interceptor for error handling with toast notifications
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        const status = error.response?.status || 500;
        const message = (error.response?.data as Record<string, unknown>)?.message as string || error.message || 'An error occurred';
        
        // Show appropriate toast notifications based on error type
        switch (status) {
          case 401:
            toast.error('Authentication failed. Please check your API key.');
            break;
          case 429:
            toast.error('Rate limit exceeded. Please try again later.');
            break;
          case 403:
            toast.error('Access denied. Check your permissions.');
            break;
          case 404:
            toast.error('Resource not found.');
            break;
          case 500:
          case 502:
          case 503:
          case 504:
            toast.error('Server error. Please contact support if this persists.');
            break;
          default:
            if (status >= 400) {
              toast.error(message);
            }
        }
        
        const apiError: ApiError = {
          message,
          status,
          code: (error.response?.data as Record<string, unknown>)?.code as string,
        };
        return Promise.reject(apiError);
      }
    );
  }

  // Auth methods
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  getApiKey(): string {
    return this.apiKey;
  }

  // Demo mode methods
  isDemoModeEnabled(): boolean {
    console.log("DEmo ==== MODE running 2")
    return this.isDemoMode;
  }

  setDemoMode(enabled: boolean): void {
    this.isDemoMode = enabled;
  }

  // Trace endpoints
  async getTraces(params?: {
    page?: number;
    limit?: number;
    status?: string[];
    models?: string[];
    operations?: string[];
    search?: string;
    dateRange?: { start: string; end: string };
  }): Promise<TraceListResponse> {
    // Return demo data if demo mode is enabled
    if (this.isDemoMode) {
      return this.getDemoTraces(params);
    }

    const response = await this.client.get<TraceListResponse>('/traces', {
      params: {
        page: params?.page || 1,
        limit: params?.limit || 25,
        ...(params?.status && { status: params.status.join(',') }),
        ...(params?.models && { models: params.models.join(',') }),
        ...(params?.operations && { operations: params.operations.join(',') }),
        ...(params?.search && { search: params.search }),
        ...(params?.dateRange && {
          start_date: params.dateRange.start,
          end_date: params.dateRange.end,
        }),
      },
    });
    // The traces endpoint returns data directly, not wrapped in ApiResponse
    return response.data;
  }

  async getTrace(traceId: string): Promise<Trace> {
    // Return demo data if demo mode is enabled
    if (this.isDemoMode) {
      const demoTraces = generateDemoTraces(100);
      const trace = demoTraces.find(t => t.trace_id === traceId);
      if (!trace) {
        throw new Error(`Trace ${traceId} not found`);
      }
      return trace;
    }

    const response = await this.client.get<ApiResponse<Trace>>(`/traces/${traceId}`);
    return response.data.data;
  }

  async getTraceSpans(traceId: string): Promise<Trace['spans']> {
    // Return demo data if demo mode is enabled
    if (this.isDemoMode) {
      const trace = await this.getTrace(traceId);
      return trace.spans;
    }

    const response = await this.client.get<ApiResponse<Trace['spans']>>(`/traces/${traceId}/spans`);
    return response.data.data;
  }

  // Metrics endpoints
  async getDashboardMetrics(): Promise<DashboardMetrics> {
    // Return demo data if demo mode is enabled
    if (this.isDemoMode) {
      return generateDemoDashboardMetrics();
    }

    const response = await this.client.get<ApiResponse<DashboardMetrics>>('/traces/metrics/aggregate');
    return response.data.data;
  }

  // Export endpoints
  async exportTraces(request: ExportRequest): Promise<Blob> {
    const response = await this.client.post('/traces/export', request, {
      responseType: 'blob',
      headers: {
        'Accept': 'text/csv',
      },
    });
    return response.data;
  }

  // Flowise endpoints
  async getFlowiseExecutions(): Promise<FlowiseExecution[]> {
    const response = await this.client.get<ApiResponse<FlowiseExecution[]>>('/flowise/executions');
    return response.data.data;
  }

  // Health check
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    // Return demo health status if demo mode is enabled
    if (this.isDemoMode) {
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
      };
    }

    const response = await this.client.get<ApiResponse<{ status: string; timestamp: string }>>('/health');
    return response.data.data;
  }

  // Demo data generator with filtering and pagination
  private getDemoTraces(params?: {
    page?: number;
    limit?: number;
    status?: string[];
    models?: string[];
    operations?: string[];
    search?: string;
    dateRange?: { start: string; end: string };
  }): TraceListResponse {
    let demoTraces = generateDemoTraces(100);
    
    // Apply filters to demo data
    if (params?.status?.length) {
      demoTraces = demoTraces.filter(trace => 
        params.status!.includes(trace.status)
      );
    }
    
    if (params?.models?.length) {
      demoTraces = demoTraces.filter(trace => 
        params.models!.includes(trace.model)
      );
    }
    
    if (params?.operations?.length) {
      demoTraces = demoTraces.filter(trace => 
        params.operations!.includes(trace.operation)
      );
    }
    
    if (params?.search) {
      const searchTerm = params.search.toLowerCase();
      demoTraces = demoTraces.filter(trace => 
        trace.trace_id.toLowerCase().includes(searchTerm) ||
        trace.operation.toLowerCase().includes(searchTerm) ||
        trace.model.toLowerCase().includes(searchTerm)
      );
    }
    
    if (params?.dateRange) {
      const start = new Date(params.dateRange.start);
      const end = new Date(params.dateRange.end);
      demoTraces = demoTraces.filter(trace => {
        const traceDate = new Date(trace.timestamp);
        return traceDate >= start && traceDate <= end;
      });
    }
    
    // Apply pagination
    const page = params?.page || 1;
    const limit = params?.limit || 25;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedTraces = demoTraces.slice(startIndex, endIndex);
    
    return {
      traces: paginatedTraces,
      pagination: {
        page,
        limit,
        total: demoTraces.length,
        hasNext: endIndex < demoTraces.length,
        hasPrev: page > 1,
      },
      filters: {
        status: params?.status,
        models: params?.models,
        operations: params?.operations,
        dateRange: params?.dateRange,
        search: params?.search,
      },
    };
  }

}

// Export singleton instance
export const apiService = new ApiService();
export default apiService;
